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

/**
 * One spelling for one language. Detection says `zh`, this list says
 * `zh-Hans`, and a catalog says `zh-CN` — three names for the shelf's most
 * common language, which is how a book could be marked `zh` while the picker
 * offering 简体中文 showed nothing selected. Simplified is the default for a
 * bare `zh`: it is what detection cannot tell apart, and what most of what is
 * published in it is.
 */
export function normalizeLanguage(code: string | null | undefined): string {
  const raw = (code ?? '').trim();
  if (!raw) return 'en';
  const [base, ...rest] = raw.toLowerCase().split(/[-_]/);
  if (base !== 'zh') return targetLanguages.some((entry) => entry.code === raw) ? raw : base;
  const tail = rest.join('-');
  return /hant|tw|hk|mo/.test(tail) ? 'zh-Hant' : 'zh-Hans';
}

export function labelFor(code: string): string {
  const wanted = normalizeLanguage(code);
  return targetLanguages.find((entry) => entry.code === wanted)?.label ?? code;
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
