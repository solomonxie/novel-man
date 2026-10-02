import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'react-native-localize';

import { isChinaStore } from '../store/storefront';
import en from './en.json';
import zhHans from './zh-Hans.json';

export const SUPPORTED = ['en', 'zh-Hans'] as const;
export type UiLanguage = (typeof SUPPORTED)[number];

const KEY = 'ui.language';

function deviceLanguage(): UiLanguage {
  const tag = getLocales()[0]?.languageTag ?? 'en';
  return /^zh/i.test(tag) ? 'zh-Hans' : 'en';
}

/**
 * What the app opens in when nobody has chosen.
 *
 * The China build opens in Chinese whatever the phone is set to. It is sold in
 * one country, to readers of one language, and a Chinese reader whose phone
 * happens to be in English should not have to find the language setting first.
 * Everywhere else the phone decides, which is the ordinary rule.
 */
function defaultLanguage(): UiLanguage {
  return isChinaStore() ? 'zh-Hans' : deviceLanguage();
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-Hans': { translation: zhHans } },
  lng: defaultLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/**
 * Remembered, which it was not before: choosing Chinese and relaunching used
 * to come back in English, because nothing wrote the choice down and the
 * default was recomputed every launch.
 *
 * `system` is how a choice is *unmade* — the stored value goes and the default
 * applies again.
 */
export function setUiLanguage(lang: UiLanguage | 'system') {
  i18n.changeLanguage(lang === 'system' ? defaultLanguage() : lang);
  void (lang === 'system' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, lang)).catch(
    () => undefined
  );
}

/**
 * The stored choice, applied before the first screen draws. Awaited at launch
 * beside the library flag — a language that arrives a frame late is a visible
 * flash of the wrong one.
 */
export async function loadUiLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && (SUPPORTED as readonly string[]).includes(stored)) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // The default is already applied; a preference that cannot be read is one
    // the reader can set again.
  }
}

/**
 * Which language the app is being read in — not the device's, which may differ
 * once the reader has chosen. What answers to a gloss or a lookup is this one:
 * a Chinese novel read with the app in English wants its words in English.
 */
export function uiLanguage(): UiLanguage {
  return /^zh/i.test(i18n.language ?? '') ? 'zh-Hans' : 'en';
}

export default i18n;
