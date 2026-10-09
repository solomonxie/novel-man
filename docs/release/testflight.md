# TestFlight external testing

App Store Connect → TestFlight → External Testing → **+** group → add the build. First build of a version goes through Beta App Review (~1 day).

## Test Information

Beta App Description (≤4000):

```
Novel Man turns a novel manuscript into a story bible: characters, places, relationships, structure and continuity. Import .txt, .md, .docx, .epub or .pdf from Files, "Open in…" or a link; read with sentence-tap highlights, notes and bookmarks; let it detect chapters and scenes, and build character and place profiles, mention timelines, a relation graph and continuity flags.

No account. The shelf starts empty: Add → Project Gutenberg downloads a public-domain book in seconds, or turn on Settings → Demo library → Demo mode for a made-up sample library (your own library untouched).

What's in this beta:
• Import and reader
• Chapter / scene detection with rename, merge, split
• Characters, places, timelines, relation graph, continuity flags
• Search public sources: Project Gutenberg, Standard Ebooks, Open Library
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
Tap Try a sample on the empty shelf. Open Characters, a profile and the relation graph; narrow the chapter range. Merge two chapters. Read a chapter, tap a sentence and add a note. Export to .epub and to .fountain. Report anything slow, wrong or confusing with a screenshot via TestFlight.
```
