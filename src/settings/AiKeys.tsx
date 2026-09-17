import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  addKey,
  getStrategy,
  listKeys,
  moveKey,
  removeKey,
  setStrategy,
  type StoredKey,
  type Strategy,
} from '../ai/keys';
import { modelFor, vendorById, vendors } from '../ai/vendors';
import { Hint, Row, Section } from '../ui/primitives';
import { radius, space, usePalette } from '../theme';

/** Sections, not a screen: settings live on Home and nowhere else. */
export function AiKeysSettings() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [strategy, setStrategyState] = useState<Strategy>('sequential');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    listKeys().then(setKeys);
    getStrategy().then(setStrategyState);
  }, []);

  useFocusEffect(load);

  async function toggleStrategy() {
    const next: Strategy = strategy === 'sequential' ? 'round-robin' : 'sequential';
    await setStrategy(next);
    setStrategyState(next);
  }


  function confirmRemove(key: StoredKey) {
    Alert.alert(vendorById(key.vendorId)?.name ?? key.vendorId, undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeKey(key.id);
          load();
        },
      },
    ]);
  }

  return (
    <>
      <Section
        title={t('settings.aiSettings')}
        action={{
          label: strategy === 'sequential' ? t('settings.aiSequential') : t('settings.aiRoundRobin'),
          onPress: toggleStrategy,
        }}
      >
        {keys.length === 0 ? (
          <Row label={t('settings.aiEmpty')} last />
        ) : (
          keys.map((key, index) => (
            <View
              key={key.id}
              style={[
                styles.keyRow,
                index < keys.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                },
              ]}
            >
              <Pressable
                style={{ flex: 1 }}
                onPress={() => router.push(`/ai-key/${key.id}?vendor=${key.vendorId}`)}
              >
                <Text style={{ color: palette.text, fontSize: 16 }}>
                  {vendorById(key.vendorId)?.name ?? key.vendorId}
                </Text>
                <Text style={{ color: palette.accent, fontSize: 12 }}>
                  {t('settings.aiRequestsOn', {
                    count: key.requests,
                    model: modelName(key),
                  })}  ›
                </Text>
              </Pressable>
              <Pressable onPress={() => moveKey(key.id, -1).then(load)} hitSlop={8} disabled={index === 0}>
                <Text style={{ color: index === 0 ? palette.faint : palette.accent, fontSize: 18 }}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => moveKey(key.id, 1).then(load)}
                hitSlop={8}
                disabled={index === keys.length - 1}
              >
                <Text style={{ color: index === keys.length - 1 ? palette.faint : palette.accent, fontSize: 18 }}>
                  ↓
                </Text>
              </Pressable>
              <Pressable onPress={() => confirmRemove(key)} hitSlop={8}>
                <Text style={{ color: palette.dim, fontSize: 18 }}>⋯</Text>
              </Pressable>
            </View>
          ))
        )}
        <Pressable onPress={() => setAdding(true)} style={styles.addRow}>
          <Text style={{ color: palette.accent, fontSize: 16 }}>＋ {t('settings.aiAdd')}</Text>
        </Pressable>
      </Section>

      <Hint>{t('settings.aiHint')}</Hint>
      {keys.length > 1 && <Hint>{t('settings.aiStrategyHint')}</Hint>}


      <AddKeySheet visible={adding} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />
    </>
  );
}

/** Which model a key runs on belongs on its row: it is what the next run costs. */
function modelName(key: StoredKey): string {
  const vendor = vendorById(key.vendorId);
  return vendor ? modelFor(vendor, key.model).name : (key.model ?? '');
}

/** Save is the test: one real cheap request, nothing stored unless it succeeds. */
function AddKeySheet({ visible, onClose, onAdded }: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [vendorId, setVendorId] = useState(vendors[0].id);
  const [secret, setSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendor = vendorById(vendorId)!;

  async function save() {
    setTesting(true);
    setError(null);
    try {
      await addKey(vendorId, secret);
      setSecret('');
      onAdded();
    } catch (problem) {
      // The vendor's own message names the field to fix; ours never could.
      setError(String((problem as Error)?.message ?? problem));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.sheetBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
            {t('settings.aiAdd')}
          </Text>
          <Pressable onPress={save} hitSlop={12} disabled={!secret.trim() || testing}>
            <Text style={{ color: secret.trim() && !testing ? palette.accent : palette.faint, fontSize: 16 }}>
              {t('settings.save')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <Text style={{ color: palette.dim, fontSize: 13, marginBottom: space.sm }}>
            {t('settings.aiVendor')}
          </Text>
          <View style={styles.vendorWrap}>
            {vendors.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => setVendorId(entry.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: entry.id === vendorId ? palette.accent : palette.border,
                    backgroundColor: entry.id === vendorId ? palette.accent : palette.surface,
                  },
                ]}
              >
                <Text style={{ color: entry.id === vendorId ? palette.onAccent : palette.text, fontSize: 14 }}>
                  {entry.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.lg, marginBottom: space.sm }}>
            {t('settings.aiKey')}
          </Text>
          <TextInput
            value={secret}
            onChangeText={setSecret}
            placeholder={vendor.keyHint}
            placeholderTextColor={palette.faint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            // Smart quotes turn a pasted key into a 403 that looks like a bad credential.
            keyboardType="ascii-capable"
            style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
          />

          <Pressable onPress={() => Linking.openURL(vendor.consoleUrl)} style={{ marginTop: space.md }}>
            <Text style={{ color: palette.accent, fontSize: 14 }}>
              {t('settings.aiGetOne', { vendor: vendor.name })}
            </Text>
          </Pressable>

          {testing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
              <ActivityIndicator />
              <Text style={{ color: palette.dim, fontSize: 14 }}>{t('settings.aiTesting')}</Text>
            </View>
          )}
          {error && (
            <Text style={{ color: palette.danger, fontSize: 13, marginTop: space.lg }}>{error}</Text>
          )}

          <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.xl }}>
            {t('settings.aiBilling', { vendor: vendor.name })}
          </Text>
          <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.xs }}>
            {t('settings.aiHint')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  addRow: { paddingVertical: space.md, alignItems: 'center' },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  vendorWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
  },
});
