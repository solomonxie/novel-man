import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'react-native-localize';

import en from './en.json';
import zhHans from './zh-Hans.json';

export const SUPPORTED = ['en', 'zh-Hans'] as const;
export type UiLanguage = (typeof SUPPORTED)[number];

function deviceLanguage(): UiLanguage {
  const tag = getLocales()[0]?.languageTag ?? 'en';
  return /^zh/i.test(tag) ? 'zh-Hans' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-Hans': { translation: zhHans } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setUiLanguage(lang: UiLanguage | 'system') {
  i18n.changeLanguage(lang === 'system' ? deviceLanguage() : lang);
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
