#!/usr/bin/env python3
"""A Douban reader's own shelves, as a CSV this app already knows how to read.

Douban retired its API and publishes no export, and the interests RSS is ten
mixed items with no paging. What is left is the shelf pages themselves —
`book.douban.com/people/<id>/collect|do|wish` — which a public profile serves
to anyone who asks like a browser. They carry the rating, the short comment,
the date and the tags: everything the app wants and no catalog has.

The columns written are Goodreads' export columns, so `booksFromExport` in
src/sources/goodreads.ts reads the result with no change to the app: pick the
file under Add › Goodreads › Export file.

    python3 tools/douban-shelf.py collect.zero -o douban.csv

Stdlib only — nothing to install.
"""

import argparse
import csv
import html
import json
import re
import socket
import sys
import time
import pathlib
import urllib.error
import urllib.request

SHELVES = {
    # Douban's path, and the exclusive shelf Goodreads would call it.
    "collect": "read",
    "do": "currently-reading",
    "wish": "to-read",
}
PER_PAGE = 15
COLUMNS = [
    "Book Id", "Title", "Author", "Original Publication Year", "Year Published",
    "ISBN13", "ISBN", "My Rating", "My Review", "Private Notes",
    "Exclusive Shelf", "Date Read", "Date Added", "Bookshelves",
]
BROWSER = {
    # Douban answers a request without these with a bare nginx 403.
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

ITEM = re.compile(r'<li class="subject-item">(.*?)</li>', re.S)
SUBJECT = re.compile(r"book\.douban\.com/subject/(\d+)")
TITLE = re.compile(r'<h2>.*?title="([^"]*)"', re.S)
PUB = re.compile(r'<div class="pub">(.*?)</div>', re.S)
RATING = re.compile(r'class="rating(\d)-t"')
DATE = re.compile(r'<span class="date">(.*?)</span>', re.S)
COMMENT = re.compile(r'<p class="comment[^"]*"[^>]*>(.*?)</p>', re.S)
TAG = re.compile(r'<span class="tag">(.*?)</span>', re.S)
ISBN_ON_PAGE = re.compile(r"ISBN:</span>(.*?)<br", re.S)
TOTAL = re.compile(r'<span class="subject-num">\s*[\d\-]+\s*(?:&nbsp;|\s)*/(?:&nbsp;|\s)*(\d+)')
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)\b")


def text(raw):
    """Their markup to a line of prose: tags out, entities back, spaces tidied."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()


def fetch(url, cookie, delay, attempts=4):
    request = urllib.request.Request(url, headers=dict(BROWSER))
    if cookie:
        request.add_header("Cookie", cookie)
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=45) as answer:
                return answer.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as problem:
            # 403 is how Douban rate-limits as well as how it hides a private
            # shelf, so it is worth backing off before believing it.
            if problem.code not in (403, 429, 500, 502, 503) or attempt == attempts:
                raise
            wait = delay * 4 * attempt
            print(f"  {problem.code}, waiting {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.URLError, socket.timeout, TimeoutError) as problem:
            # Under load Douban stops answering the handshake rather than
            # refusing the request, which arrives as a timeout, not a status.
            if attempt == attempts:
                raise
            wait = delay * 4 * attempt
            print(f"  {problem}, waiting {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def book_from(chunk, shelf):
    found = SUBJECT.search(chunk)
    title = TITLE.search(chunk)
    if not found or not title:
        return None
    pub = text(PUB.search(chunk).group(1)) if PUB.search(chunk) else ""
    parts = [part.strip() for part in pub.split("/") if part.strip()]
    stars = RATING.search(chunk)
    when = DATE.search(chunk)
    day = DAY.search(text(when.group(1))) if when else None
    comment = COMMENT.search(chunk)
    tags = TAG.search(chunk)
    # "标签: 小说 日本" — the label is theirs, the words after it are the shelves.
    shelves = text(tags.group(1)).split(":", 1)[-1].split() if tags else []
    # The publisher line is author / translator / publisher / date / price, and
    # only the first field and the year in it are reliably one thing each.
    year = ""
    for part in parts[1:]:
        match = YEAR.search(part)
        if match:
            year = match.group(1)
            break
    read = day.group(0) if (day and shelf == "collect") else ""
    return {
        "Book Id": found.group(1),
        "Title": html.unescape(title.group(1)).strip(),
        "Author": parts[0] if parts else "",
        "Original Publication Year": year,
        "Year Published": year,
        "ISBN13": "",
        "ISBN": "",
        "My Rating": stars.group(1) if stars else "0",
        "My Review": text(comment.group(1)) if comment else "",
        "Private Notes": "",
        "Exclusive Shelf": SHELVES[shelf],
        "Date Read": read,
        "Date Added": day.group(0) if day else "",
        "Bookshelves": ", ".join(shelves),
    }


def isbn_from(page):
    """`<span class="pl">ISBN:</span> 9787302255659<br/>`, and nothing else is it."""
    found = ISBN_ON_PAGE.search(page)
    digits = re.sub(r"[^0-9Xx]", "", found.group(1)) if found else ""
    return digits.upper() if len(digits) in (10, 13) else ""


def add_isbns(rows, cookie, delay, cache_path):
    """The one thing a shelf page does not carry, a subject page at a time.

    What has been found is written down as it goes: this is one request per
    book, and a run interrupted at book 180 should not start again at one.
    """
    cache = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"  {len(cache)} already looked up", file=sys.stderr)
    # Editions differ, but a book that appears on two shelves is one request.
    wanted = [row for row in rows if row["Book Id"] not in cache]
    for at, row in enumerate(wanted, 1):
        book = row["Book Id"]
        try:
            cache[book] = isbn_from(
                fetch(f"https://book.douban.com/subject/{book}/", cookie, delay)
            )
        except Exception as problem:  # noqa: BLE001 — a lost ISBN is not a lost book
            print(f"  {row['Title'][:24]}: {problem}", file=sys.stderr)
            cache[book] = ""
        if at % 10 == 0 or at == len(wanted):
            cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"  isbn: {at}/{len(wanted)}", file=sys.stderr)
        time.sleep(delay)
    for row in rows:
        isbn = cache.get(row["Book Id"], "")
        # Their field is whichever was printed on the book; the export has a
        # column for each, and the app reads the 13 first.
        row["ISBN13"] = isbn if len(isbn) == 13 else ""
        row["ISBN"] = isbn if len(isbn) == 10 else ""
    return sum(1 for row in rows if row["ISBN13"] or row["ISBN"])


def read_shelf(person, shelf, cookie, delay):
    """One shelf, page by page, until a page adds nothing new."""
    books, seen, claimed = [], set(), None
    start = 0
    while True:
        url = (
            f"https://book.douban.com/people/{person}/{shelf}"
            f"?start={start}&sort=time&rating=all&filter=all&mode=grid"
        )
        page = fetch(url, cookie, delay)
        if claimed is None:
            total = TOTAL.search(page)
            claimed = int(total.group(1)) if total else 0
            if not claimed:
                return [], 0
        fresh = 0
        for chunk in ITEM.findall(page):
            book = book_from(chunk, shelf)
            if not book or book["Book Id"] in seen:
                continue
            seen.add(book["Book Id"])
            books.append(book)
            fresh += 1
        print(f"  {shelf}: {len(books)}/{claimed}", file=sys.stderr)
        if not fresh:
            break
        start += PER_PAGE
        if start >= claimed:
            break
        time.sleep(delay)
    return books, claimed


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("person", help="the id in your profile url: douban.com/people/<this>/")
    parser.add_argument("-o", "--out", default="douban.csv")
    parser.add_argument(
        "--shelf", action="append", choices=list(SHELVES),
        help="only these shelves; default is all three",
    )
    parser.add_argument(
        "--cookie-file",
        help="a file holding your Douban cookie header, for a private profile. "
             "Keep it out of the repo — it is a login.",
    )
    parser.add_argument("--delay", type=float, default=1.5, help="seconds between pages")
    parser.add_argument(
        "--isbn", action="store_true",
        help="also fetch each book's subject page for its ISBN — one request per "
             "book, so minutes rather than seconds, kept in <out>.isbn.json",
    )
    args = parser.parse_args()

    person = args.person.strip().strip("/").split("/")[-1].split("?")[0]
    cookie = None
    if args.cookie_file:
        with open(args.cookie_file, encoding="utf-8") as handle:
            cookie = handle.read().strip()

    rows = []
    for shelf in args.shelf or list(SHELVES):
        try:
            books, claimed = read_shelf(person, shelf, cookie, args.delay)
        except urllib.error.HTTPError as problem:
            hint = " — private profile? try --cookie-file" if problem.code == 403 else ""
            print(f"{shelf}: HTTP {problem.code}{hint}", file=sys.stderr)
            return 1
        if claimed and len(books) < claimed:
            # Douban counts subjects it has since deleted or merged.
            print(f"  {shelf}: {claimed - len(books)} of {claimed} no longer listed",
                  file=sys.stderr)
        rows.extend(books)
        time.sleep(args.delay)

    if args.isbn:
        # Douban stalls a run of subject pages that a run of shelf pages gets
        # away with, so this leg is slower whatever --delay says.
        found = add_isbns(rows, cookie, max(args.delay, 2.0),
                          pathlib.Path(f"{args.out}.isbn.json"))
        print(f"  isbn: found for {found} of {len(rows)}", file=sys.stderr)

    if not rows:
        print("no books found — is the profile public, and is that the right id?",
              file=sys.stderr)
        return 1

    with open(args.out, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    rated = sum(1 for row in rows if row["My Rating"] != "0")
    reviewed = sum(1 for row in rows if row["My Review"])
    print(f"{len(rows)} books, {rated} rated, {reviewed} with a comment → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
