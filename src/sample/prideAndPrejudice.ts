import type { Pin } from '../cast/location';
import type { Tie } from '../cast/ties';

/**
 * What a cast pass over Pride and Prejudice comes back with, written down
 * ahead of time so the sample shows a populated book with no key and no wait.
 * Names and aliases are the strings the Gutenberg text uses: mentions are
 * counted from them, so each alias must not contain another one of its own.
 */
export type SamplePerson = {
  name: string;
  aliases: string[];
  summary: string;
  role?: string;
  age?: string;
  gender?: string;
  fields?: { label: string; value: string }[];
};

export type SamplePlace = {
  name: string;
  summary: string;
  pin?: Pin;
  fields?: { label: string; value: string }[];
};

export type SampleTie = { from: string; to: string; label: Tie };
export type SampleFlag = { about: string; kind: string; detail: string };

export const SAMPLE_GUTENBERG = { id: '1342', title: 'Pride and Prejudice', author: 'Austen, Jane' };

export const samplePeople: SamplePerson[] = [
  {
    name: 'Elizabeth Bennet',
    aliases: ['Elizabeth', 'Lizzy'],
    summary:
      'Second of the five Bennet daughters, quick-witted and fond of laughing at folly. Misjudges Darcy on first impressions and Wickham\'s charm, and learns from both.',
    role: 'protagonist',
    age: '20',
    gender: 'female',
    fields: [{ label: 'Home', value: 'Longbourn' }],
  },
  {
    name: 'Fitzwilliam Darcy',
    aliases: ['Darcy'],
    summary:
      'Master of Pemberley in Derbyshire. Proud and reserved in company; slights Elizabeth at the Meryton assembly, proposes badly at Hunsford, and quietly mends the damage Wickham does.',
    role: 'love interest',
    gender: 'male',
    fields: [
      { label: 'Estate', value: 'Pemberley, Derbyshire' },
      { label: 'Income', value: 'Ten thousand a year' },
    ],
  },
  {
    name: 'Jane Bennet',
    aliases: ['Jane'],
    summary:
      'The eldest Bennet daughter, gentle and inclined to think well of everyone. Falls in love with Bingley, whose friends part them for most of the book.',
    role: 'supporting',
    age: '22',
    gender: 'female',
  },
  {
    name: 'Charles Bingley',
    aliases: ['Bingley'],
    summary:
      'Amiable young man of fortune who takes Netherfield Park. Darcy\'s close friend, easily persuaded — which is how he is talked out of Jane, and back to her.',
    role: 'supporting',
    gender: 'male',
    fields: [
      { label: 'Income', value: 'Four or five thousand a year' },
      { label: 'Residence', value: 'Netherfield Park' },
    ],
  },
  {
    name: 'Mr. Bennet',
    aliases: [],
    summary:
      'Father of the five daughters; ironic, bookish and withdrawn into his library. His estate is entailed away from his daughters onto Mr. Collins.',
    role: 'supporting',
    gender: 'male',
    fields: [
      { label: 'Estate', value: 'Longbourn, entailed' },
      { label: 'Income', value: 'Two thousand a year' },
    ],
  },
  {
    name: 'Mrs. Bennet',
    aliases: [],
    summary:
      'Mother of the five daughters, whose business in life is to get them married. Nervous, loud and forever complaining of her poor nerves.',
    role: 'supporting',
    gender: 'female',
  },
  {
    name: 'Lydia Bennet',
    aliases: ['Lydia'],
    summary:
      'The youngest Bennet sister, high-spirited and thoughtless. Follows the militia to Brighton and elopes with Wickham.',
    role: 'supporting',
    age: '15',
    gender: 'female',
  },
  {
    name: 'Kitty Bennet',
    aliases: ['Kitty'],
    summary: 'The fourth Bennet sister, who follows Lydia\'s lead until Lydia is gone.',
    role: 'minor',
    gender: 'female',
  },
  {
    name: 'Mary Bennet',
    aliases: ['Mary'],
    summary: 'The middle Bennet sister, studious and given to moralising extracts from her reading.',
    role: 'minor',
    gender: 'female',
  },
  {
    name: 'George Wickham',
    aliases: ['Wickham'],
    summary:
      'Handsome militia officer, son of the late Mr. Darcy\'s steward. Wins Elizabeth\'s sympathy with a false account of Darcy, then elopes with Lydia.',
    role: 'antagonist',
    gender: 'male',
    fields: [{ label: 'Regiment', value: 'The militia quartered at Meryton' }],
  },
  {
    name: 'William Collins',
    aliases: ['Mr. Collins'],
    summary:
      'Clergyman cousin and heir to Longbourn by the entail. Pompous and obsequious to his patroness; proposes to Elizabeth, then marries Charlotte.',
    role: 'supporting',
    age: '25',
    gender: 'male',
    fields: [{ label: 'Living', value: 'Hunsford, in Kent' }],
  },
  {
    name: 'Charlotte Lucas',
    aliases: ['Charlotte', 'Mrs. Collins'],
    summary:
      'Elizabeth\'s sensible friend, who accepts Mr. Collins for the security of a home.',
    role: 'supporting',
    age: '27',
    gender: 'female',
  },
  {
    name: 'Lady Catherine de Bourgh',
    aliases: ['Lady Catherine'],
    summary:
      'Darcy\'s aunt and Mr. Collins\'s patroness at Rosings. Domineering; her attempt to forbid Darcy and Elizabeth\'s match helps bring it about.',
    role: 'supporting',
    gender: 'female',
    fields: [{ label: 'Estate', value: 'Rosings Park, Kent' }],
  },
  {
    name: 'Georgiana Darcy',
    aliases: ['Georgiana', 'Miss Darcy'],
    summary:
      'Darcy\'s shy younger sister, whom Wickham once tried to elope with at Ramsgate.',
    role: 'minor',
    age: '16',
    gender: 'female',
  },
  {
    name: 'Caroline Bingley',
    aliases: ['Miss Bingley'],
    summary: 'Bingley\'s sister, who wants Darcy for herself and has no patience with the Bennets.',
    role: 'minor',
    gender: 'female',
  },
  {
    name: 'Mr. Gardiner',
    aliases: [],
    summary: 'Mrs. Bennet\'s brother, a sensible tradesman in London who settles Lydia\'s marriage.',
    role: 'minor',
    gender: 'male',
  },
  {
    name: 'Mrs. Gardiner',
    aliases: [],
    summary: 'Elizabeth\'s aunt and confidante, who takes her on the tour that reaches Pemberley.',
    role: 'minor',
    gender: 'female',
  },
  {
    name: 'Colonel Fitzwilliam',
    aliases: [],
    summary: 'Darcy\'s cousin, met at Rosings, who lets slip Darcy\'s part in separating Bingley and Jane.',
    role: 'minor',
    gender: 'male',
  },
  {
    name: 'Sir William Lucas',
    aliases: ['Sir William'],
    summary: 'Charlotte\'s father, a former tradesman knighted and fond of talking of St. James\'s.',
    role: 'minor',
    gender: 'male',
  },
];

export const samplePlaces: SamplePlace[] = [
  {
    name: 'Longbourn',
    summary: 'The Bennets\' house and estate, near Meryton.',
    fields: [{ label: 'County', value: 'Hertfordshire (fictional)' }],
  },
  {
    name: 'Netherfield',
    summary: 'The large house near Longbourn that Bingley leases.',
    fields: [{ label: 'County', value: 'Hertfordshire (fictional)' }],
  },
  {
    name: 'Meryton',
    summary: 'The market town a mile from Longbourn, where the militia is quartered.',
    fields: [{ label: 'County', value: 'Hertfordshire (fictional)' }],
  },
  {
    name: 'Pemberley',
    summary: 'Darcy\'s estate, whose grounds change Elizabeth\'s mind about its master.',
    fields: [{ label: 'County', value: 'Derbyshire (fictional)' }],
  },
  {
    name: 'Rosings',
    summary: 'Lady Catherine\'s estate, beside Mr. Collins\'s parsonage.',
    fields: [{ label: 'County', value: 'Kent (fictional)' }],
  },
  {
    name: 'Hunsford',
    summary: 'Mr. Collins\'s parish, where Darcy first proposes.',
    fields: [{ label: 'County', value: 'Kent (fictional)' }],
  },
  {
    name: 'Lambton',
    summary: 'The Derbyshire town near Pemberley where Mrs. Gardiner grew up.',
    fields: [{ label: 'County', value: 'Derbyshire (fictional)' }],
  },
  {
    name: 'Gracechurch Street',
    summary: 'Where the Gardiners live, in the City.',
    pin: { located: 'Gracechurch Street, London', located_certainty: 'certain' },
  },
  {
    name: 'London',
    summary: 'Where Jane spends the winter, and where Wickham and Lydia are found.',
    pin: { located: 'London, England', located_certainty: 'certain' },
  },
  {
    name: 'Brighton',
    summary: 'The seaside camp the militia moves to, and Lydia with it.',
    pin: { located: 'Brighton, England', located_certainty: 'certain' },
  },
];

export const sampleTies: SampleTie[] = [
  { from: 'Mr. Bennet', to: 'Mrs. Bennet', label: 'spouse' },
  { from: 'Mr. Bennet', to: 'Jane Bennet', label: 'parent' },
  { from: 'Mr. Bennet', to: 'Elizabeth Bennet', label: 'parent' },
  { from: 'Mr. Bennet', to: 'Mary Bennet', label: 'parent' },
  { from: 'Mr. Bennet', to: 'Kitty Bennet', label: 'parent' },
  { from: 'Mr. Bennet', to: 'Lydia Bennet', label: 'parent' },
  { from: 'Mrs. Bennet', to: 'Jane Bennet', label: 'parent' },
  { from: 'Mrs. Bennet', to: 'Elizabeth Bennet', label: 'parent' },
  { from: 'Mrs. Bennet', to: 'Lydia Bennet', label: 'parent' },
  { from: 'Jane Bennet', to: 'Elizabeth Bennet', label: 'sibling' },
  { from: 'Kitty Bennet', to: 'Lydia Bennet', label: 'sibling' },
  { from: 'Fitzwilliam Darcy', to: 'Elizabeth Bennet', label: 'spouse' },
  { from: 'Charles Bingley', to: 'Jane Bennet', label: 'spouse' },
  { from: 'George Wickham', to: 'Lydia Bennet', label: 'spouse' },
  { from: 'William Collins', to: 'Charlotte Lucas', label: 'spouse' },
  { from: 'Mr. Gardiner', to: 'Mrs. Gardiner', label: 'spouse' },
  { from: 'Fitzwilliam Darcy', to: 'Georgiana Darcy', label: 'sibling' },
  { from: 'Charles Bingley', to: 'Caroline Bingley', label: 'sibling' },
  { from: 'Mr. Gardiner', to: 'Mrs. Bennet', label: 'sibling' },
  { from: 'Mrs. Gardiner', to: 'Elizabeth Bennet', label: 'kin' },
  { from: 'Lady Catherine de Bourgh', to: 'Fitzwilliam Darcy', label: 'kin' },
  { from: 'Colonel Fitzwilliam', to: 'Fitzwilliam Darcy', label: 'kin' },
  { from: 'William Collins', to: 'Mr. Bennet', label: 'kin' },
  { from: 'Lady Catherine de Bourgh', to: 'William Collins', label: 'master' },
  { from: 'Sir William Lucas', to: 'Charlotte Lucas', label: 'parent' },
  { from: 'Fitzwilliam Darcy', to: 'Charles Bingley', label: 'friend' },
  { from: 'Charlotte Lucas', to: 'Elizabeth Bennet', label: 'friend' },
  { from: 'Fitzwilliam Darcy', to: 'George Wickham', label: 'enemy' },
  { from: 'Caroline Bingley', to: 'Elizabeth Bennet', label: 'rival' },
];

/** Flags are for review, as a pass would raise them: two places the book disagrees with itself. */
export const sampleFlags: SampleFlag[] = [
  {
    about: 'Elizabeth Bennet',
    kind: 'appearance',
    detail:
      'Chapter 3: Darcy finds her "tolerable; but not handsome enough to tempt me". Chapter 45: he has long thought her "one of the handsomest women of my acquaintance".',
  },
  {
    about: 'George Wickham',
    kind: 'other',
    detail:
      'Chapter 16: Wickham says Darcy denied him the living he was promised. Chapter 35: Darcy\'s letter says Wickham resigned it in exchange for three thousand pounds.',
  },
];
