import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { closeDatabase } from '../db/index';
import { listBooks } from '../db/repo';
import { demoMode, setDemoMode } from '../dev/demo';
import { seedDemoLibrary } from '../dev/seedDemo';
import { router } from '../navigation/router';
import { Hint, Row, Section } from '../ui/primitives';

/**
 * The switch between the real library and the demo one.
 *
 * It is here rather than behind a build flag because the author needs it on
 * the phone in his pocket: screenshots for the listing, a walk through the app
 * for somebody, a look at what a new reader first sees. A second app would
 * have meant a second bundle id, a second provisioning profile and a second
 * thing to keep in step for ever.
 *
 * Switching closes the database and sends the app back to the shelf, which is
 * the whole of what it takes — every screen loads what it shows when it comes
 * into focus, so the shelf it lands on is the new library's. The real books
 * are not hidden while the demo is on: they are in a different file that
 * nothing in demo mode has a path to. See `src/dev/demo.ts`.
 */
export function DemoModeSettings() {
  const { t } = useTranslation();
  const [on, setOn] = useState(demoMode());
  const [busy, setBusy] = useState(false);

  async function switchTo(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await setDemoMode(next);
      // The handle is the thing pointing at the old file; dropped here so the
      // next query opens the new one.
      closeDatabase();
      setOn(next);
      if (next) {
        // Empty on the first switch, and already full on every one after.
        const seeded = await seedDemoLibrary();
        if (seeded) await listBooks();
      }
      // Back to the root, so nothing on screen is still showing a book from a
      // library this app is no longer reading.
      router.replace('/');
    } catch (problem) {
      Alert.alert(t('demo.failed'), String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title={t('demo.title')}>
        <Row
          label={t('demo.toggle')}
          detail={on ? t('demo.onDetail') : t('demo.offDetail')}
          value={busy ? '…' : on ? t('demo.on') : t('demo.off')}
          onPress={() => void switchTo(!on)}
          last
        />
      </Section>
      {on ? <Hint>{t('demo.warning')}</Hint> : null}
    </>
  );
}
