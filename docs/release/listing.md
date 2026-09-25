# Publishing Novel Man — step by step

Every field below is ready to paste. `TODO` = only you can supply it.
App Store Connect paths start at **Apps → Novel Man → Distribution →**.

| | |
|---|---|
| Bundle ID | `com.solomonxie.novelman` |
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

- [ ] Identifiers → `com.solomonxie.novelman` → **iCloud** checked (iCloud Documents), container `iCloud.com.solomonxie.novelman` assigned.
- [ ] `ios/ExportOptions.plist` sets `iCloudContainerEnvironment = Production` at export — the entitlements file itself pins no environment.

## 5. Run on the iPhone

- [ ] `npm run ios` → Release build on the paired iPhone. Smoke-test: import a `.epub`, chapters detected, read a chapter and highlight a sentence, a character profile, an export, iCloud backup on.

## 6. Create the app in App Store Connect

**Apps → + → New App**

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | `Novel Man: Powerful book app` |
| Primary Language | English (U.S.) |
| Bundle ID | `com.solomonxie.novelman` (dropdown) |
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
- Likely questions, all answered in the review notes: the AI features (optional, your own key), the downloadable books (public domain / redistributable), iCloud (optional).

## 13. Release

- [ ] Status **Pending Developer Release** → `1.0` page → **Release This Version**. Live in the store within ~24 h.
- [ ] `git tag v1.0 && git push --tags`.

---

## Screenshots

Apple requires one set: **iPhone 6.9" Display**, exactly `1320 × 2868` (or `1290 × 2796`).
App Store Connect scales it down for every smaller phone. The 6.5" slot (`1284 × 2778`) is
optional and generated anyway, for the older listing layout.

Capture on the paired iPhone 14 (`1170 × 2532`) and let the script do the rest — the
aspect ratios differ by 0.4%, which is invisible.

What sits in `docs/release/screenshots/` now is the two README shots upscaled from a
~600 px capture. They prove the pipeline, not the listing — recapture before you upload.

1. `npm run ios` — a Release build, so no dev overlay. Load a book you are happy to show;
   a Gutenberg classic is safest, nothing unpublished and nothing personal in the notes.
2. Status bar: full battery, Wi-Fi, no notification banners. Side button + Volume Up per shot.
3. Shots, in upload order (3 minimum, 10 maximum — the first two are what people actually see):
   1. **Shelf** — the one page: search, what you are reading, the library below it
   2. **Reader** — a chapter open, one sentence tapped, the action row showing
   3. **Book page** — cover, chapters, scenes, notes and cast for one book
   4. **Structure** — detected chapters with a rename/merge/split in reach
   5. **Cast** — a character profile with portrait, aliases and mention timeline
   6. **Graph** — the relation graph, filtered to a chapter range
   7. **Translation** — bilingual view with a glossary term pinned
   8. **Notes** — annotations across the book, searchable
   9. **Sources** — Add → Project Gutenberg or Open Library mid-search
   10. **Settings** — iCloud switch and the "stays on the device" copy
4. AirDrop to the Mac, e.g. `~/Desktop/shots/`, then:

```
npm run screenshots ~/Desktop/shots
```

Outputs overwrite `docs/release/screenshots/{6.9,6.5}/`, named after the files you fed in —
so name them `01-shelf.png`, `02-reader.png` … and the upload order sorts itself.
Drag the `6.9` folder's files into the 6.9" slot.

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
| Copyright | `2026 Solomon Xie` |
| Routing App Coverage File | leave blank |
| Build | the uploaded build (step 11) |
| App Review → Sign-In Required | Off |
| App Review → Contact First / Last Name | TODO |
| App Review → Phone | TODO (with country code, e.g. `+1 …`) |
| App Review → Email | TODO |
| App Review → Notes | below |
| App Review → Attachment | none |
| Version Release | **Manually release this version** |

Promotional Text (155/170):

```
A book reader that accepts any format. Import a manuscript and get back its chapters, scenes and cast — on the device, with no account and no subscription.
```

Description:

```
Novel Man turns a manuscript into a book you can read properly — and into the structure underneath it: chapters, scenes, a cast, places, terminology. All of it on your iPhone.

No account. No subscription. No server holding your book.

IMPORT FROM WHEREVER IT ALREADY IS
• .txt, .md, .docx, .epub and .pdf, through Files — which brings iCloud Drive, Google Drive, Dropbox and OneDrive with it
• "Open in…" from another app, or a pasted link; a Google Doc arrives as .docx
• A PDF shows you the text it extracted before it becomes a book

READ IT
• A real reading experience: four page themes, font size, margins, a scrubber over the whole book, chrome that fades while you read
• Tap one sentence to copy, highlight, note, bookmark or share it — no drag handles
• Annotations anchor to their own words, so they survive a re-import or a re-split
• Notes on a chapter or on the book, all searchable from the shelf
• Five stars, your own review, and where it stands: want to read, reading, read

STRUCTURE, DETECTED THEN CORRECTED
• Chapters and scenes found by heuristics — heading styles, "Chapter 12", "第十二章", "* * *", the epub spine
• Rename, merge, split and reorder; your corrections survive every re-run

CHARACTERS AND PLACES
• Profiles with a portrait, aliases, a summary, and fields you define yourself — house, species, cultivation level, whatever the genre needs
• Per-chapter mention timelines, counted on the device
• A relation graph you can filter to a range of chapters
• Continuity flags — "grey eyes in ch.3, green in ch.20" — raised for review, never applied behind your back

BOOKS BY NAME, NOT BY FILE
• Project Gutenberg and Standard Ebooks for books in the public domain
• arXiv for papers; Open Library for 40 million records; your Goodreads export for the shelf you already have
• A bible from eBible.org — pick the translation and the canon, and John 3:16 or 约 3:16 becomes a lookup
• Or just a title: a book you read on paper gets chapters, notes and a cast like any other

EXPORT
• .txt, .md, .docx, .epub, .html and .pdf
• Annotations as .md or .csv, the cast as a character bible, a translation alone or bilingual
• Screenplay as .fountain or .fdx
• Every format states what it drops before you pick it

BACKUP
• A plain .zip you can open anywhere — to iCloud Drive, to a file you keep, or to a cloud bucket you own
• Restore never overwrites: it creates something new and tells you what it could not place

OPTIONAL AI
Bring your own API key from OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek or xAI. Translation with a glossary the model must obey, character analysis, chapter summaries. The key stays in the device keychain, usage shows up in your provider's dashboard, every run states its cost before it spends, and all of it is off until you turn it on. Skip it and the app still imports, reads, structures and exports.

English and 简体中文. Free, with no upsell, no ads and no analytics.
```

Keywords (98/100 — "novel" and "book" are omitted, the name already indexes them):

```
epub,manuscript,reader,offline,annotate,translate,writer,editor,gutenberg,screenplay,library,bible
```

App Review Notes:

```
No account or login is needed — the app opens straight into an empty shelf, and Add → Project Gutenberg will download a public-domain book in a few seconds if you want something to try it on.

Optional features a reviewer may want to skip:
- AI (Settings → AI keys): requires the reviewer's own API key from a provider such as OpenAI or Anthropic. Every AI feature — translation, character analysis, summaries — is off until a key is added, and the rest of the app works without one.
- iCloud (Settings): optional; the app is fully functional with local storage only.
- Cloud bucket backup (Settings): optional, and uses S3-compatible credentials the user supplies.

Third-party content: the app searches and downloads from Project Gutenberg, Standard Ebooks, arXiv, Open Library and eBible.org. Everything it fetches is public domain or explicitly redistributable — eBible.org editions are filtered to the ones its catalog marks redistributable, which is why licence-restricted translations such as NIV and NASB are absent. Each source states its own terms in the app before anything is fetched. No content is bundled with the app.

All manuscripts and notes are stored in a local SQLite database and local files on the device. We operate no server and receive no user data.
```

What's New: not shown for a first version. From 1.1 on, write it here.

### `General → App Information`

| Field | Value |
|---|---|
| Name | `Novel Man: Powerful book app` (28/30) |
| Subtitle | `Read, annotate, adapt novels` (28/30) |
| Category — Primary | Books |
| Category — Secondary | Productivity |
| Content Rights | **Yes**, it contains, shows, or accesses third-party content — you have the rights: everything fetched is public domain or marked redistributable by its source |
| Age Rating | **Edit** → answers below → result **4+** |
| License Agreement | Apple standard EULA (default) |
| Privacy Policy URL | `https://github.com/solomonxie/novel-man/blob/master/docs/release/privacy-policy.md` |

If `Novel Man: Powerful book app` is taken, in order of preference:
`Novel Man — Reader & Bible` (26), `Novel Man: Manuscript Reader` (28), `Novel Man Story Bible` (21).
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

| Field | Value |
|---|---|
| Name | `Novel Man 小说管家` |
| Subtitle | `读小说，理结构，建角色卡` |
| Privacy Policy URL | same |
| Keywords | `小说,手稿,阅读器,离线,批注,翻译,剧本,epub,古登堡,书架,圣经,写作` |
| Screenshots | reuse the English set (App Store Connect falls back automatically) |

Promotional Text:

```
一个阅读器，也是一本故事圣经。导入小说，拿回它的章节、人物和地点——完全离线，无需账号，手稿从不离开手机。
```

Description:

```
Novel Man 把一份手稿变成一本能好好读的书，也变成它底下的结构：章节、场景、人物、地点、术语。全部留在你的 iPhone 上。

无需账号。没有订阅。没有服务器保管你的书。

从它原本就在的地方导入
• .txt、.md、.docx、.epub 和 .pdf，通过“文件”导入——iCloud 云盘、Google Drive、Dropbox、OneDrive 一并带上
• 从别的 App “用其他应用打开”，或粘贴一个链接；Google 文档会以 .docx 进来
• PDF 会先让你看清它提取出的文字，再决定要不要成书

读它
• 真正的阅读体验：四套页面主题、字号、页边距、贯穿全书的进度条，读起来界面自己淡出
• 点一句话就能复制、高亮、写注、加书签或分享——不用拖动手柄
• 批注锚定在它自己的那几个字上，重新导入或重新分章都不会丢
• 针对某一章或整本书写笔记，都能从书架上搜到
• 五星评分、你自己的书评，以及状态：想读、在读、读过

结构：先检测，再修正
• 用启发式规则找出章节与场景——标题样式、“Chapter 12”、“第十二章”、“* * *”、epub 书脊
• 改名、合并、拆分、重排；你的修正在每次重新检测后依然保留

人物与地点
• 档案含头像、别名、简介，以及你自己定义的字段——家族、种族、修为，看这本书需要什么
• 逐章提及时间线，在本机统计
• 关系图谱，可按章节范围筛选
• 连续性提示——“第 3 章灰眼睛，第 20 章绿眼睛”——只提出来供你判断，绝不自作主张改动

按书名找书，而不是找文件
• Project Gutenberg 与 Standard Ebooks 提供公版书
• arXiv 找论文；Open Library 有四千万条书目；Goodreads 导出文件可把你现成的书架搬过来
• 从 eBible.org 下载圣经——选译本与正典，然后 John 3:16 或“约 3:16”就是一次查询
• 或者只给一个书名：一本你在纸上读的书，一样能有章节、笔记和人物

导出
• .txt、.md、.docx、.epub、.html 和 .pdf
• 批注导出为 .md 或 .csv，人物导出为角色圣经，译文可单独或双语导出
• 剧本导出为 .fountain 或 .fdx
• 每种格式都会先说明它会丢掉什么，你再决定

备份
• 一个到哪儿都能打开的普通 .zip——存到 iCloud 云盘、存成你自己保管的文件，或存进你自己的云存储桶
• 恢复从不覆盖：它新建一份，并告诉你哪些没能对上

可选 AI
使用你自己的 OpenAI、Anthropic、Google、Mistral、Groq、DeepSeek 或 xAI 密钥。带术语表的翻译（模型必须遵守它）、人物分析、章节摘要。密钥存在设备钥匙串里，用量显示在服务商后台，每次运行前都会说明它要花多少，而且不加密钥就完全不启用。不用它，导入、阅读、结构和导出照样能用。

English 与简体中文。免费，无内购推销，无广告，无统计分析。
```
