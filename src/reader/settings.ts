import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadingTheme, Scheme } from '../theme';

export type Bilingual = 'off' | 'target' | 'both';

export type ReadingSettings = {
  theme: ReadingTheme;
  fontSize: number;
  spacing: 'compact' | 'normal' | 'loose';
  margin: number;
  serif: boolean;
  /** Which language the page shows. The target itself is chosen per book. */
  bilingual: Bilingual;
};

export const defaultSettings: ReadingSettings = {
  theme: 'paper',
  fontSize: 18,
  spacing: 'normal',
  margin: 24,
  serif: false,
  bilingual: 'off',
};

export const FONT_RANGE = { min: 13, max: 28, step: 1 };
export const MARGIN_RANGE = { min: 8, max: 48, step: 4 };

const KEY = 'reader.settings';

/**
 * On a first read the page follows the app's appearance: opening a dark app
 * onto a white page is a flash in the eyes, and Paper is only a sensible
 * default for someone already in the light.
 */
export async function loadSettings(scheme: Scheme = 'light'): Promise<ReadingSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    // Fall through to the default for this appearance.
  }
  return { ...defaultSettings, theme: scheme === 'dark' ? 'night' : 'paper' };
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
