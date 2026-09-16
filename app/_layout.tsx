import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/i18n';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="reader/[id]" options={{ animation: 'fade' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
