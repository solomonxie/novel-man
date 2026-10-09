# Publishing Novel Man — step by step

Every field below is ready to paste. `TODO` = only you can supply it.
App Store Connect paths start at **Apps → Novel Man → Distribution →**.

| | |
|---|---|
| Bundle ID | `com.example.novelman` |
| SKU | `novelman-ios` |
| Version | `1.0` (`MARKETING_VERSION`) |
| Build | timestamp, set by `npm run release:ios` |
| Devices | iPhone only (`TARGETED_DEVICE_FAMILY = 1`) — no iPad screenshots needed |
| Min iOS | 16.4 |
| Privacy Policy URL | `https://github.com/solomonxie/novel-man/blob/master/docs/release/privacy-policy.md` |
| Support URL | `https://github.com/solomonxie/novel-man/issues` |

---

## 1. Apple Developer account

- [ ] developer.apple.com → Account → membership **active** (paid, Individual is fine).
- [ ] App Store Connect → **Business** (Agreements, Tax, and Banking) → no pending agreement banner. Free app: no Paid Apps agreement or banking needed.

## 2. Xcode

- [ ] Xcode → Settings → **Accounts** → signed in with the developer Apple ID; the team shows under it.
- [ ] `cp ios/Local.xcconfig.example ios/Local.xcconfig`, set your Team ID (developer.apple.com → Membership). Gitignored — never commit it; the repo is public.
- [ ] `cd ios && pod install` succeeds. CocoaPods will warn that the target's base configuration is not its own — that is `ios/Debug.xcconfig` / `ios/Release.xcconfig`, which `#include` the Pods one and then `Local.xcconfig`. Leave it.

## 3–4. Bundle ID and iCloud container

Created by automatic signing on the first device build. Verify at
developer.apple.com → Certificates, Identifiers & Profiles:

- [ ] Identifiers → `com.example.novelman` → **iCloud** checked (iCloud Documents), container `iCloud.com.example.novelman` assigned.
- [ ] `ios/ExportOptions.plist` sets `iCloudContainerEnvironment = Production` at export — the entitlements file itself pins no environment.

## 5. Run on the iPhone

- [ ] `npm run ios` → Release build on the paired iPhone. Smoke-test: import a `.epub`, chapters detected, read a chapter and highlight a sentence, a character profile, an export, iCloud backup on.

## 6. Create the app in App Store Connect

**Apps → + → New App**

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | `Novel Man: Story Bible` |
| Primary Language | English (U.S.) |
| Bundle ID | `com.example.novelman` (dropdown) |
| SKU | `novelman-ios` |
| User Access | Full Access |

If the name is taken, the runner-up list is in [App Store Connect pages](#app-store-connect-pages).

## 7. Listing content

Fill the pages in [App Store Connect pages](#app-store-connect-pages) below. Screenshots: see [Screenshots](#screenshots).

## 8–9. Archive and upload

```
make release
```

Runs `npm run check`, then archives Release, signs for the App Store and uploads —
no Xcode Organizer, no Product → Archive → Distribute. `make release BUILD=202609241830`
pins the build number; left off it is a timestamp. (`npm run release:ios` is the same
script without the checks.)

Upload authenticates as the Apple ID signed into Xcode → Settings → Accounts. If it asks
for credentials in a terminal, add an App Store Connect API key instead: download the
`.p8`, then append `-authenticationKeyPath <abs path> -authenticationKeyID <id>
-authenticationKeyIssuerID <issuer>` to the `-exportArchive` call in `scripts/release-ios.sh`.
Processing in App Store Connect: 15–60 min, then an email "build has completed processing".

Fallback, Xcode GUI: open `ios/NovelMan.xcworkspace` → destination **Any iOS Device (arm64)** → Product → **Archive** → Organizer → **Distribute App** → App Store Connect → Upload.

## 10. TestFlight

- [ ] App Store Connect → **TestFlight** → the build shows no "Missing Compliance" (see [Export compliance](#export-compliance)).
- [ ] Internal Testing → **+** group `Me` → add your Apple ID → install via the TestFlight app on the iPhone.
- [ ] Same smoke test as step 5, on the TestFlight build (this is the exact binary Apple reviews). Check iCloud specifically — it is the Production container now: turn the switch on, confirm **Files → iCloud Drive → Novel Man** appears, delete and reinstall, and see the library come back.

## 11. Submit

- [ ] `iOS App → 1.0 Prepare for Submission` → **Build** → **+** → pick the build.
- [ ] Every page in [App Store Connect pages](#app-store-connect-pages) filled; App Privacy published.
- [ ] **Add for Review** → **Submit for Review**.

## 12. App Review

- Typical: 24–48 h. Status: Waiting for Review → In Review → Pending Developer Release.
- Rejection → **Resolution Center**: reply there, or fix and re-run `npm run release:ios` (the build number is a fresh timestamp), attach the new build, resubmit. `MARKETING_VERSION` does not need bumping for a rejected version.
- 1.0 was rejected once under 4.3 / 4.2.6 (spam, read as a generic reader). The reply and what changed: [review-reply.md](review-reply.md). Keep the listing about the story bible, not reading.

## 13. Release

- [ ] Status **Pending Developer Release** → `1.0` page → **Release This Version**. Live in the store within ~24 h.
- [ ] `git tag v1.0 && git push --tags`.

---

## Screenshots

Apple requires one set: **iPhone 6.9" Display**, exactly `1320 × 2868` (or `1290 × 2796`).
App Store Connect scales it down for every smaller phone.

Capture on the paired iPhone 14 (`1170 × 2532`) and let the script do the rest — the
aspect ratios differ by 0.4%, which is invisible.

The 2026-10-03 set (simulator, demo library) led with the shelf and the reader, which is how 1.0 got read as a generic reader (4.3). **Retake it on the phone, story-bible screens first.** English in `docs/release/screenshots/`, 简体中文 in `docs/release/screenshots/zh-Hans/`.

1. `npm run ios` — a Release build, so no dev overlay. On an empty shelf, **Try a sample** (Pride and Prejudice), so every screen below has real content.
2. Status bar: full battery, Wi-Fi, no notification banners. Side button + Volume Up per shot.
3. Shots, in upload order (the first two are what people actually see), caption in brackets:
   1. **Cast** — Elizabeth Bennet's profile: aliases, fields, mention timeline  [Every character, profiled from the text]
   2. **Graph** — relation graph filtered to a chapter range  [Who is tied to whom, chapter by chapter]
   3. **Continuity** — the flags list  [Catch the eye colour that changed in chapter 20]
   4. **Structure** — detected chapters, merge/split in reach  [Chapters and scenes found for you]
   5. **Places** — a place profile  [Places, with the chapters they appear in]
   6. **Translation** — bilingual view, glossary term pinned  [Translation that keeps your names]
   7. **Script** — the screenplay export sheet  [Adapt it: .fountain and .fdx]
   8. **Book page** — the whole book on one page
   9. **Reader** — one sentence tapped, the note row showing  [Read and annotate the draft]
4. AirDrop to the Mac, e.g. `~/Desktop/shots/`, named `01-cast.png`, `02-graph.png` …, and a
   `captions.txt` beside them (one line per shot, in order; zh-Hans set gets its own). Then:

```
npm run screenshots ~/Desktop/shots
```

Each shot lands at 1320 × 2868 with its caption above it, in `docs/release/screenshots/`.
Drag them into the 6.9" slot.

App Preview video: skip for 1.0.

---
## App Store Connect pages

### `iOS App → 1.0 Prepare for Submission`

| Field | Value |
|---|---|
| Previews and Screenshots | [Screenshots](#screenshots) |
| Promotional Text | below |
| Description | below |
| Keywords | below |
| Support URL | `https://github.com/solomonxie/novel-man/issues` |
| Marketing URL | leave blank |
| Version | `1.0` |
| Copyright | `2026 solomonxie` |
| Routing App Coverage File | leave blank |
| Build | the uploaded build (step 11) |
| App Review → Sign-In Required | Off |
| App Review → Contact First / Last Name | TODO |
| App Review → Phone | TODO (with country code, e.g. `+1 …`) |
| App Review → Email | TODO |
| App Review → Notes | below |
| App Review → Attachment | none |
| Version Release | **Manually release this version** |

Promotional Text (no price wording, Guideline 2.3.7):

```
Turn your manuscript into a story bible: every character, place and relationship, found in the text and kept in step with each new draft.
```

Description:

```
Novel Man reads your manuscript and builds its story bible for you: who is in it, where they appear, how they are connected, and what changed between chapter 3 and chapter 20.

For novelists, editors, translators and anyone adapting a book. Everything stays on your iPhone. No account, no server.

THE CAST, FROM THE TEXT
• A profile for every character and place: portrait, aliases, a summary, and fields you define yourself, such as house, species or rank
• Per-chapter mention timelines, counted on the device. See where a character drops out for ten chapters
• A relationship graph you can filter to a range of chapters: who is tied to whom at that point in the story

CONTINUITY
• Flags like "grey eyes in ch.3, green in ch.20", raised for you to review and never applied behind your back

STRUCTURE THAT SURVIVES REVISION
• Chapters and scenes detected from heading styles, "Chapter 12", "第十二章", "* * *" and the epub spine
• Rename, merge, split and reorder. Your corrections survive every re-import of a new draft

TRANSLATION THAT KEEPS YOUR NAMES
• A glossary the translation must follow, so a name is the same in chapter 1 and chapter 80
• Fix a sentence and the fix is kept and reused

ADAPT IT
• Export the book as a screenplay, .fountain or .fdx
• Export the cast as a character bible
• Export the manuscript as .txt, .md, .docx, .epub, .html or .pdf

BRING THE MANUSCRIPT
• .docx, .epub, .txt, .md and .pdf from Files, iCloud Drive, Google Drive, Dropbox or OneDrive, or a pasted link
• Or try it on a public-domain classic from Project Gutenberg

READ AND ANNOTATE THE DRAFT
• Tap a sentence to highlight it, note it or bookmark it. Notes stay with their words through every re-import

BACKUP
• A plain .zip to iCloud Drive, a file, or a storage bucket you own. Restoring never overwrites anything

OPTIONAL AI
Bring your own API key from the provider you choose. It is used for character analysis, continuity checks, summaries and glossary-bound translation. The key stays in the device keychain, and every run shows its cost before it spends anything. Without a key the app still imports, structures, profiles by hand, reads and exports.

English and 简体中文.
```

Keywords (≤100; "novel", "story" and "bible" are already in the name):

```
writer,novelist,character,worldbuilding,continuity,manuscript,outline,plot,screenplay,fountain
```

App Review Notes:

```
Novel Man turns a novel manuscript into a story bible: character and place profiles, a relationship graph, continuity flags, chapter structure and screenplay export. No account is needed.

To see it in about a minute, without an AI key:
1. On the empty shelf, tap "Try a sample". Pride and Prejudice downloads from Project Gutenberg (public domain), together with a prepared analysis.
2. Open the book and tap Characters, then Elizabeth Bennet. You'll see her profile and per-chapter mention timeline, counted on the device.
3. Back on the book, open the relationship graph and narrow the chapter range. The ties change with the story.
4. Open Continuity for the flagged inconsistencies.
5. Open Chapters and merge or split one. Corrections survive re-import.
6. Export, then Screenplay (.fountain).

Optional, and safe to skip: AI analysis and translation (needs the reviewer's own API key; off until one is added), iCloud backup, and backup to the user's own storage bucket.

Third-party content: books come only from the user's own files or, on request, from public-domain catalogues (Project Gutenberg, Standard Ebooks, Open Library). Each states its terms in the app before anything is fetched. The only bundled content is the sample's prepared analysis.

All data is stored on the device. We run no server and receive no user data.
```

### `General → App Information`

| Field | Value |
|---|---|
| Name | `Novel Man: Story Bible` (22/30) |
| Subtitle | `Characters, plot & continuity` (29/30) |
| Category — Primary | Productivity |
| Category — Secondary | Books |
| Content Rights | **Yes**, it contains, shows, or accesses third-party content — you have the rights: everything fetched is public domain or marked redistributable by its source |
| Age Rating | **Edit** → answers below → result **4+** |
| License Agreement | Apple standard EULA (default) |
| Privacy Policy URL | `https://github.com/solomonxie/novel-man/blob/master/docs/release/privacy-policy.md` |

If `Novel Man: Story Bible` is taken, in order of preference:
`Novel Man: Story Bible Maker` (28), `Novel Man — Cast & Continuity` (29). Never "reader" or "book app": that is the saturated category 1.0 was rejected into.
The name is what gets indexed; the subtitle can absorb whatever the name loses.

Age rating questionnaire — every answer:

| Section | Answer |
|---|---|
| Parental controls / age assurance | No |
| Unrestricted web access | **No** — there is no in-app browser. The one WebView is headless and runs pdf.js to extract text from a PDF. |
| User-generated content | No — notes are the user's own, private to the device, not shared or published anywhere |
| Messaging and chat | No |
| Advertising | No |
| Violence, sexual content, profanity, horror, mature themes | None — the app ships no content of its own |
| Alcohol, tobacco, drugs | None |
| Medical or treatment information / health & wellness | None |
| Gambling, simulated gambling, contests, loot boxes | None / No |
| Made for Kids | No |

Regional (Korea, China Mainland, Vietnam) — leave unset.
**Digital Services Act** trader status: **Not a trader** (free, no monetization) — if App Store Connect blocks EU availability without it, answer it in Business → Compliance.

### `App Store → Trust & Safety → App Privacy`

| Field | Value |
|---|---|
| Privacy Policy URL | same as above |
| Do you or your third-party partners collect data from this app? | **No, we do not collect data from this app** |

Then **Publish**. The label shows "Data Not Collected".

True only while there is no analytics or crash SDK — re-check before each submission:

```
grep -rniE "analytics|firebase|sentry|amplitude|mixpanel|posthog|bugsnag" package.json ios/Podfile.lock
```

Data leaves the device only to destinations the user picks — their iCloud, their bucket, their AI provider, and the public book catalogs they search (Gutenberg, Standard Ebooks, arXiv, Open Library, Google Books, eBible.org, a Goodreads feed they paste, Crossway's ESV API under their own key). Each is a live request answered in real time; none is an SDK, and you never receive any of it, so none of it is "collected" in Apple's sense.

The one fetch the user does not name is pdf.js from jsdelivr.net when importing a PDF — a code download, not user data, and the file itself is parsed on the device. Disclosed in the privacy policy all the same.

### `App Store → Trust & Safety → App Accessibility`

Skip for 1.0 rather than over-claim.

### `App Store → Monetization → Pricing and Availability`

| Field | Value |
|---|---|
| Base Country or Region | United States (USD) |
| Price | **Free** ($0.00) |
| Availability | All countries or regions |
| Tax Category | App Store software (default) |
| iPhone and iPad Apps on Apple Silicon Macs | **Off** for 1.0 (the iCloud Files paths and the document picker are untested on Mac) |
| Apple Vision Pro | Off |

### Not needed for 1.0

In-App Purchases, Subscriptions, In-App Events, Custom Product Pages, Product Page Optimization, Promo Codes, Game Center, Featuring Nominations, Ratings and Reviews, History.

---

## Export compliance

No page for it in App Store Connect — nothing to fill in. `ITSAppUsesNonExemptEncryption = false`
in `Info.plist` answers it at upload (HTTPS/TLS, Keychain, and HMAC-SHA256 request signing for
S3-compatible buckets — all exempt).
Verify: TestFlight → the build is **not** marked "Missing Compliance".
Only if it is: **Manage** → **None of the algorithms mentioned above**.

---

## 简体中文 localization

The app ships `zh-Hans`. App Store Connect → App Information → language dropdown (top right) →
**Add Chinese (Simplified)**, then switch to it on the `1.0` page.

One record, one binary: the China storefront shows this localization too, so it names no AI vendor and no scripture (the app decides those per storefront at runtime, `src/store/loadStorefront.ts`).

| Field | Value |
|---|---|
| Name | `Novel Man 小说设定集` |
| Subtitle | `人物档案、关系图、前后一致检查` |
| Privacy Policy URL | same |
| Keywords | `写作,小说,作者,网文,人物,设定,世界观,大纲,手稿,剧本,关系图,伏笔,编辑,翻译` |
| Screenshots | upload `docs/release/screenshots/zh-Hans/*.jpg` |

Promotional Text:

```
把你的手稿变成一份设定集：书里的人物、地点和人物关系，都从正文里整理出来，改稿之后也跟得上。
```

Description:

```
Novel Man 读你的手稿，替你把设定集整理出来：书里有谁，在哪几章出现，彼此什么关系，第 3 章和第 20 章哪里对不上。

写小说的、做编辑的、做翻译的、改编剧本的，都用得上。所有东西都在你的手机上，不用注册，没有服务器。

【人物，从正文里来】
每个人物、每个地点一份档案：头像、别名、简介。字段可以自己加，门派、种族、境界，看这本书需要什么。
每个人物在每一章出现几次，手机本地就能算出来。谁连着十章没露面，一眼就看到。
人物关系图可以只看某几章，看到故事那个阶段谁和谁有关系。

【前后一致】
“第 3 章是灰眼睛，第 20 章成了绿眼睛”这样的地方会提醒你。改不改，你说了算，它不会动你的稿子。

【章节，改稿也不乱】
按标题样式、“第十二章”“Chapter 12”“* * *”、epub 目录，自动分出章节和场景。
改名、合并、拆开、调顺序都可以。下一稿重新导入时，你改过的地方都还在。

【翻译，译名不走样】
先定好术语表，机器翻译必须照着它译，同一个名字从第 1 章到第 80 章都不会变。
你改过的句子会留下来，后面遇到类似的句子还会参考。

【改编】
整本书可以导成剧本，fountain 或 fdx 格式。
人物档案可以导成一份人物设定集。
原稿可以导成 txt、md、docx、epub、html、pdf。

【把稿子放进来】
docx、epub、txt、md、pdf，从“文件”里选就行，iCloud 云盘和各家网盘里的都可以，也可以粘贴一个链接。
手上没有稿子，可以先用 Project Gutenberg 上的公版名著试一试。

【边读边批注】
轻点一句话，就能划线、写批注、加书签。重新导入以后，批注还在原来那句话上。

【备份】
备份就是一个普通的 zip，可以存到 iCloud 云盘、存成文件，或者传到你自己的存储桶。恢复时不会覆盖现有的内容。

【AI，想用再开】
用你自己选的服务商的密钥。可以做人物分析、一致性检查、章节总结，还有按术语表的翻译。密钥只存在手机钥匙串里，每次运行前会先告诉你大概要花多少钱。不填密钥，导入、分章、手动建档、阅读和导出都照常能用。

简体中文和 English 都支持。
```
