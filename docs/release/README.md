# App Store Release

Bundle ID `com.solomonxie.novelman` · iOS 16.4+ · iPhone only, portrait.

- [`listing.md`](listing.md) — step-by-step plan and every App Store Connect field, ready to paste
- [`privacy-policy.md`](privacy-policy.md) — the policy; its GitHub URL is the Privacy Policy URL
- `screenshots/6.9`, `screenshots/6.5` — upload-ready, from `npm run screenshots <dir>`

Before the first build: `cp ios/Local.xcconfig.example ios/Local.xcconfig` and put your
Apple Developer Team ID in it. It is gitignored — this repo is public and an account
identifier does not belong in it.

Upload a build: `make release` — checks, archives, signs, uploads. Nothing in Xcode.
Build number is a timestamp unless you pass `BUILD=`. `make help` lists the rest.

Versioning: `MARKETING_VERSION` in `project.pbxproj` is the user-visible version; bump it per
release. `CURRENT_PROJECT_VERSION` is set per upload by the script and never committed.
