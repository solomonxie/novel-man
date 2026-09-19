# Off Expo entirely — done

Not just the sandbox runtime — the SDK, the modules, the CLI, the config. Bare
React Native 0.86, community modules, `xcodebuild` underneath.

## Why this is a migration and not a swap

Four things were load-bearing and had no drop-in equivalent:

- **`modules/icloud`** — the app's own native module, and itself an Expo
  module: `Module`, `AsyncFunction`, `Record`, `Exception` from
  `ExpoModulesCore`. No JS shim reaches this. It was rewritten as a bare RN
  bridge module — `@objc` methods taking promise blocks, an
  `RCT_EXTERN_MODULE` header, a podspec on `React-Core`, and a
  `react-native.config.js` to autolink a module that is not a package. Every
  private helper is unchanged.

- **`expo-router`** — 26 route files under `app/`, file-based. React Navigation
  registers screens by hand, and the deep-link scheme (`novelman://`, read in
  `src/import/sources/incoming.ts`) has to be redeclared as a linking config.
- **`expo-sqlite`** — the library database. The replacement must open *the same
  file on disk*, or every reader loses their shelf. This is the one step that
  can destroy data.
- **`app.json`** — the iCloud container entitlements, the URL scheme, the icon
  and the bundle id live there and are generated into the Xcode project on
  prebuild. Going bare means they move into checked-in `.entitlements` and
  `Info.plist`, and `ios/` stops being regenerable.

Everything else is a call-site rename.

## Replacements

| Expo | Replacement | Files |
|---|---|---|
| `expo-router` | `@react-navigation/native` + `native-stack` | 30 |
| `expo-file-system` (`File`/`Directory`/`Paths`) | `react-native-fs-turbo` behind a shim | 8 |
| `expo-secure-store` | `react-native-keychain` | 4 |
| `expo-print` | `react-native-html-to-pdf` | 4 |
| `expo-clipboard` | `@react-native-clipboard/clipboard` | 4 |
| `expo-sqlite` | `op-sqlite` | 2 |
| `expo-crypto` | `react-native-quick-crypto` | 2 |
| `expo-sharing` | RN `Share` (built in) | 2 |
| `expo-document-picker` | `@react-native-documents/picker` | 1 |
| `expo-image-picker` | `react-native-image-picker` | 1 |
| `expo-localization` | `react-native-localize` | 1 |
| `expo-linking` | RN `Linking` (built in) | 1 |
| `expo-status-bar` | RN `StatusBar` (built in) | 1 |
| `expo-constants` | — no imports of ours, but a peer of `expo-router` | 0 |

Three cost nothing — they are built into React Native. `expo-constants` and
`expo-linking` have no imports of ours, but both are peer dependencies of
`expo-router` and used by its internals, so they leave with the router in
step 5, not before.

## Order

Each step leaves the app building and installable on the phone.

1. **Leaves first.** `expo-status-bar` and `expo-sharing` → built-in RN APIs,
   and our own `expo-linking` import too, though the package stays for the
   router. No new dependencies. *(Done.)*
2. **One-file modules.** Clipboard, localization, crypto, document picker,
   image picker, print. Mechanical, independently verifiable.
3. **File system.** Bigger than it looks. Expo's new API is JSI-backed and
   **synchronous** — `if (f.exists) f.delete(); f.create(); f.write(x)` with no
   `await` in sight, and helpers like `exportsDir()` return a `Directory` from
   a plain function. Every mainstream RN filesystem library is async, so a
   shim over one would force `async` through backup, iCloud, export and import
   — the cascade lands squarely on the data paths. Use `react-native-fs-turbo`
   instead: JSI/C++ TurboModule, synchronous, so the shim stays a shim and the
   diff stays in one file. The cost is maturity (0.5.1, lightly maintained) —
   so prove the byte round-trip on device before trusting a manuscript to it.
4. **Database.** `op-sqlite` pointed at the existing file path. Copy-and-verify
   before switching, keep the old file until a launch proves the new one reads.
   `src/db/index.ts` and the `SQLiteDatabase` type in `src/backup/local.ts`.
5. **Router.** The big one. A `navigation/` module mapping the 26 routes,
   `router.push`/`replace`/`back` → `navigation.navigate`/`replace`/`goBack`,
   `useLocalSearchParams` → `route.params`, `Stack.Screen options` →
   `screenOptions`. `useFocusEffect` exists in React Navigation unchanged.
6. **Native and toolchain, last.** `AppDelegate.swift` from `ExpoAppDelegate`
   to `RCTAppDelegate`; `Podfile` from `use_expo_modules!` to community
   autolinking; `index.js` entry with `AppRegistry.registerComponent`;
   `babel-preset-expo` → `@react-native/babel-preset`; add `metro.config.js`
   from `@react-native/metro-config`; `app.json` contents into
   `NovelMan.entitlements` + `Info.plist`; `npm run ios` → RN CLI.

## What it cost

Six shims, each keeping its call sites intact rather than rewriting them:
`src/storage/fs.ts`, `src/db/index.ts` (+ `driver.ts`),
`src/navigation/router.tsx` (+ `screens.ts`), `src/storage/secrets.ts`,
`src/export/print.ts`. Two swaps cost no dependency at all — `expo-crypto`
became the SHA-256 already in `src/cloud/sha256.ts`, and three modules were
built into React Native.

Two things do not survive the move:

- **Secrets need re-entering.** expo-secure-store wrote generic keychain items;
  `react-native-keychain` writes internet-credential items. Different class,
  so the ESV key, AI keys, cloud credentials and the Standard Ebooks address
  are not found and have to be pasted again.
- **Square crop on picked images.** `react-native-image-picker` has no
  built-in cropper, so `allowsEditing` / `aspect: [1,1]` are gone.

## What changes for whoever runs it

`npx expo run:ios --device` is gone. It is
`npx react-native run-ios --device --mode Release` now, and naming a device
takes `--device <udid>`: `--udid` resolves against simulators only.
`CLAUDE.md` says so.

## Risks

- **The filesystem library.** `react-native-fs-turbo` is chosen for its
  synchronous API, not its track record. If its base64/utf8 round-trip is not
  exact, manuscripts corrupt silently — verify before, not after.
- **The database file.** Step 4 is the only irreversible one. Verify against a
  copy, and never delete the old file in the same release.
- **`ios/` stops being generated.** Today `app.json` can rebuild the project.
  After step 6 the Xcode project is hand-maintained — a real cost, and the
  reason to check it in properly rather than leave it in `.gitignore`.
- **Reanimated and worklets** already come from the community, not Expo, so
  they survive untouched. `react-native-screens`, `gesture-handler`,
  `safe-area-context` and `webview` likewise.
