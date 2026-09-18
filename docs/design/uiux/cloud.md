# AI keys, cloud, work queue

All three are sections of the shelf page (`shelf.md`), drawn here in full.

## AI keys  `src/settings/AiKeys.tsx` · `app/ai-key/[id].tsx`

```
 AI KEYS                                    Fallback ▾   ← order IS the
 Used by chapter detection and analysis. Keys never        fallback order
 leave this device, including in backups.
 ┌─────────────────────────────────────────────────┐
 │ OpenAI                         ↑    ↓     ⋯     │ ← ⋯ holds Delete:
 │ 128 requests · gpt-4o                       ›   │   visible, not a hidden
 ├─────────────────────────────────────────────────┤   long-press
 │                  + Add AI Key                   │ ← centred accent link
 └─────────────────────────────────────────────────┘
 No keys yet.
 Fallback ▾ ⇒ ( SEQUENTIAL )( Round robin )
              Sequential stays on the first key until it errors; round
              robin spreads every call.
```

```
 add — a half sheet, and Save is the test
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Add AI Key                          ( Cancel )
 Vendor                               OpenAI ▾
 API key            ••••••••••••
 Don't have a OpenAI key? Get one →
 Requests are billed to your own OpenAI account.
                  [[ Save ]]
 ⟳ Testing the key…        ← inline, never an alert
 ⊗ <the vendor's own error code, verbatim> + a friendly line
 a failed attempt is kept as a draft — a 40-character secret never gets
 retyped
```

One key's page (`ai-key/[id]`) lists every request made with it, newest
first; tapping one (`ai-request/[id]`) shows the prompt and the reply.

## Cloud backup  `src/settings/Cloud.tsx`

```
 CLOUD BACKUP                                      ＋
 ┌─────────────────────────────────────────────────┐
 │ iCloud Drive                            ─●      │ ← zero setup, and the
 │ Files → iCloud Drive → Novel Man · 4m ago       │   only destination that
 ├─────────────────────────────────────────────────┤   outlives the app
 │ my-manuscripts        bucket/prefix         ›   │
 └─────────────────────────────────────────────────┘
 iCloud keeps what you made — notes, characters, progress, settings —
 and not the books.
 None connected.
 blocked   iCloud Drive is off on this device
           Settings → your name → iCloud → iCloud Drive → turn on
           This build of the app isn't signed for iCloud.
           Setting up. Try again shortly.
 waiting   3 books are waiting for their file
           Import the same file again and its notes, profiles and
           chapters come back with it.
```

```
 NEW CONNECTION
 Provider                                     S3 ▾
 Name · Endpoint · Bucket · Folder · Region
 Access key · Secret key
 ( Paste credentials from the clipboard )
 Paste a console block, an .env chunk or a CSV row and the fields fill
 themselves in.
              [[ Save and test ]]      ( Cancel )
 Saving makes a real request. A bucket that can't be listed isn't saved.
```

```
 CONNECTION
 Sync                                      Manual ▾
 Manual by default. Automatic syncs run when you open the app, never
 in the background.
 ( Back up now )        [ Delete connection ]!
 QUEUE (12)                                   Clear
 Upload bundle                              Waiting
 Upload bundle                               Failed     ( Retry )
 ( Pause )
```

## A file you keep  `src/settings/Backup.tsx`

```
 BACKUP
 ┌─────────────────────────────────────────────────┐
 │ Export the whole library                    ›   │
 │ Restore from a file…                        ›   │
 └─────────────────────────────────────────────────┘
 One .zip file holds your books, structure, notes and profiles — open it
 anywhere. It never contains an AI key.
 restore  Restoring adds books; it never overwrites what's already here.
          Restored 12 books.
          Already on your shelf, restored as copies: Ash Lane
          Ash Lane had no text and was skipped.
          Ash Lane restored without its image.
 ⊗ That isn't a Novel Man backup.
 ⊗ This backup was made by a newer version (v9). Update the app first.
```

## Work queue  `src/ui/WorkQueue.tsx`

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Work                                    ( Pause everything )
 Analyze chapter 12         7 of 47    costs money   ( Stop )
 Find the cast in chapter 13      Waiting  on device
 Summarize the book            12 of 12 done
 3 failed                                   ( Retry )
 4 more waiting        12 more not shown
 empty  Nothing running.
 Work carries on while you read, and picks up where it left off if you
 close the app. Finished chapters are kept.
 stopped  Stopped. What had already finished was kept.
 [ Stop everything ]!
```

## Cloud library — pulling one book back  `app/settings/cloud-library.tsx`

Not a file browser: a list of the bundles this connection holds.

```
┌───────────────────────────────────────────┐
│ ‹  Archive                              ⋯ │ ← ⋯ : Sync ▸ · Back up now ·
│ s3://my-bucket/novels/  ·  12 books       │      Queue · Delete connection
│ ┌───────┐ The Second Step                 │
│ │       │ 312k words · backed up Sep 14 ✓ │ ← ✓ = already on this device
│ ├───────┤ Ash Lane                        │
│ │       │ 98k words · Sep 2          [Get]│ ← one tap to pull it down
│ └───────┘                                 │
└───────────────────────────────────────────┘
```

Bundles are a day each — `library-2026-09-18.zip`, `books/<id>-2026-09-18.zip` —
so the list is one row per day, newest first, and the whole library and the
per-book bundles are two sections rather than one mixed list. A bundle written
before backups were named for their month keeps its own name in the row.

Pulling one runs the same restore path as a local bundle: confirm, create
new, report what couldn't be placed.
