# TestFlight external testing

App Store Connect → TestFlight → External Testing → **+** group → add the build. First build of a version goes through Beta App Review (~1 day).

## Test Information

Beta App Description (≤4000):

```
Novel Man is an offline reader and manuscript analyzer. Import .txt, .md, .docx, .epub or .pdf from Files, "Open in…" or a link; read with sentence-tap highlights, notes and bookmarks; let it detect chapters and scenes, and build character and place profiles, mention timelines, a relation graph and continuity flags.

No account. The shelf starts empty: Add → Project Gutenberg downloads a public-domain book in seconds, or turn on Settings → Demo library → Demo mode for a made-up sample library (your own library untouched).

What's in this beta:
• Import and reader
• Chapter / scene detection with rename, merge, split
• Characters, places, timelines, relation graph, continuity flags
• Search public sources: Project Gutenberg, Standard Ebooks, arXiv, Open Library, eBible.org
• Export to many formats including screenplay (.fountain / .fdx)
• Backup to iCloud, a file or your own S3 bucket
• Optional AI translation and analysis with your own API key
• English and 中文
```

Feedback Email: `you@example.com`

## Contact Information

| Field | Value |
|---|---|
| First Name | TODO |
| Last Name | TODO |
| Phone number | TODO — yours, with country code (`+1 …`) |
| Email | `you@example.com` |

## Sign-In Information

Sign-in required: **off** (no account in the app). Leave User Name / Password blank.

Review Notes: paste the App Review Notes block from [listing.md](listing.md) if present.

## Per build: What to Test

```
Add a book from Project Gutenberg, read a chapter, tap a sentence to highlight and add a note. Open Characters and the relation graph. Merge two chapters. Export to .epub and to .fountain. Turn on Demo mode in Settings and off again. Report anything slow, wrong or confusing with a screenshot via TestFlight.
```
