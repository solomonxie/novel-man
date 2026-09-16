import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePalette } from '../../src/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.faint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.shelf'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>▤</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙</Text>,
        }}
      />
    </Tabs>
  );
}
