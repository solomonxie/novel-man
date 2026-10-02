/**
 * The demo library, as data.
 *
 * Every text here is public domain — Austen, Melville, the King James Bible,
 * Darwin — so the screenshots can be published and the review can read them
 * without anybody's permission. They are excerpts rather than books: a
 * screenshot needs a page that looks real, not three hundred that are, and
 * this file ships inside the app.
 *
 * On that: this is about 20 KB of the bundle that no reader will ever open,
 * which is a real cost and the reason the excerpts are short. If it grows,
 * fetch the texts from Gutenberg at seed time instead — `src/sources/
 * gutenberg.ts` is already there, and the demo would then cost nothing to
 * ship and one download to fill.
 *
 * What it has to cover is every section the book page can show, because a
 * screenshot of an empty section sells nothing: a novel with a cast and
 * scenes, an instruction book with terms and flash cards mid-schedule,
 * scripture with verses and places, and a paper. Plus the things that only
 * look right when they have history — highlights with notes on them, a
 * reading position partway through, cards already answered twice.
 */

export type DemoAnnotation = {
  /** Which chapter, by index, and the exact words — found by search when seeded. */
  chapter: number;
  quote: string;
  note?: string;
  color?: string;
};

export type DemoEntity = {
  kind: 'character' | 'place' | 'term' | 'word';
  name: string;
  alias?: string;
  summary?: string;
  /** Days ago it was last studied, and how many times right. Cards only. */
  studied?: { daysAgo: number; reps: number };
};

export type DemoCard = { front: string; back: string; studied?: { daysAgo: number; reps: number } };

export type DemoBook = {
  title: string;
  author: string;
  kind: string;
  language: string;
  /** Rating and review, for the shelf and the record. */
  stars?: number;
  review?: string;
  tags?: string[];
  /** How far in, as a fraction — a shelf of unopened books looks unused. */
  progress?: number;
  chapters: { title: string; text: string }[];
  annotations?: DemoAnnotation[];
  entities?: DemoEntity[];
  cards?: DemoCard[];
};

const HIGHLIGHTS = ['#FFE58A', '#BFE3B4', '#BBD9F5', '#F2C2D6'];

/** Only the reader's own lists; Favourites ships and is never named here. */
export const demoLists = ['Read this winter'];

export const demoBooks: DemoBook[] = [
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    kind: 'novel',
    language: 'en',
    stars: 5,
    review:
      'The best first chapter in English, and the only one that is funny before anyone has done anything.',
    tags: ['19th century', 're-read'],
    progress: 0.34,
    chapters: [
      {
        title: 'Chapter 1',
        text: `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."

This was invitation enough.

"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."

"What is his name?"

"Bingley."

"Is he married or single?"

"Oh! single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!"

"How so? how can it affect them?"

"My dear Mr. Bennet," replied his wife, "how can you be so tiresome! You must know that I am thinking of his marrying one of them."`,
      },
      {
        title: 'Chapter 2',
        text: `Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid she had no knowledge of it.

It was then disclosed in the following manner. Observing his second daughter employed in trimming a hat, he suddenly addressed her with,

"I hope Mr. Bingley will like it, Lizzy."

"We are not in a way to know what Mr. Bingley likes," said her mother resentfully, "since we are not to visit."

"But you forget, mama," said Elizabeth, "that we shall meet him at the assemblies, and that Mrs. Long has promised to introduce him."

"I do not believe Mrs. Long will do any such thing. She has two nieces of her own. She is a selfish, hypocritical woman, and I have no opinion of her."

"No more have I," said Mr. Bennet; "and I am glad to find that you do not depend on her serving you."`,
      },
      {
        title: 'Chapter 3',
        text: `Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject, was sufficient to draw from her husband any satisfactory description of Mr. Bingley.

They attacked him in various ways; with barefaced questions, ingenious suppositions, and distant surmises; but he eluded the skill of them all; and they were at last obliged to accept the second-hand intelligence of their neighbour Lady Lucas. Her report was highly favourable. Sir William had been delighted with him. He was quite young, wonderfully handsome, extremely agreeable, and, to crown the whole, he meant to be at the next assembly with a large party.

Nothing could be more delightful! To be fond of dancing was a certain step towards falling in love; and very lively hopes of Mr. Bingley's heart were entertained.`,
      },
    ],
    annotations: [
      {
        chapter: 0,
        quote:
          'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
        note: 'The whole book is in this sentence: the irony is that it is the wives who are in want of husbands.',
        color: HIGHLIGHTS[0],
      },
      { chapter: 0, quote: 'This was invitation enough.', color: HIGHLIGHTS[2] },
      {
        chapter: 1,
        quote: 'I hope Mr. Bingley will like it, Lizzy.',
        note: 'He has already been. He is enjoying himself.',
        color: HIGHLIGHTS[1],
      },
    ],
    entities: [
      {
        kind: 'character',
        name: 'Elizabeth Bennet',
        alias: 'Lizzy',
        summary: 'The second daughter, and the one her father talks to.',
      },
      {
        kind: 'character',
        name: 'Mr. Bennet',
        summary: 'Teases his wife rather than answering her. Has already called on Bingley.',
      },
      {
        kind: 'character',
        name: 'Mrs. Bennet',
        summary: 'Five daughters and no entail in her favour. Everything follows from that.',
      },
      { kind: 'place', name: 'Netherfield Park', summary: 'Let at last, which is what starts it.' },
      {
        kind: 'word',
        name: 'entailed',
        summary: 'Settled on an heir by law, so it cannot be left to a daughter.',
      },
      {
        kind: 'word',
        name: 'Michaelmas',
        summary: '29 September — a quarter day, when rents fell due and tenancies began.',
      },
    ],
  },

  {
    title: 'Moby-Dick',
    author: 'Herman Melville',
    kind: 'novel',
    language: 'en',
    stars: 4,
    tags: ['sea'],
    progress: 0.08,
    chapters: [
      {
        title: 'Loomings',
        text: `Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.

It is a way I have of driving off the spleen, and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can.

There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs—commerce surrounds it with her surf. Right and left, the streets take you waterward.`,
      },
      {
        title: 'The Carpet-Bag',
        text: `I stuffed a shirt or two into my old carpet-bag, tucked it under my arm, and started for Cape Horn and the Pacific. Quitting the good city of old Manhatto, I duly arrived in New Bedford. It was on a Saturday night in December. Much was I disappointed upon learning that the little packet for Nantucket had already sailed, and that no way of reaching that place would offer, till the following Monday.

Now having a night, a day, and still another night following before me in New Bedford, ere I could embark for my destined port, it became a matter of concernment where I was to eat and sleep meanwhile.`,
      },
    ],
    annotations: [
      {
        chapter: 0,
        quote: 'Call me Ishmael.',
        note: 'Not "my name is". He is telling you what to call him, which is not the same thing.',
        color: HIGHLIGHTS[0],
      },
      {
        chapter: 0,
        quote: 'whenever it is a damp, drizzly November in my soul',
        color: HIGHLIGHTS[3],
      },
    ],
    entities: [
      { kind: 'character', name: 'Ishmael', summary: 'The narrator, as far as that goes.' },
      { kind: 'place', name: 'New Bedford', summary: 'Where the whaling money was.' },
      { kind: 'place', name: 'Nantucket' },
      {
        kind: 'word',
        name: 'hypos',
        summary: 'Low spirits — short for hypochondria, as the word was then used.',
      },
      { kind: 'word', name: 'spleen', summary: 'Ill temper or melancholy, the organ blamed for it.' },
    ],
  },

  {
    title: 'On the Origin of Species',
    author: 'Charles Darwin',
    kind: 'textbook',
    language: 'en',
    stars: 5,
    tags: ['science'],
    progress: 0.5,
    chapters: [
      {
        title: 'Introduction',
        text: `When on board H.M.S. Beagle, as naturalist, I was much struck with certain facts in the distribution of the inhabitants of South America, and in the geological relations of the present to the past inhabitants of that continent. These facts seemed to me to throw some light on the origin of species—that mystery of mysteries, as it has been called by one of our greatest philosophers.

On my return home, it occurred to me, in 1837, that something might perhaps be made out on this question by patiently accumulating and reflecting on all sorts of facts which could possibly have any bearing on it. After five years' work I allowed myself to speculate on the subject, and drew up some short notes.`,
      },
      {
        title: 'Natural Selection',
        text: `Can the principle of selection, which we have seen is so potent in the hands of man, apply under nature? I think we shall see that it can act most efficiently.

Let it be borne in mind how infinitely complex and close-fitting are the mutual relations of all organic beings to each other and to their physical conditions of life. Can it, then, be thought improbable, seeing that variations useful to man have undoubtedly occurred, that other variations useful in some way to each being in the great and complex battle of life, should sometimes occur in the course of thousands of generations?

If such do occur, can we doubt (remembering that many more individuals are born than can possibly survive) that individuals having any advantage, however slight, over others, would have the best chance of surviving and of procreating their kind? This preservation of favourable variations and the rejection of injurious variations, I call Natural Selection.`,
      },
    ],
    annotations: [
      {
        chapter: 1,
        quote:
          'This preservation of favourable variations and the rejection of injurious variations, I call Natural Selection.',
        note: 'The definition, and he only gets to it after arguing for it. Worth remembering that order.',
        color: HIGHLIGHTS[0],
      },
    ],
    entities: [
      {
        kind: 'term',
        name: 'Natural selection',
        summary:
          'The preservation of favourable variations and the rejection of injurious ones, across generations.',
        studied: { daysAgo: 2, reps: 3 },
      },
      {
        kind: 'term',
        name: 'Struggle for existence',
        summary: 'More individuals are born than can survive, so any slight advantage tells.',
        studied: { daysAgo: 9, reps: 1 },
      },
      {
        kind: 'term',
        name: 'Divergence of character',
        summary: 'Varieties become more unlike as each is pushed towards a different way of living.',
      },
      {
        kind: 'word',
        name: 'naturalist',
        summary: 'A student of natural history — what a biologist was called before the word existed.',
      },
    ],
    cards: [
      {
        front: 'What does Darwin mean by natural selection?',
        back: 'Favourable variations are preserved and injurious ones rejected, over many generations.',
        studied: { daysAgo: 1, reps: 2 },
      },
      {
        front: 'Why does any slight advantage matter at all?',
        back: 'Because many more individuals are born than can possibly survive.',
        studied: { daysAgo: 6, reps: 1 },
      },
      {
        front: 'What made Darwin start on the question, and when?',
        back: 'The distribution of South American species, seen from the Beagle; he began notes in 1837.',
      },
    ],
  },

  {
    title: 'The Gospel according to John',
    author: 'King James Version',
    kind: 'scripture',
    language: 'en',
    tags: ['study'],
    progress: 0.2,
    chapters: [
      {
        title: 'John 1',
        text: `In the beginning was the Word, and the Word was with God, and the Word was God.

The same was in the beginning with God.

All things were made by him; and without him was not any thing made that was made.

In him was life; and the life was the light of men.

And the light shineth in darkness; and the darkness comprehended it not.

There was a man sent from God, whose name was John.

The same came for a witness, to bear witness of the Light, that all men through him might believe.

He was not that Light, but was sent to bear witness of that Light.

And the Word was made flesh, and dwelt among us, and we beheld his glory, the glory as of the only begotten of the Father, full of grace and truth.`,
      },
      {
        title: 'John 3',
        text: `There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:

The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him.

Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.

Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother's womb, and be born?

For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.`,
      },
    ],
    annotations: [
      {
        chapter: 0,
        quote: 'And the Word was made flesh, and dwelt among us',
        note: 'ἐσκήνωσεν — pitched his tent. The tabernacle word.',
        color: HIGHLIGHTS[2],
      },
      { chapter: 1, quote: 'The same came to Jesus by night', color: HIGHLIGHTS[0] },
    ],
    entities: [
      { kind: 'character', name: 'Nicodemus', summary: 'A Pharisee and a ruler; comes at night.' },
      { kind: 'character', name: 'John the Baptist', alias: 'John' },
      { kind: 'place', name: 'Galilee' },
      { kind: 'place', name: 'Capernaum' },
      {
        kind: 'word',
        name: 'Word',
        alias: 'Logos',
        summary: 'λόγος — in John, the one through whom everything was made.',
        studied: { daysAgo: 3, reps: 2 },
      },
      {
        kind: 'word',
        name: 'only begotten',
        summary: 'μονογενής — one of a kind, rather than anything about being born.',
      },
      { kind: 'term', name: 'Born again', summary: 'γεννηθῇ ἄνωθεν — born again, or born from above.' },
    ],
    cards: [
      {
        front: 'What does "dwelt among us" translate, and what does it evoke?',
        back: 'ἐσκήνωσεν — "pitched his tent". It points back to the tabernacle.',
        studied: { daysAgo: 4, reps: 1 },
      },
    ],
  },

  {
    title: 'A Mathematical Theory of Communication',
    author: 'Claude E. Shannon',
    kind: 'paper',
    language: 'en',
    stars: 5,
    progress: 0.15,
    chapters: [
      {
        title: 'Introduction',
        text: `The recent development of various methods of modulation such as PCM and PPM which exchange bandwidth for signal-to-noise ratio has intensified the interest in a general theory of communication.

The fundamental problem of communication is that of reproducing at one point either exactly or approximately a message selected at another point. Frequently the messages have meaning; that is they refer to or are correlated according to some system with certain physical or conceptual entities. These semantic aspects of communication are irrelevant to the engineering problem.

The significant aspect is that the actual message is one selected from a set of possible messages. The system must be designed to operate for each possible selection, not just the one which will actually be chosen since this is unknown at the time of design.`,
      },
    ],
    annotations: [
      {
        chapter: 0,
        quote: 'These semantic aspects of communication are irrelevant to the engineering problem.',
        note: 'The sentence that makes the whole field possible. Meaning is somebody else’s department.',
        color: HIGHLIGHTS[0],
      },
    ],
    entities: [
      {
        kind: 'word',
        name: 'bandwidth',
        summary: 'The range of frequencies a channel carries — here, something traded for noise margin.',
      },
      {
        kind: 'word',
        name: 'entropy',
        summary: 'The average information per symbol of a source; how uncertain the next symbol is.',
        studied: { daysAgo: 5, reps: 2 },
      },
    ],
  },
];
