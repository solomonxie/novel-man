/**
 * When to show a card again.
 *
 * This is SM-2, the algorithm behind the spacing in every flash-card program
 * worth using, and behind it is Ebbinghaus: what is recalled is forgotten on a
 * curve, and each successful recall flattens the curve rather than resetting
 * it. So a card answered right is not put back a fixed distance — it is put
 * back further than last time, and how much further depends on how reliably
 * this particular card has been recalled before.
 *
 * Two answers, not six. SM-2 proper asks the reader to grade their recall from
 * zero to five, which is a judgement nobody makes consistently at eleven at
 * night on the twentieth card. Right or wrong is a judgement anybody can make,
 * and the ease factor carries the nuance instead: a card recalled right five
 * times in a row earns longer gaps than one that has been missed twice, which
 * is the thing the grades were for.
 */

/** The schedule for one card. Nothing here is specific to what is on it. */
export type Schedule = {
  /** Consecutive right answers. A wrong one puts this back to zero. */
  reps: number;
  /** How many times it has been forgotten after being learned. */
  lapses: number;
  /** How well this card sticks, in SM-2's units: bigger is easier. */
  ease: number;
  /** Days until it is due again, from the last answer. */
  intervalDays: number;
  dueAt: number;
  lastAt: number | null;
  /** What was said last time, so a page can show it. */
  lastRecalled: boolean | null;
};

export type Recall = 'right' | 'wrong';

export const DAY = 24 * 60 * 60 * 1000;

/**
 * SM-2's own numbers. The first two gaps are fixed — a card has no history to
 * compute from until it has been right twice — and the ease only starts
 * mattering on the third.
 */
const FIRST = 1;
const SECOND = 6;
/** Where a card starts: unreliable until proven otherwise. */
export const START_EASE = 2.5;
/**
 * SM-2 floors the ease at 1.3. Below that the gaps barely grow and the card
 * comes back for ever; at 1.3 a card is still being shown, just often.
 */
const HARDEST = 1.3;
/**
 * And a ceiling, which SM-2 does not have. Without one a card answered right
 * thirty times is scheduled years out, which for a book somebody is reading
 * this month is the same as deleting it.
 */
const EASIEST = 2.8;
const EASIER = 0.1;
const HARDER = 0.2;
/**
 * A missed card comes back inside the same sitting rather than tomorrow.
 * Getting it wrong and then not seeing it again for a day is how a card stays
 * missed for a week.
 */
const AGAIN = 10 * 60 * 1000;

/** A card nobody has studied yet: due now, and no history to go on. */
export function unseen(now = Date.now()): Schedule {
  return {
    reps: 0,
    lapses: 0,
    ease: START_EASE,
    intervalDays: 0,
    dueAt: now,
    lastAt: null,
    lastRecalled: null,
  };
}

export function answer(current: Schedule, recall: Recall, now = Date.now()): Schedule {
  if (recall === 'wrong') {
    return {
      reps: 0,
      lapses: current.lapses + 1,
      ease: Math.max(HARDEST, current.ease - HARDER),
      intervalDays: 0,
      dueAt: now + AGAIN,
      lastAt: now,
      lastRecalled: false,
    };
  }

  const reps = current.reps + 1;
  const intervalDays =
    reps === 1 ? FIRST : reps === 2 ? SECOND : round(current.intervalDays * current.ease);
  return {
    reps,
    lapses: current.lapses,
    ease: Math.min(EASIEST, current.ease + EASIER),
    intervalDays,
    dueAt: now + intervalDays * DAY,
    lastAt: now,
    lastRecalled: true,
  };
}

/** Whole days, and never backwards: a right answer always buys at least a day. */
function round(days: number): number {
  return Math.max(FIRST, Math.round(days));
}

export function isDue(schedule: Schedule, now = Date.now()): boolean {
  return schedule.dueAt <= now;
}

/**
 * What to study, in what order.
 *
 * Overdue first and the most overdue of those first, because a card a month
 * late is the one closest to being lost. Cards never seen come next — they are
 * due by definition, but a reader who has let fifty cards go overdue is better
 * served by those than by fifty new ones. Nothing else is included: studying
 * ahead of the schedule is how spacing stops working.
 */
export function deckFor<T extends { schedule: Schedule }>(cards: T[], now = Date.now()): T[] {
  return cards
    .filter((card) => isDue(card.schedule, now))
    .sort((a, b) => {
      const seen = Number(a.schedule.lastAt === null) - Number(b.schedule.lastAt === null);
      return seen !== 0 ? seen : a.schedule.dueAt - b.schedule.dueAt;
    });
}

/** When the next card not in today's deck comes back, so a finished session can say so. */
export function nextDueAt(schedules: Schedule[], now = Date.now()): number | null {
  const later = schedules.map((one) => one.dueAt).filter((at) => at > now);
  return later.length ? Math.min(...later) : null;
}
