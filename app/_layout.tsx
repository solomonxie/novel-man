import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/i18n';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          // Without this the back button reads the route name — "‹ index".
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="entity/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="settings/ai-keys" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="book/[id]/notes" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="reader/[id]" options={{ animation: 'fade' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
