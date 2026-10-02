import AsyncStorage from '@react-native-async-storage/async-storage';
import { noticeChange } from '../backup/changes';
import { highlightColors, type HighlightColor, type ReadingTheme, type Scheme } from '../theme';

export type Bilingual = 'off' | 'target' | 'both';

export type ReadingSettings = {
  theme: ReadingTheme;
  fontSize: number;
  spacing: 'compact' | 'normal' | 'loose';
  margin: number;
  serif: boolean;
  /** Which language the page shows. The target itself is chosen per book. */
  bilingual: Bilingual;
  /** The colour the last highlight was made in, and so the next one's. */
  highlight: HighlightColor;
  /**
   * Select by dragging, the way every other app on the phone does, instead of
   * by tapping a sentence at a time.
   *
   * A setting rather than a replacement because the two are not strictly
   * better and worse. Dragging gives any range at all — one word, half a
   * clause — which is what a word or a phrase needs. Tapping needs no
   * precision, reaches across paragraphs, and works on a translated page where
   * the words on screen are not the words in the file. So both stay, and this
   * says which the page is in.
   */
  freeSelect: boolean;
};

export const defaultSettings: ReadingSettings = {
  theme: 'paper',
  fontSize: 18,
  spacing: 'normal',
  margin: 24,
  serif: false,
  bilingual: 'off',
  highlight: highlightColors[0],
  freeSelect: true,
};

/**
 * Bumped when a default changes in a way a stored preference should not
 * outlive.
 *
 * Settings are loaded as `{ ...defaultSettings, ...stored }`, so anything
 * already written wins for ever — and every save writes the whole object, so
 * `freeSelect: false` was in everybody's stored settings the day after the
 * setting existed. Changing the default alone would have reached nobody who
 * had ever touched the type size.
 *
 * Only the named field is dropped, never the whole object: the theme, the
 * margin and the type size are the reader's own and are not up for revision.
 */
const DEFAULTS_VERSION = 2;
const RETIRED_AT: Partial<Record<number, (keyof ReadingSettings)[]>> = {
  2: ['freeSelect'],
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
    if (raw) {
      const stored = JSON.parse(raw) as Partial<ReadingSettings> & { v?: number };
      for (let was = (stored.v ?? 1) + 1; was <= DEFAULTS_VERSION; was += 1) {
        for (const field of RETIRED_AT[was] ?? []) delete stored[field];
      }
      return { ...defaultSettings, ...stored };
    }
  } catch {
    // Fall through to the default for this appearance.
  }
  return { ...defaultSettings, theme: scheme === 'dark' ? 'night' : 'paper' };
}

export async function saveSettings(settings: ReadingSettings) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...settings, v: DEFAULTS_VERSION }));
    noticeChange();
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
