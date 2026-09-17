import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Appearance = 'system' | 'light' | 'dark';
export const appearances: Appearance[] = ['system', 'light', 'dark'];

const KEY = 'ui.appearance';

/**
 * Following the OS is the right default, but it is not the whole answer: people
 * read in bed with the phone in light mode, and the interface language is
 * already overridable here for the same reason. Kept outside React so the
 * palette can be read from anywhere without threading a provider through.
 */
let current: Appearance = 'system';
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppearance(): Appearance {
  return current;
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}

export async function setAppearance(next: Appearance) {
  current = next;
  notify();
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // A lost preference is not worth interrupting anything for.
  }
}

/** Read once at launch. Until it lands, `system` is already the right guess. */
export async function loadAppearance() {
  try {
    const raw = (await AsyncStorage.getItem(KEY)) as Appearance | null;
    if (raw && appearances.includes(raw)) {
      current = raw;
      notify();
    }
  } catch {
    // Same: fall through to following the OS.
  }
}
