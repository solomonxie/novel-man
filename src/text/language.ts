export type Script = 'latin' | 'cjk';

const CJK = /[㐀-鿿豈-﫿぀-ヿ]/g;

export function detectLanguage(text: string): { language: string; script: Script } {
  const sample = text.slice(0, 20000);
  const cjk = sample.match(CJK)?.length ?? 0;
  return cjk / Math.max(1, sample.length) > 0.15
    ? { language: 'zh', script: 'cjk' }
    : { language: 'en', script: 'latin' };
}

export function scriptOf(language: string): Script {
  return language === 'zh' || language === 'ja' ? 'cjk' : 'latin';
}
