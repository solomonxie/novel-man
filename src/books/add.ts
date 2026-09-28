import { DEFAULT_KIND } from './kinds';
import { keepByHand, keepWork } from './save';
import {
  enqueueGutenberg,
  enqueuePaper,
  enqueueRepoBible,
  enqueueStandardEbook,
  enqueueTranslation,
} from '../import/queue';
import { kindFromSource } from '../sources/registry';
import type { Choice } from '../sources/chosen';

/**
 * Every way a book gets onto the shelf, as functions — the thing the add menu
 * used to be a menu about.
 *
 * Each returns where to go and nothing else: a download goes to the job that
 * is doing it, a record goes to the book it just wrote. The caller pushes; it
 * does not have to know which kind of answer it got.
 *
 * Nothing here asks what kind of book it is. That question used to gate the
 * whole of adding — before the title, before the source — and it is answered
 * better by where the book came from and corrected in one tap on the book's
 * own page. See `kindFromSource`.
 */

export type CanonChoice = { apocrypha?: boolean };

export async function addChoice(choice: Choice, options?: CanonChoice): Promise<string> {
  const kind = kindFromSource(choice.source);
  // The catalog that hands over records and no files: there is nothing to
  // fetch, so it is written straight to the shelf.
  if (choice.source === 'openlibrary') return `/book/${await keepWork(choice.work, kind)}`;
  if (choice.source === 'ebible') {
    return `/job/${enqueueTranslation(choice.translation, Boolean(options?.apocrypha))}`;
  }
  if (choice.source === 'repo') return `/job/${enqueueRepoBible(choice.edition)}`;
  if (choice.source === 'arxiv') return `/job/${enqueuePaper(choice.paper, kind)}`;
  if (choice.source === 'standardebooks') return `/job/${enqueueStandardEbook(choice.book, kind)}`;
  return `/job/${enqueueGutenberg(choice.book, kind)}`;
}

/** A title and nothing else: no file follows this one. */
export async function addTyped(title: string, author = ''): Promise<string> {
  return `/book/${await keepByHand({ title: title.trim(), author, kind: DEFAULT_KIND })}`;
}
