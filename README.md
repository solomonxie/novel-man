# Turn a Manuscript Into a Story Bible

> 🚧 Work in progress. Import, chapter detection and the reader run; the AI,
> export and cloud features below are still design only.

Drop in a novel. Read it properly, and get back its structure, its cast, and
— eventually — the visual material a screen adaptation needs.

An offline-first iOS/Android app for novel writers, editors and adapters.
English and Chinese. Your manuscript never leaves the device unless you send
it somewhere.


## What it does

**Bookshelf** — every book gets one page that is the whole app for that book:
read it, fix its structure, analyse it, export it. Nothing about a book lives
anywhere else.

**Import from wherever it already is** — the system file picker (which brings
iCloud, Google Drive, Dropbox and OneDrive with it), and in time "Open in…"
from any other app, a pasted link, or your own cloud backup. `.txt`, `.md`,
`.docx` and `.epub` read today; `.html` and `.pdf` are next. A Google Doc
link will come in as `.docx`, with no Google-specific detour.

**Structure, detected then corrected** — chapters and scenes found by
heuristics first (heading styles, `Chapter 12`, `第十二章`, `* * *`, epub
spine), AI only where the heuristics are unsure. Rename, merge, split and
reorder; your corrections survive every re-run.

**Reader mode** — a real reading experience, not a preview. Tap any single
sentence to copy, highlight, note or share it — no drag handles. Themes, font
size, paginated or scrolling, progress that follows you. Annotations anchor to
the text itself, so they survive a re-split.

**Export** — `.txt`, `.md`, `.docx`, `.epub`, `.html`, `.pdf`, plus your
annotations as `.md`/`.csv`. Always rendered from the current structure, so
what comes out matches what you were reading.

**Backup** — one bundle format, two destinations: a file you keep, or a cloud
bucket you own. Per book, so a single book can come back without touching the
rest. Restore never overwrites — it creates something new and tells you what
it couldn't place.

**Planned** — AI character dossiers and per-chapter mention timelines, an
interactive relation graph, generated portraits, continuity checks
("grey eyes in ch.3, green in ch.20"), screenplay conversion, and storyboards
(分镜) on the way to manga and partial animation.


## How it's built

React Native + Expo + TypeScript, one codebase for iOS and Android.

- **Local-first.** Manuscripts, structure, annotations and generated assets
  live in on-device SQLite. No account, no server, no sign-up.
- **Optional sync.** Opt in to a private S3-compatible bucket *you own*. Off
  by default; manual by default.
- **Bring your own AI key.** OpenAI, Anthropic, Gemini and friends — usage
  bills to your account, keys stay in the device keychain and never appear in
  a backup or a sync payload. With no key configured the app degrades to its
  non-AI behaviour rather than erroring.
- **Bilingual from the first screen.** English and 简体中文, English default.
  The interface language and the manuscript's language are separate settings.

Every expensive AI pass is opt-in per run, states its cost before it spends,
and caches its results. Nothing analyses a 300,000-word manuscript behind
your back.


## Design docs

- [Design](docs/design/DESIGN.md) — problem, scope, options, decisions
- [UI/UX](docs/design/UIUX_DESIGN.md) — screens, flows, states, copy
- [Implementation plan](docs/design/IMPLEMENT_PLAN.md) — phased task list


## Running it

```
npm install
npx expo start --ios     # or --android
```

Opens in Expo Go — no native build needed. Import a `.txt`, `.md`, `.docx`
or `.epub` from Files and it lands on the shelf with its chapters detected.


## Status

Phases 1-5 of the [implementation plan](docs/design/IMPLEMENT_PLAN.md) are
runnable: bilingual shell, import pipeline, chapter detection, shelf, book
page, and a reader with sentence-level highlighting. PDF import, the
structure editor, notes, export, AI and cloud are not built yet — the plan
marks exactly what landed and what each partial task still owes.
