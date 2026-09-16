import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadingTheme } from '../theme';

export type ReadingSettings = {
  theme: ReadingTheme;
  fontSize: number;
  spacing: 'compact' | 'normal' | 'loose';
  margin: number;
  serif: boolean;
};

export const defaultSettings: ReadingSettings = {
  theme: 'paper',
  fontSize: 18,
  spacing: 'normal',
  margin: 24,
  serif: false,
};

export const FONT_RANGE = { min: 13, max: 28, step: 1 };
export const MARGIN_RANGE = { min: 8, max: 48, step: 4 };

const KEY = 'reader.settings';

export async function loadSettings(): Promise<ReadingSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: ReadingSettings) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // A lost preference is not worth interrupting reading for.
  }
}

const SPACING_MULTIPLIER = { compact: 0.85, normal: 1, loose: 1.25 };

/** CJK needs looser leading than Latin at the same size, so script comes first. */
export function lineHeightFor(settings: ReadingSettings, script: 'latin' | 'cjk') {
  const base = settings.fontSize * (script === 'cjk' ? 1.9 : 1.6);
  return Math.round(base * SPACING_MULTIPLIER[settings.spacing]);
}
