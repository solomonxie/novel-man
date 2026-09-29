#!/usr/bin/env python3
"""A web page, or a series of them, as one manuscript this app reads.

The app can fetch a link itself — Book › text source › From a link — but it
fetches one page, and what arrives is whatever the site served, reviewed on a
phone. A series is several pages, and a blog page is an article wrapped in a
masthead, a sidebar and a column of comments. So: convert on a Mac, read the
result, then hand the file to the phone.

Markdown is what comes out, because it is the format the app reads best. Its
importer marks heading levels from `#` and takes the book's title from the
first `# ` line; `detectChapters` then takes the shallowest level present as
the chapter level. One `#` per page in, one chapter per page out — nothing
inferred anywhere. A page that has no `<h1>` gets its `<title>` promoted to
one, so that stays true of every page in a series.

    python3 tools/fetch-manuscript.py https://example.com/part-1/ -o book.md
    python3 tools/fetch-manuscript.py URL1 URL2 URL3 -o series.md
    make manuscript URL="URL1 URL2"

The outline is printed as it goes, and that is the review. Headings that read
as furniture — "Recent Posts", "Categories", "Leave a Reply" — mean the page
kept its article somewhere neither `<article>` nor `<main>` marked, and what
to do about it is to delete those lines from the Markdown, which is why the
Markdown is a file you read before anything reads it.

Then AirDrop it, add the record on the phone, and attach it from the book's
own page.

Stdlib only — nothing to install.
"""

import argparse
import html
import html.parser
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# Long enough for a slow blog, short enough to fail rather than hang.
TIMEOUT = 30

# A page served to something that does not look like a browser is often a
# consent wall or a 403.
AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

# Never prose, wherever it sits. `header` is absent on purpose: on most themes
# it is what wraps the post's own `<h1>`. This mirrors FURNITURE in
# src/import/formats/html.ts, and the two should stay in step.
FURNITURE = re.compile(
    r"<(script|style|noscript|nav|aside|footer|form|svg|iframe|button|select|textarea)"
    r"(?=[\s/>])[^>]*>.*?</\1>",
    re.I | re.S,
)

COMMENTS = re.compile(r"<!--.*?-->", re.S)

# What a publishing platform puts around a post, named by the classes it puts
# there. `<main>` holds all of this on a WordPress page — the post, and then
# the share row, the author box, the comment thread — so the semantic tags
# alone are not enough here. The app cannot do this: matching a `<div>` to its
# own closing tag needs a scanner rather than a pattern, and its importer has
# only patterns. This runs on a Mac and its output is read before it is used,
# which is what makes the guess affordable.
TRIMMINGS = re.compile(
    r"comment|respond|sharedaddy|sd-sharing|share-|related|subscribe|newsletter"
    r"|carousel|modal|post-author|post-terms|post-date|breadcrumb|pagination"
    r"|site-header|site-footer|skip-link",
    re.I,
)

CONTAINER = re.compile(r"<(div|section)(?=[\s/>])[^>]*>", re.I)


def without_trimmings(markup: str) -> str:
    """Containers whose class or id says they are not the post.

    A `<div>` has to be matched to its own closing tag, which means counting
    the ones that open inside it — a pattern cannot, so this walks.
    """
    while True:
        for opening in CONTAINER.finditer(markup):
            if not TRIMMINGS.search(opening.group(0)):
                continue
            tag = opening.group(1).lower()
            depth = 1
            at = opening.end()
            step = re.compile(rf"<(/?){tag}(?=[\s/>])[^>]*>", re.I)
            while depth and (found := step.search(markup, at)):
                depth += -1 if found.group(1) else 1
                at = found.end()
            # Never closed: leave the page alone rather than truncate it.
            if depth:
                continue
            markup = markup[: opening.start()] + markup[at:]
            break
        else:
            return markup


BLOCK_TAGS = {
    "p", "div", "section", "article", "li", "dt", "dd", "blockquote",
    "pre", "figcaption", "td", "th", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
}


def fetch(url: str) -> str:
    # The fragment is the browser's business, not the server's, and some
    # servers answer a request carrying one with a 400.
    url = urllib.parse.urldefrag(url).url
    request = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def content_of(body: str) -> str:
    """The part of the page that is the thing, rather than the site around it.

    From the first opening tag to the *last* closing one, so a page carrying
    several posts comes through whole rather than stopping at the first.
    """
    for tag in ("article", "main"):
        opens = re.search(rf"<{tag}[^>]*>", body, re.I)
        closes = body.lower().rfind(f"</{tag}>")
        if opens and closes > opens.end():
            return body[opens.end():closes]
    return body


class Reader(html.parser.HTMLParser):
    """Markup in, one block of text per paragraph out, with headings marked."""

    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.blocks: list[tuple[int, str]] = []
        self.buffer: list[str] = []
        self.heading = 0
        self.prefix = ""
        self.pre = 0

    def flush(self):
        text = "".join(self.buffer)
        # Inside `<pre>` the whitespace *is* the content — it is indentation,
        # and a line break is a line. Fenced on the way out so the app shows
        # it as code rather than as a paragraph that lost its shape.
        text = f"```\n{text.strip()}\n```" if self.pre else re.sub(r"\s+", " ", text).strip()
        self.buffer = []
        if text.strip("` \n"):
            self.blocks.append((self.heading, f"{self.prefix}{text}"))
        self.heading = 0
        self.prefix = ""

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            source = dict(attrs).get("src")
            if source:
                alt = dict(attrs).get("alt") or ""
                self.flush()
                self.blocks.append((0, f"![{alt}]({urllib.parse.urljoin(self.base, source)})"))
            return
        if tag == "br":
            self.buffer.append("\n" if self.pre else " ")
            return
        if tag in BLOCK_TAGS:
            self.flush()
        if tag == "pre":
            self.pre += 1
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.heading = int(tag[1])
        elif tag == "li":
            self.prefix = "- "
        elif tag == "blockquote":
            self.prefix = "> "

    def handle_endtag(self, tag):
        if tag == "pre":
            self.flush()
            self.pre = max(0, self.pre - 1)
        elif tag in BLOCK_TAGS:
            self.flush()

    def handle_data(self, data):
        self.buffer.append(data)

    def close(self):
        super().close()
        self.flush()


def title_of(page: str) -> str:
    found = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    return html.unescape(re.sub(r"\s+", " ", found.group(1))).strip() if found else ""


def markdown(
    blocks: list[tuple[int, str]], fallback: str, lift: bool
) -> tuple[str, list[tuple[int, str]]]:
    """The blocks as Markdown, and the outline to print for review.

    A page with no `<h1>` gets one from its `<title>`: the app reads the
    shallowest heading level present as the chapter level, so a series where
    one page starts at `h1` and the next at `h2` would come out as one chapter
    holding the lot.

    `lift` is what makes one page into a book rather than one chapter.
    `detectChapters` wants at least two headings at the shallowest level
    before it will use them at all, and a single article has exactly one
    `<h1>` — so on its own it falls through to a single untitled chapter of
    thirty thousand characters. Lifting its sections to sit beside its title
    gives that level the two it needs, and the chapters become the sections,
    which is what the article's own contents say they are.

    Lifting is by the shallowest section on the page rather than by one
    level: a theme that writes its sections as `<h3>` is as common as one
    that writes them as `<h2>`, and shifting by a fixed amount moves the
    first to `<h2>`, which is still nothing the chapter level can see. What
    is preserved either way is the depth *between* them.

    And not at all where the page already has two headings at its shallowest
    level — a long reference document is written as thirty sections and two
    hundred subsections, and that top level is already the chapter level.
    Lifting there would only flatten the two into one.
    """
    lines: list[str] = []
    outline: list[tuple[int, str]] = []
    titled = any(level == 1 for level, _ in blocks)
    if not titled and fallback:
        lines.append(f"# {fallback}")
        outline.append((1, fallback))
    levels = [level for level, _ in blocks if level]
    shallowest = [level for level in levels if level == min(levels or [1])]
    sections = [level for level, _ in blocks[1 if titled else 0:] if level > 1]
    base = min(sections) - 1 if lift and sections and len(shallowest) < 2 else 0
    first = True
    for level, text in blocks:
        if level:
            # The page's own title keeps level 1; the sections under it come up
            # to sit beside it, keeping the distances between themselves.
            own = first and level == 1
            shown = 1 if own else max(1, level - base)
            first = first and level != 1
            lines.append(f"{'#' * shown} {text}")
            outline.append((shown, text))
        else:
            lines.append(text)
    return "\n\n".join(lines), outline


def convert(url: str, lift: bool) -> tuple[str, list[tuple[int, str]], int]:
    page = fetch(url)
    body = re.search(r"<body[^>]*>(.*)</body>", page, re.I | re.S)
    cleaned = COMMENTS.sub("", content_of(body.group(1) if body else page))
    # Twice: a `<nav>` inside a `<footer>` survives one pass, because the
    # footer's own match consumed it before the nav pattern was tried.
    for _ in range(2):
        cleaned = FURNITURE.sub("", cleaned)
    cleaned = without_trimmings(cleaned)
    reader = Reader(url)
    reader.feed(cleaned)
    reader.close()
    text, outline = markdown(reader.blocks, title_of(page), lift)
    return text, outline, sum(len(block.split()) for _, block in reader.blocks)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "manuscript"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("urls", nargs="+", metavar="URL")
    parser.add_argument("-o", "--out", help="where to write it; default is the first page's title")
    parser.add_argument(
        "--chapters",
        choices=("auto", "pages", "sections"),
        default="auto",
        help="what a chapter is: one page each, or one section each. "
        "auto means pages for a series and sections for a single page.",
    )
    args = parser.parse_args()
    lift = args.chapters == "sections" or (args.chapters == "auto" and len(args.urls) == 1)

    pieces: list[str] = []
    first = ""
    for url in args.urls:
        try:
            text, outline, words = convert(url, lift)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as problem:
            print(f"{url}\n  failed: {problem}", file=sys.stderr)
            return 1
        if not text.strip():
            print(f"{url}\n  nothing to read on this page", file=sys.stderr)
            return 1
        first = first or (outline[0][1] if outline else "")
        pieces.append(text)
        # The headings that will become chapters, and a count of the rest. A
        # reference document has two hundred subsections under thirty
        # sections; printing all of them is not a review anybody can read.
        chapters = [text for level, text in outline if level == 1]
        deeper = len(outline) - len(chapters)
        print(f"{url}  —  {words} words", file=sys.stderr)
        for line in chapters:
            print(f"  {line}", file=sys.stderr)
        if deeper:
            print(f"  … and {deeper} headings under them", file=sys.stderr)

    out = pathlib.Path(args.out).expanduser() if args.out else pathlib.Path(f"{slug(first)}.md")
    out.write_text("\n\n".join(pieces) + "\n", encoding="utf-8")
    counted = sum(text.count("\n# ") + text.startswith("# ") for text in pieces)
    print(f"\n{out}  —  {counted} chapter(s). Read it, then AirDrop it.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # Piped into something that stopped reading. The file is the point;
        # dying halfway through the outline used to lose it.
        sys.exit(0)
