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
