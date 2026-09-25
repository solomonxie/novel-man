# Privacy Policy — Novel Man

_Last updated: 2026-09-24_

Novel Man does not collect, transmit, or store your personal data on any server we control. We operate no server, and there is no account to create.

## What the app stores
Your manuscripts, chapters, scenes, annotations, characters, places, terms, translations, reading progress, ratings and settings are kept in a database and in files on your device. They stay there unless you choose to back them up, export them, or send a passage somewhere.

## What leaves your device, and only if you ask
- **iCloud backup** — your notes, characters, structure, progress and settings are copied into the app's own folder in your iCloud Drive, in your Apple account and your storage quota. Manuscript text is not included. We have no access to it.
- **Cloud bucket backup** — a backup bundle is written to an S3-compatible bucket you provision with credentials you supply. We have no access to it.
- **Export / import** — files you create and place wherever you choose.
- **AI features** — off until you add a key. If you supply your own API key (OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, xAI or another supported vendor), the passages needed for the task you asked for — a chapter to translate, the text to analyze, a title to look up — are sent to that provider under your own account with them. Their privacy policy governs that data. Your key is stored on the device and never sent to us. Each run states what it will cost before it spends.
- **Book sources** — searching or downloading from Project Gutenberg, Standard Ebooks, arXiv, Open Library, Google Books or eBible.org sends only the search terms and the file request to that service. Standard Ebooks' feeds are a Patrons Circle benefit, so that source sends the email address you enter, to them, to authenticate. Looking a title up by name or ISBN asks Open Library and Google Books the same question, so that search term reaches Google. Importing from a link — including a GitHub repository of scripture — fetches the URL you paste, and nothing else.
- **Goodreads shelf** — brought over two ways. Their export file is a CSV you download yourself and choose from Files: it is read on the device and no request is made. A shelf's RSS address, pasted instead, is fetched from Goodreads — the address carries your own shelf key, and re-reading the shelf sends it again.
- **ESV passages** — the ESV cannot be redistributed, so it is looked up rather than downloaded: with a key of your own from Crossway, the reference you ask for is sent to their API and the answer is shown, not stored. Their terms and attribution travel with the text.

One request you do not ask for by name: importing a **PDF** loads pdf.js and MathJax from a public CDN (jsdelivr.net) the first time, because several megabytes of PDF engine are not worth bundling for a format most manuscripts are not in. The CDN sees the request, as any web server does; your file never leaves the device — it is parsed on it. PDF import is the one import that needs a network, and says so when there isn't one.

No part of this passes through us. There is no intermediary service.

## Security
API keys and bucket credentials are stored in the iOS Keychain, pinned to this device, so they never ride an iCloud Keychain sync and never appear in a backup or an export. Network requests use HTTPS.

## Analytics and advertising
None. No analytics SDK, no crash reporting, no advertising identifiers, no tracking across apps or websites.

## Children
The app is not directed at children and collects no data from anyone.

## Deleting your data
Deleting the app removes the local database and the files it kept. Backups you created in your own iCloud Drive or your own bucket remain yours to delete.

## Changes
Material changes to this policy will be published here with a new date.

## Contact
Questions or requests: https://github.com/solomonxie/novel-man/issues
