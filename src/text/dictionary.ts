import { Linking, NativeModules } from 'react-native';

/**
 * The dictionary the phone already has.
 *
 * iOS ships the Oxford and the New Oxford American, every dictionary the
 * reader has added in Settings, and a thesaurus — definitions, parts of
 * speech and example sentences, offline and for nothing.
 * `ios/NovelMan/Dictionary.m` is the door to it.
 *
 * Asked before it is offered, because the installed dictionaries do not carry
 * everything a reader of this app will select: a name out of Judges, a term of
 * art out of a C++ guideline, a line of a 武侠 novel. For those the row leads
 * to the web instead of to a panel that says nothing.
 */
const native = NativeModules.Dictionary as
  | { hasDefinition(term: string): Promise<boolean>; show(term: string): Promise<boolean> }
  | undefined;

export function canLookUp(): boolean {
  return Boolean(native);
}

export async function hasDefinition(term: string): Promise<boolean> {
  if (!native || !term.trim()) return false;
  try {
    return await native.hasDefinition(term);
  } catch {
    return false;
  }
}

/** The system panel, over whatever is on screen. */
export async function lookUp(term: string): Promise<boolean> {
  if (!native || !term.trim()) return false;
  try {
    return await native.show(term);
  } catch {
    return false;
  }
}

/**
 * Where to send a word the phone has no dictionary for. Wiktionary rather than
 * a dictionary site: it carries the languages this app is read in — Chinese,
 * Hebrew, Greek, Latin — where an English-only dictionary carries one.
 */
export function webLookUpUrl(term: string, language?: string): string {
  const site = language?.startsWith('zh') ? 'zh' : 'en';
  return `https://${site}.wiktionary.org/wiki/${encodeURIComponent(term.trim())}`;
}

export function openWebLookUp(term: string, language?: string): Promise<unknown> {
  return Linking.openURL(webLookUpUrl(term, language));
}
