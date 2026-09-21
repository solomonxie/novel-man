/**
 * A relation is one of these and nothing else. Free wording made every pass
 * answer differently — "father", "his father", "sired him", 父亲 — so the same
 * book drew a different graph each time it was read, and no edge could be
 * grouped, coloured or reversed without first guessing what the words meant.
 *
 * Sixteen names cover what a book asserts about two people. Anything finer
 * belongs in the note on the relation, where it is prose and stays prose.
 */
export type Tie =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'spouse'
  | 'kin'
  | 'ruler'
  | 'subject'
  | 'master'
  | 'servant'
  | 'mentor'
  | 'student'
  | 'ally'
  | 'enemy'
  | 'friend'
  | 'rival'
  | 'other';

/** In the order they are offered, which is family, then power, then the rest. */
export const TIES: Tie[] = [
  'parent', 'child', 'sibling', 'spouse', 'kin',
  'ruler', 'subject', 'master', 'servant', 'mentor', 'student',
  'ally', 'enemy', 'friend', 'rival', 'other',
];

/** Blood, power or neither — what an edge is drawn as. */
export const TIE_GROUP: Record<Tie, 'family' | 'power' | 'social'> = {
  parent: 'family', child: 'family', sibling: 'family', spouse: 'family', kin: 'family',
  ruler: 'power', subject: 'power', master: 'power', servant: 'power',
  mentor: 'power', student: 'power',
  ally: 'social', enemy: 'social', friend: 'social', rival: 'social', other: 'social',
};

/**
 * The same tie from the other end. Two people are stored once, in the order
 * they were first seen, so reading the edge backwards has to name it
 * backwards — a parent's edge reversed is a child's.
 */
export const TIE_OPPOSITE: Record<Tie, Tie> = {
  parent: 'child', child: 'parent', sibling: 'sibling', spouse: 'spouse', kin: 'kin',
  ruler: 'subject', subject: 'ruler', master: 'servant', servant: 'master',
  mentor: 'student', student: 'mentor',
  ally: 'ally', enemy: 'enemy', friend: 'friend', rival: 'rival', other: 'other',
};

/**
 * What a pass or an older row might have written instead. Not an invitation to
 * free text — it is how the rows written before this list existed still draw,
 * and how a model that answers "father" instead of "parent" is understood
 * rather than dropped.
 */
const SAID: Record<string, Tie> = {
  father: 'parent', mother: 'parent', dad: 'parent', mum: 'parent', mom: 'parent',
  son: 'child', daughter: 'child', heir: 'child',
  brother: 'sibling', sister: 'sibling', twin: 'sibling',
  husband: 'spouse', wife: 'spouse', consort: 'spouse',
  uncle: 'kin', aunt: 'kin', cousin: 'kin', nephew: 'kin', niece: 'kin',
  grandfather: 'kin', grandmother: 'kin', grandson: 'kin', granddaughter: 'kin',
  ancestor: 'kin', descendant: 'kin', family: 'kin', relative: 'kin', 'in-law': 'kin',
  king: 'ruler', queen: 'ruler', lord: 'ruler', judge: 'ruler', commander: 'ruler',
  subject: 'subject', follower: 'subject', soldier: 'subject',
  owner: 'master', slave: 'servant', maid: 'servant', steward: 'servant',
  teacher: 'mentor', prophet: 'mentor', disciple: 'student', apprentice: 'student',
  companion: 'friend', foe: 'enemy', opponent: 'rival',
  父亲: 'parent', 母亲: 'parent', 父: 'parent', 母: 'parent',
  儿子: 'child', 女儿: 'child', 子: 'child',
  兄弟: 'sibling', 姐妹: 'sibling', 兄: 'sibling', 弟: 'sibling',
  丈夫: 'spouse', 妻子: 'spouse', 夫妻: 'spouse',
  亲属: 'kin', 亲戚: 'kin',
  君主: 'ruler', 国王: 'ruler', 臣民: 'subject', 部下: 'subject',
  主人: 'master', 仆人: 'servant', 老师: 'mentor', 师父: 'mentor',
  学生: 'student', 弟子: 'student',
  盟友: 'ally', 敌人: 'enemy', 朋友: 'friend', 对手: 'rival',
};

export function parseTie(raw: unknown): Tie | null {
  const said = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!said) return null;
  if ((TIES as string[]).includes(said)) return said as Tie;
  if (SAID[said]) return SAID[said];
  // "his father", "father of Isaac" — the word is in there, and the rest is
  // the prose this list exists to stop carrying meaning.
  const word = Object.keys(SAID).find((key) => new RegExp(`(^|\\W)${key}(\\W|$)`, 'i').test(said));
  return word ? SAID[word] : null;
}

/** The word for the same tie read the other way round. */
export function reverseTie(label: string): string {
  return TIE_OPPOSITE[tieOf(label)];
}

/** Whatever a row says, it is one of these by the time it is drawn. */
export function tieOf(label: string): Tie {
  return parseTie(label) ?? 'other';
}
