/** Targets the app names in its own UI; the model will take any of them. */
export const targetLanguages = [
  { code: 'en', label: 'English' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
] as const;

export type TargetCode = (typeof targetLanguages)[number]['code'];

export function labelFor(code: string): string {
  return targetLanguages.find((entry) => entry.code === code)?.label ?? code;
}

/** English names, because that is what the instruction to the model is in. */
const ENGLISH_NAMES: Record<string, string> = {
  en: 'English',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  pt: 'Portuguese',
};

export function englishName(code: string): string {
  return ENGLISH_NAMES[code] ?? code;
}
