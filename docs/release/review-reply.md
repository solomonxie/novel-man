# Reply to App Review — 4.3 Spam / 4.2.6

Rejection of 1.0 (2026-10), Guidelines 4.3(a), 4.3(b), 4.2.6. Paste into **Resolution Center** when the new build is attached and resubmitted. Write it in your own voice before sending; edit anything below that isn't accurate.

Confirm before sending: Q5–7 assume Novel Man is the only app on the account. If a separate China record was ever created, remove it from sale first and say so in Q7.

```
Hello, and thank you for the review.

We made substantial changes before resubmitting, and we have answered all nine questions below.

WHAT CHANGED IN THIS BUILD
- Focus. The app is now presented as what it is: a tool that turns a novel manuscript into a story bible (the cast, places, relationships, structure and continuity of a book). The listing name, subtitle, description, keywords, category and screenshots were rewritten around that. The previous listing led with "book reader", which misrepresented the app.
- Scope. Features that made it look like a general reader or library app are not offered in this version: Bible downloads (eBible.org, ESV), arXiv papers, the Goodreads importer, and vocabulary flash cards.
- A sample you can review without an API key. On an empty shelf, "Try a sample" downloads Pride and Prejudice from Project Gutenberg and attaches a prepared analysis: character profiles, a relationship graph, places and continuity flags. Per-chapter mention counts are calculated on the device. The review notes walk through it in about a minute.

1. What the app does and the problem it solves
A novel of 100,000 to 500,000 words has hundreds of named people, places and invented terms, and its chapters change many times. Writers, editors and adapters keep track of all this by hand in spreadsheets, wikis or index cards (a "story bible"). That record falls out of date as soon as the manuscript changes.
Novel Man reads the manuscript itself (.docx, .epub, .txt, .md or .pdf) and builds that record from the text:
- It finds the chapters and scenes on the device using heading styles, "Chapter 12" or "第十二章", scene breaks and the epub spine. The user can rename, merge, split and reorder them, and those corrections survive a re-import of a later draft.
- It keeps a profile for each character and place, with user-defined fields (house, species, rank), aliases and a portrait. It counts per-chapter mentions on the device, so you can see where a character disappears for ten chapters.
- It draws a relationship graph that can be filtered to a range of chapters, showing who is tied to whom at that point in the story.
- It raises continuity flags ("grey eyes in chapter 3, green in chapter 20") for the author to review. It never changes the text.
- It translates with a glossary the machine translation must follow, so a character's name is the same in chapter 1 and chapter 80. Corrections are kept and reused.
- It exports the manuscript as a screenplay (.fountain or .fdx) for adaptation, and exports the cast as a character bible.
Reading and annotating are there because you check a manuscript by reading it, but the app is about the structure underneath the text.

2. Intended users
- Novelists working on long or serialised fiction (web novels, fantasy, series) whose casts outgrow their memory.
- Developmental editors and beta readers who need to report continuity problems against chapter numbers.
- Translators of fiction who need names and terms to stay consistent across a whole book.
- Screenwriters and producers adapting a novel, who need its scenes and cast in screenplay form.
The app supports English and Simplified Chinese because Chinese web fiction, with casts in the hundreds, is where the problem is most severe.

3. The gap in the market
- Reading apps (Apple Books, Kindle, readers for any format) display text. They do not model who is in it or how the cast changes from chapter to chapter.
- Writing apps (Scrivener, Ulysses, Campfire, World Anvil) hold a story bible, but the author has to type every entry by hand, and nothing connects those entries to the manuscript. A changed eye colour in chapter 20 goes unnoticed.
- Novel Man starts from the finished or in-progress manuscript and builds the bible from the text: mention timelines, a chapter-ranged relationship graph, continuity flags and a glossary-bound translation. It keeps that record linked to the text as drafts change. We know of no iOS app that does this on the device, without an account or a server.

4. Beta testing
There was no external TestFlight group before the first submission. The developer used the app daily on their own iPhone from 16 September 2026 on real manuscripts, and fixed the problems that came up. Examples now in the production build:
- Selecting text across paragraphs lagged and flickered. Selection was rewritten to be immediate.
- The reading bars covered the first line of a chapter. They now stay out of the way.
- "Continue" opened a chapter's notes instead of the page where reading stopped. It now opens the page.
- Search scanned 78,000 catalogue rows before the user had typed anything, which made the page slow to open. It now waits for a query.
- Moving through a long book with the scroll bar was hard to see and use. The scroll bar was redrawn.
- On iPadOS 27 the app crashed at launch in compatibility mode. It now uses the scene lifecycle.
[Add here any external TestFlight feedback gathered before resubmitting.]

5. Standalone or part of a suite
Standalone. It is the only app on this developer account.

6. Could it be an in-app purchase or addition to another app on the account?
No. There is no other app on this developer account.

7. Shared code, frameworks or assets with other apps on the account
None. There are no other apps on the account. The one binary serves every storefront. In mainland China it offers only AI providers that are filed there and no scripture content, decided at runtime from the StoreKit storefront. There is no second app or variant.

8. Shared codebase, SDK or content library with third-party apps
No. The app is written from scratch for this product. It uses only standard open-source frameworks (React Native, Hermes, SQLite through op-sqlite) and no app template, white-label kit or app-generation service. Book text comes only from the user's own files or, when the user searches for it, from public-domain catalogues such as Project Gutenberg. Nothing is bundled except a small prepared analysis for the sample book.

9. Built for a client or third party?
No. The concept, branding and code are the developer's own, and it is submitted under the developer's own account. No client, partner or template provider is involved.

Thank you for taking another look.
```
