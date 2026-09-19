# Working in this repo

## Running the app

- **Never install or launch on a simulator.** Not to check a change, not to take
  a screenshot, not as a fallback when a device is missing.
- **Always install on the physical phone**: `npm run ios`. That is
  `react-native run-ios --device --mode Release --no-packager` — a standalone
  build with its JS baked in. To name a device it is `--device <udid>`;
  `--udid` resolves against simulators only and errors out.
- **Never start a dev server.** No Metro, no Expo, no packager, no `run-ios`
  without `--no-packager`, unless asked for one that time. The app reads its
  own embedded bundle in every configuration — `AppDelegate.bundleURL` has no
  branch that looks for a server — so a running bundler is never the thing
  that makes a change appear. Install to see a change.
  (Metro the *bundler* stays: the Xcode build phase runs it once to turn
  `index.js` into `main.jsbundle`. That is a build step, not a server, and
  `metro.config.js` configures it.)
- **No device connected → stop and say so.** Do not reach for a simulator
  instead; ask, and let the answer come back before trying again.
- A simulator is only ever in scope when explicitly asked for, that one time.

Everything short of running — `npm run check`, typecheck, the fixture tests,
reading the code — carries on as normal and is the default way to verify a
change.

## Light and fast, as a constraint

This is a reader. It has to open instantly, scroll without a stutter, and not
cost a fifth of a gigabyte to keep installed. Treat that as a requirement the
same way the tests are one.

Where it stands, measured on a Release build for arm64:

    NovelMan.app   31 MB    React 12 · Hermes 4.9 · RN deps 1.2
                            app binary 10 (every pod, statically linked)
                            main.jsbundle 3.0 · assets 0.4

Most of that is React Native itself and is not ours to shrink. What is ours:

- **A dependency is weight.** 23 runtime packages now; each new one lands in
  the binary whether or not a screen uses it. Prefer what React Native already
  ships, then what the repo already has (`src/cloud/sha256.ts` replaced
  `expo-crypto` for nothing), then a package.
- **Any list that can grow is a `FlatList`.** A bible's chapter sheet is 1,189
  rows and a Gutenberg search is 78,000; both virtualise. A `.map()` is fine
  only where the count has a ceiling.
- **Queries get an index.** 20 in `src/db/migrations.ts` — a new hot query
  should arrive with its own.
- **Know what you are loading.** `getDocumentText` reads a whole manuscript
  into memory, and `src/storage/fs.ts` moves bytes as base64. Both are
  deliberate and both are megabytes; don't add a third on a path that runs
  while someone is reading.

If a change makes the app slower or heavier, that is a cost to state and
justify, not a detail to leave for later.

## No Expo

Bare React Native: no SDK, no modules, no CLI, no `app.json`. `ios/` is checked
in and hand-maintained — there is no prebuild to regenerate it, so a change to
entitlements, the URL scheme or the icon is an edit to `Info.plist`,
`NovelMan.entitlements` or the Xcode project itself.

Several modules are shims that keep the old call sites intact, and new code
should go through them rather than their packages:

- `src/storage/fs.ts` — `File` / `Directory` / `Paths`, synchronous
- `src/db/index.ts` — the four database calls; `src/db/driver.ts` holds the driver
- `src/navigation/router.tsx` — `router`, `useLocalSearchParams`, `Stack.Screen`
- `src/storage/secrets.ts` — the keychain
- `src/export/print.ts` — HTML to PDF

Routes live in `src/navigation/screens.ts`, not in the file tree: a new screen
is a component plus a row there.
