import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { isAuto, listBackups, readBackup, setAuto, useDriveStatus } from '../backup/icloud';
import { openBundle, readAbout } from '../backup/bundle';
import { restoreBundle } from '../backup/restore';
import { subscribeToRestores } from '../backup/changes';
import { radius, space, usePalette } from '../theme';

const OFFERED = 'icloud.offered';

/**
 * The two moments the shelf itself has to talk about keeping things.
 *
 * Both used to be silent. A reader could use this app for a year with nothing
 * leaving the phone, because the switch that changes that is at the bottom of a
 * settings list and nothing ever mentioned it — and a reader who had lost their
 * phone could stand in front of an empty shelf that said "import a .txt file"
 * while their whole library sat in iCloud one tap away. Those are the two
 * moments trust is actually won or lost, and neither is a settings screen.
 */
function Card({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Asked once, when there is something to lose — not on first launch, where a
 * dialog about backups lands before the reader has anything to back up and
 * teaches them only that this app interrupts. Dismissed, it does not come back.
 */
export function BackupOffer() {
  const { t } = useTranslation();
  const palette = usePalette();
  const status = useDriveStatus();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void (async () => {
      const [auto, offered] = await Promise.all([
        isAuto(),
        AsyncStorage.getItem(OFFERED),
      ]);
      setShow(!auto && !offered);
    })();
  }, []);

  useEffect(load, [load]);
  useEffect(() => subscribeToRestores(load), [load]);

  if (!show || status !== 'available') return null;

  return (
    <Card>
      <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
        {t('safe.offerTitle')}
      </Text>
      <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.xs }}>
        {t('safe.offerWhat')}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={async () => {
            await AsyncStorage.setItem(OFFERED, String(Date.now()));
            setShow(false);
          }}
          hitSlop={8}
        >
          <Text style={{ color: palette.dim, fontSize: 15 }}>{t('safe.notNow')}</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await setAuto(true);
              await AsyncStorage.setItem(OFFERED, String(Date.now()));
              setShow(false);
            } catch (problem) {
              Alert.alert(t('backup.failed'), String(problem));
            } finally {
              setBusy(false);
            }
          }}
          hitSlop={8}
        >
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: palette.accent, fontSize: 15, fontWeight: '600' }}>
              {t('safe.turnOn')}
            </Text>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * An empty shelf on a phone whose iCloud holds a library. The automatic pull at
 * first launch covers the ordinary reinstall; this covers every way that can
 * miss — offline at the wrong minute, iCloud still setting up, or an app that
 * has been opened once already and so will never pull again on its own. It
 * appears after "remove all app data" too, which is the point rather than a
 * bug: that warning promised a verified copy was kept first, and this is where
 * the promise is kept.
 *
 * Only the listing is read here, which is names and dates. Nothing comes down
 * until it is asked for.
 */
export function RestoreOffer({ onRestored }: { onRestored: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const status = useDriveStatus();
  const [newest, setNewest] = useState<{ name: string; modifiedAt: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'available') return;
    listBackups()
      .then((files) => setNewest(files[0] ?? null))
      .catch(() => setNewest(null));
  }, [status]);

  if (!newest) return null;

  async function bringBack() {
    setBusy(true);
    try {
      const bytes = await readBackup(newest!.name);
      const about = readAbout(bytes);
      const report = await restoreBundle(openBundle(bytes), { settings: true });
      onRestored();
      // Pictures put back on books already here are not in any count of
      // restored books, and are the whole of what happened when a backup is
      // reached for because the covers went blank.
      const said = [
        about ? t('safe.cameBack', { notes: about.notes, chapters: about.chapters }) : '',
        report.repaired.length ? t('backup.repaired', { count: report.repaired.length }) : '',
      ].filter(Boolean);
      Alert.alert(
        t('backup.restored', { count: report.restored.length }),
        said.length ? said.join('\n\n') : undefined
      );
    } catch (problem) {
      Alert.alert(t('backup.failed'), String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
        {t('safe.foundTitle')}
      </Text>
      <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.xs }}>
        {t('safe.foundWhat', { when: new Date(newest.modifiedAt).toLocaleString() })}
      </Text>
      <View style={styles.actions}>
        <Pressable disabled={busy} onPress={bringBack} hitSlop={8}>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: palette.accent, fontSize: 15, fontWeight: '600' }}>
              {t('safe.bringBack')}
            </Text>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.xl,
    marginTop: space.lg,
  },
});
