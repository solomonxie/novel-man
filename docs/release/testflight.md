# TestFlight external testing

App Store Connect → TestFlight → External Testing → **+** group → add the build. First build of a version goes through Beta App Review (~1 day).

## Test Information

Beta App Description (≤4000):

```
Novel Man turns a novel manuscript into a story bible: characters, places, relationships, chapter structure and continuity, found in the text and kept in step with each new draft.

No account. On the empty shelf, "Try a sample" downloads Pride and Prejudice from Project Gutenberg with a prepared analysis, so the cast, graph and continuity screens have content without an AI key. Or import your own .docx, .epub, .txt, .md or .pdf.

What's in this beta:
• Character and place profiles with per-chapter mention timelines
• A relationship graph filtered by chapter range
• Continuity flags
• Chapter and scene detection with rename, merge and split that survive re-import
• Glossary-bound translation and screenplay export (.fountain / .fdx)
• Read and annotate the draft: highlights, notes, bookmarks
• Backup to iCloud, a file or your own storage bucket
• Optional AI analysis with your own API key
• English and 简体中文
```

Feedback Email, contact: same as the App Review contact in App Store Connect (not kept in this public repo).
Privacy Policy URL: as in [listing.md](listing.md).

## Sign-In Information

Sign-in required: **off** (no account in the app).

## Per build: What to Test

```
Tap Try a sample on the empty shelf. Open Characters, a profile and the relation graph; narrow the chapter range. Merge two chapters. Read a chapter, tap a sentence and add a note. Export to .epub and to .fountain. Report anything slow, wrong or confusing with a screenshot via TestFlight.
```
