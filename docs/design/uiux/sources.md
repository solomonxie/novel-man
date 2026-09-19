# Public sources — books you name instead of find

`src/sources/` + `app/source/`. A kind lists which sources it has: a bible
comes from eBible, a novel from Gutenberg or Standard Ebooks, a paper from
arXiv. The bible source's own page is [scripture.md](scripture.md).

```
 kind        source          what it searches            what arrives
 ─────────── ─────────────── ─────────────────────────── ─────────────────────
 scripture   eBible.org      every redistributable       USFM zip, structure
                             edition, cached with its    published
                             date, ⟳ to update
 novel       Project         79,000 out of copyright,    the EPUB without
 nonfiction  Gutenberg       kept index                  plates
             Standard        ~1,200 produced by hand,    the epub, spine and
             Ebooks          kept index — needs your     all
                             membership email
 textbook
 paper       arXiv           open-access papers, by      the PDF, through the
                             subject, title, author or   text extractor
                             category
 tutorial    —               a book written in a repo    whatever the file is
                             is already at a url
```

## One page per source  `app/source/<id>.tsx`

Same page each time: a field, what came back, and a row that ends the search by
choosing.

```
┌───────────────────────────────────────────┐
│ ‹  Project Gutenberg                      │
│ ┌───────────────────────────────────────┐ │
│ │ 🔍 A title or an author               │ │ ← runs on the return key, not
│ └───────────────────────────────────────┘ │   on every keystroke: a
│ Pride and Prejudice                    ›  │   stranger's API is not a
│   Jane Austen                             │   local index
│ Persuasion                             ›  │
│   Jane Austen                             │
└───────────────────────────────────────────┘
 states       Type what you are looking for, then Search.
              Nothing came back for that.
              Couldn't reach the source. Try again in a moment.
```

Choosing returns to Add, where the source's own terms are stated before the
one button that spends anything:

```
│ ABOUT THIS BOOK                           │
│ ┌───────────────────────────────────────┐ │
│ │ Pride and Prejudice      Gutenberg    │ │
│ │   Jane Austen                         │ │
│ └───────────────────────────────────────┘ │
│ en · Public domain in the USA. · 558 KB   │ ← read off the book's own feed,
│ The EPUB without plates — the same words, │   not guessed from the search
│ a fraction of the size.                   │
│            [[ Download ]]                 │
│ Nothing is fetched until you tap this.    │
```

## What Gutenberg hands over

It publishes OPDS — Atom, one entry per book, and on a book's own feed an
acquisition link per format carrying type, byte length and the rights line.
Every book exists twice, with plates and without: 24.8 MB and 558 KB of the
same words. This app reads the words, so the smaller one is taken. The url ends
`/ebooks/1342.epub.noimages`, an extension nothing downstream reads — so the
book's title names the file.

## What Standard Ebooks hands over, and what it asks first

Same corpus as Gutenberg, produced again by hand: typeset, proofread, and
marked up so the spine states what a chapter is rather than leaving it to
heuristics. For a reader that grades a book on its structure that is a
different quality of input, not a duplicate catalog.

The catch is the door. Verified, 2026-09-18:

```
 GET /feeds/opds                    401      /feeds/opds/all  401
 GET /feeds/atom/new-releases       200      15 newest, no acquisition links
 robots.txt                         Disallow: /ebooks/*/downloads/*   (User-agent: *)
```

So there is no open machine path to either the list or the files, and building
a download url out of a book's path is the crawl robots.txt forbids. Their own
gate page names the sanctioned one: feed access is a Patrons Circle benefit,
and *"enter your email address and leave the password field blank"* — HTTP
Basic, email as the username. Fetching an acquisition url the authorized feed
itself stated is that feed's purpose, not a crawl.

```
│ STANDARD EBOOKS                           │
│ ┌───────────────────────────────────────┐ │
│ │ Your Patrons Circle email             │ │
│ │   Their feeds are a membership        │ │
│ │   benefit, so the credential has to   │ │
│ │   be yours — this app has none to     │ │
│ │   give.              Not set          │ │
│ │ [ you@example.com ]  [[ Save ]]       │ │
│ │ The address stays on this device —    │ │
│ │ never synced, never in a backup.      │ │
│ └───────────────────────────────────────┘ │
│ Access comes with a donation to the       │
│ Patrons Circle, with producing an ebook   │
│ for them, or with a sponsorship.          │
```

- **The row says whose credential it is.** Until there is one it reads "Needs
  your email ›" and leads to the field, never to a fetch that would 401.
- **The root feed is a navigation feed**, so the catalog link is read out of it
  rather than hardcoded — a feed that moves its own list is still a feed that
  said where it went.
- **A book is published three ways**: the epub, an `_advanced` epub using
  features few readers implement, and a Kobo `.kepub.epub`. The plain one is
  taken. Size does not tell them apart the way it does at Gutenberg — all three
  are the same words.
- **The url and the licence are kept with the row** (`catalog.href`,
  `catalog.terms`). Gutenberg re-reads a book's own feed for both at the moment
  of asking; this list states them once and has no second feed to re-read, and
  deriving either would be guessing.
- **The credential is a secret like any other here**:
  `src/sources/standardEbooksEmail.ts`, keychain, this device only, never in a
  backup — kept apart from the client so the client stays a function of its
  inputs.

## What arXiv hands over

Its API answers in Atom — the same format Gutenberg's catalog speaks — and
states everything a paper page needs: authors, the date, the category it was
filed under first, the abstract, the DOI, and the PDF.

```
┌───────────────────────────────────────────┐
│ ‹  arXiv                                  │
│ ┌───────────────────────────────────────┐ │
│ │ 🔍 An author's name                   │ │
│ └───────────────────────────────────────┘ │
│ (Everything)( Title )( AUTHOR )( Category)│ ← the field is arXiv's own query
│ Deep Graph Infomax          cs.LG  2018 › │   language, not a filter over
│   Petar Veličković +4                     │   results
│ …                                         │
└───────────────────────────────────────────┘
```

- **A category is picked, never typed.** `cond-mat.stat-mech` is not something
  anyone spells from memory; choosing one runs the search on the spot.
- **A category is browsed newest-first; a query is ranked by relevance.** Typing
  someone's name in full is not a request for what they posted this morning.
- The metadata beats the file: what arXiv states — title, authors, year, id,
  category, abstract — is written onto the book after the import, because a
  PDF's first page is a guess at what the paper is called and arXiv is not.
- **The HTML rendering is taken over the PDF wherever one exists.** arXiv
  renders its own LaTeX, and that version has everything a text layer loses:
  real headings, figures that are still files, and the author's TeX in
  `alttext` on every formula. Measured on three real papers: 33, 25 and 4
  headings, 6–9 figures, and 32–40 displayed formulas each — none of which
  survives a PDF.
- **A PDF is still the fallback**, and still goes through the extractor and the
  preview gate. A paper old enough to have no HTML rendering arrives as its
  words: no figures, and formulas as whatever the text layer made of them.
  That is the best there is for a PDF, and the preview says so before it
  becomes a book.

## A source that answers questions instead of handing over books

`src/sources/esv.ts` + `src/sources/esvBook.ts`, with its key rows on the Add
page. The ESV is licensed by Crossway and may not be redistributed by anyone,
so it cannot be a book the app downloads: there is no file to fetch. What they
offer instead is an API and a free key of your own — so it goes on the shelf as
a book whose chapters arrive when opened.

```
┌───────────────────────────────────────────┐
│ ‹  The ESV                                │
│ ┌───────────────────────────────────────┐ │
│ │ 🔍 John 3:16, or Romans 8             │ │
│ └───────────────────────────────────────┘ │
│ JOHN 3:16                                 │ ← the reference the source
│ <the passage>                             │   understood, so you can see it
│                                           │   read you right
│ Scripture quotations are from the ESV®…   │ ← their notice, with their words
│ Fetched just now and not stored on this   │
│ device, which is what the licence allows. │
└───────────────────────────────────────────┘
 no key yet   The ESV can't be downloaded — Crossway licenses it… With a free
              key of your own you can look up any passage here.
              [ Get a free key ]  api.esv.org
              [ Paste your key ]   [[ Save the key ]]
              The key stays on this device — never synced, never in a backup.
 states       Add a key first. · That key was refused. · No passage by that
              reference. · Couldn't reach api.esv.org. This one needs a signal.
```

- **It is not a row beside the downloadable bibles.** Its own section says why
  there is no file, so a row that looked like the others is never promising a
  book it cannot give.
- **What is kept is a bounded cache, not a copy** — `passage_cache`, 500
  passages, oldest out, and never in a backup. It is what you read, kept so you
  can read it again on a plane; the shelf book itself carries no text.
- **The key is a secret like any other here**: keychain, this device only,
  never in a backup. `src/sources/esvKey.ts` is kept apart from the client so
  the client stays a function of its inputs and can be tested outside the app.
- Same shape would fit any licensed edition with an API. One is enough until a
  second is asked for.

## A book that is already at a url

No source, and none wanted: the link box takes it, and a GitHub page is
rewritten to the file it was showing.

```
 github.com/owner/repo/blob/main/docs/ch01.md
   ─▶ raw.githubusercontent.com/owner/repo/main/docs/ch01.md  ·  ch01.md
```

Same rule as a Google Doc link becoming a `.docx`: rewrite where the source
serves the same document in a format the importer already reads, and keep no
vendor-specific code downstream.

## The rules a source follows

- **The source states it; we don't guess it.** Licence, size, language and
  counts are the source's own fields, quoted.
- **Nothing is fetched until the button.** Searching is not downloading, and
  the line under the button says so.
- **A download is a queue job**, the same strip as a file import, with the same
  failures and the same retry.
- **A source is a row of data** (`src/sources/registry.ts`) plus its own module.
  Another one is not an edit to the Add page.
- **A credential is the reader's, never the app's.** A source behind one says
  so on its row and takes what the source asks for; a key shipped in the binary
  would be a secret in a public repo and one revocation away from breaking for
  everybody.
- **A search is not a source.** If the reader already knows the url, the link
  box is the whole feature.
