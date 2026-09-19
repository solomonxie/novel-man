import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

import { router } from '../navigation/router';
import { hasAnyKey } from './keys';

/**
 * Analysis runs on the reader's own key. Without one, queueing the work buys a
 * row in the queue that fails a second later and a failure to go and read — so
 * the ask stops at the button that made it, and says where the key goes.
 *
 * True means it was stopped; the caller does nothing more.
 */
export async function stoppedWithoutKey(t: TFunction): Promise<boolean> {
  if (await hasAnyKey()) return false;
  Alert.alert(t('ai.noKeyTitle'), t('ai.noKey'), [
    { text: t('settings.cancel'), style: 'cancel' },
    { text: t('ai.addKey'), onPress: () => router.push('/?addKey=1') },
  ]);
  return true;
}
