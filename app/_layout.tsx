import { useEffect } from 'react';
import { Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/i18n';
import { Extractor } from '../src/import/extractor';
import { WorkOverlay } from '../src/ui/WorkQueue';
import { listenForIncoming } from '../src/import/sources/incoming';
import { loadAppearance } from '../src/theme/appearance';
import { watchForChanges } from '../src/backup/icloud';
import { watchForLocalBackup } from '../src/backup/local';
import { palettes, usePalette, useScheme, type Palette, type Scheme } from '../src/theme';

export default function RootLayout() {
  // "Open in Novel Man" can arrive before any screen has mounted.
  useEffect(listenForIncoming, []);
  useEffect(() => {
    loadAppearance();
  }, []);
  useEffect(watchForChanges, []);
  useEffect(watchForLocalBackup, []);

  const scheme = useScheme();
  const palette = usePalette();

  return (
    <SafeAreaProvider>
      {/* Follows the in-app override; "auto" would only ever follow the OS. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationTheme(scheme)}>
        <Stack
          screenOptions={{
            headerShown: false,
            // Without this the back button reads the route name — "‹ index".
            headerBackButtonDisplayMode: 'minimal',
            headerTitleAlign: 'center',
            // The navigator paints between screens; left unset it flashes white.
            contentStyle: { backgroundColor: palette.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="add" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="job/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="source/find" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="source/ebible" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="source/arxiv" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="entity/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="chapter/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="place/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="scene/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="ai-key/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="ai-request/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="settings/cloud-library" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/notes" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/structure" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/cast" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/scenes" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/parts" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/part/[idx]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/graph" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/translation" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/terms" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="book/[id]/script" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="reader/[id]" options={{ animation: 'fade' }} />
        </Stack>
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
