import { scriptOf } from './language';

/** Chinese counts characters, English counts words — the same number means different things. */
export function countUnits(text: string, language: string) {
  const script = scriptOf(language);
  if (script === 'cjk') {
    const characters = text.replace(/\s/g, '').length;
    return { unit: 'characters' as const, count: characters, words: characters };
  }
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { unit: 'words' as const, count: words, words };
}

/** Reading speed differs per script, so a shared constant would be wrong for one of them. */
const PER_MINUTE = { latin: 250, cjk: 400 };

export function readingMinutes(units: number, language: string) {
  return Math.max(1, Math.round(units / PER_MINUTE[scriptOf(language)]));
}

export function formatCount(count: number, language: string) {
  if (scriptOf(language) === 'cjk' && count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`;
  }
  return new Intl.NumberFormat().format(count);
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
