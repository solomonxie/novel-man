import { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, ThemeProvider, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadUiLanguage } from '../i18n';
import { Extractor } from '../import/extractor';
import { WorkOverlay } from '../ui/WorkQueue';
import { listenForIncoming } from '../import/sources/incoming';
import { loadAppearance } from '../theme/appearance';
import { watchForChanges } from '../backup/icloud';
import { watchForLocalBackup } from '../backup/local';
import { palettes, usePalette, useScheme, type Palette, type Scheme } from '../theme';
import { loadDemoMode } from '../dev/demo';
import { openScreen, prepareScreenshots } from '../dev/screenshot';
import { loadStorefront } from '../store/loadStorefront';
import { navigationRef } from './router';
import { screens } from './screens';

const Stack = createNativeStackNavigator();

/**
 * Which library this is has to be settled before anything opens a database or
 * builds a folder name, and the answer is on disk. One `AsyncStorage` read, in
 * front of everything — the launch screen is still up for it, and starting the
 * app against the wrong library for even one query is how a demo would write
 * into the real one.
 */
export default function App({ screen }: { screen?: string }) {
  const [library, setLibrary] = useState(false);

  useEffect(() => {
    // The storefront first and alone: `loadUiLanguage` falls back to a
    // China-aware default when nothing is stored, and every kind/source list
    // filtered by store reads `isChinaStore()` the moment it is next called —
    // both need the real answer in place before anything else runs.
    loadStorefront()
      .then(() => Promise.all([loadDemoMode(), loadUiLanguage()]))
      .then(() => (screen ? prepareScreenshots() : undefined))
      .then(() => setLibrary(true));
  }, [screen]);

  // The splash screen is what is on screen here, so there is nothing to draw.
  return library ? <Shell screen={screen} /> : null;
}

function Shell({ screen }: { screen?: string }) {
  // "Open in Novel Man" can arrive before any screen has mounted.
  useEffect(listenForIncoming, []);
  useEffect(() => {
    loadAppearance();
  }, []);
  useEffect(watchForChanges, []);
  useEffect(watchForLocalBackup, []);
  useEffect(() => {
    if (screen) setTimeout(() => void openScreen(screen), 800);
  }, [screen]);

  const scheme = useScheme();
  const palette = usePalette();

  return (
    <SafeAreaProvider>
      {/* Follows the in-app override; the OS one would only ever follow itself. */}
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ThemeProvider value={navigationTheme(scheme)}>
        <NavigationContainer ref={navigationRef} theme={navigationTheme(scheme)}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              // Without this the back button reads the route name — "‹ index".
              headerBackButtonDisplayMode: 'minimal',
              headerTitleAlign: 'center',
              // The navigator paints between screens; left unset it flashes white.
              contentStyle: { backgroundColor: palette.bg },
            }}
          >
            {screens.map((screen) => (
              <Stack.Screen
                key={screen.path}
                name={screen.path}
                component={screen.component}
                options={{
                  headerShown: screen.header ?? false,
                  title: '',
                  ...(screen.animation ? { animation: screen.animation } : {}),
                }}
              />
            ))}
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
      <Extractor />
      <WorkOverlay />
    </SafeAreaProvider>
  );
}

const FONTS: Theme['fonts'] = {
  regular: { fontFamily: 'System', fontWeight: '400' },
  medium: { fontFamily: 'System', fontWeight: '500' },
  bold: { fontFamily: 'System', fontWeight: '600' },
  heavy: { fontFamily: 'System', fontWeight: '700' },
};

/**
 * Built from the app's own palette rather than react-navigation's defaults, so
 * a header and the page under it are never two different whites — or, in dark,
 * a light header sitting over a black page.
 */
function navigationTheme(scheme: Scheme): Theme {
  const palette: Palette = palettes[scheme];
  return {
    dark: scheme === 'dark',
    colors: {
      primary: palette.accent,
      background: palette.bg,
      card: palette.bg,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
    fonts: FONTS,
  };
}
