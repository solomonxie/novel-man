import { DEFAULT_KIND } from './kinds';
import { keepByHand, keepWork } from './save';
import { updateBook } from '../db/repo';
import {
  enqueueGutenberg,
  enqueueImport,
  enqueuePaper,
  enqueueRepoBible,
  enqueueStandardEbook,
  enqueueTranslation,
} from '../import/queue';
import { authorLine } from '../sources/arxiv';
import { kindFromSource } from '../sources/registry';
import type { Choice } from '../sources/chosen';
import type { PickedFile } from '../import/sources/picker';

/**
 * Every way a book gets onto the shelf, as functions — the thing the add menu
 * used to be a menu about.
 *
 * The record comes first, always. A book is a row on the shelf the moment it
 * is chosen, with whatever the catalog knew about it; the manuscript is a job
 * that fills that row in afterwards. It used to be the other way round — the
 * download produced the book — which meant a fetch that failed left nothing
 * at all, a fetch that succeeded twice left two, and there was nowhere to
 * hang a note or a rating until the bytes had arrived.
 *
 * Nothing here asks what kind of book it is. That question used to gate the
 * whole of adding — before the title, before the source — and it is answered
 * better by where the book came from and corrected in one tap on the book's
 * own page. See `kindFromSource`.
 */

export type CanonChoice = { apocrypha?: boolean };

/** The record, and the job that goes and gets its words. */
export async function addChoice(choice: Choice, options?: CanonChoice): Promise<string> {
  const kind = kindFromSource(choice.source);

  // The catalog that hands over records and no files: there is nothing to
  // fetch, so the record is the whole of it.
  if (choice.source === 'openlibrary') return `/book/${await keepWork(choice.work, kind)}`;

  // A bible is the one thing whose contents are not in any catalog row: the
  // books, the chapters and every verse boundary come out of the download
  // itself. A record written first would be a shelf entry with nothing under
  // it, replaced wholesale a minute later — so these two still arrive whole.
  if (choice.source === 'ebible') {
    return `/job/${enqueueTranslation(choice.translation, Boolean(options?.apocrypha))}`;
  }
  if (choice.source === 'repo') return `/job/${enqueueRepoBible(choice.edition)}`;

  if (choice.source === 'arxiv') {
    const { paper } = choice;
    const id = await keepByHand({ title: paper.title, author: authorLine(paper), kind });
    await updateBook(id, {
      year: paper.published.slice(0, 4),
      edition: [paper.id, paper.category].filter(Boolean).join(' · '),
      summary: paper.abstract,
    });
    enqueuePaper(paper, kind, id);
    return `/book/${id}`;
  }

  if (choice.source === 'standardebooks') {
    const { book } = choice;
    // What the list said it is written in. A detection over the real text
    // corrects it when the file lands, and is the better evidence of the two.
    const id = await keepByHand({
      title: book.title,
      author: book.author,
      kind,
      language: book.language || undefined,
    });
    enqueueStandardEbook(book, kind, id);
    return `/book/${id}`;
  }

  const { book } = choice;
  const id = await keepByHand({ title: book.title, author: book.author, kind });
  enqueueGutenberg(book, kind, id);
  return `/book/${id}`;
}

/**
 * A file the reader picked, or one fetched from a link — by then the same
 * thing. It always lands on a book that already exists: a manuscript is
 * something a record gets, not something that makes one.
 */
export function addFile(file: PickedFile, into: string): string {
  return `/job/${enqueueImport({ ...file, into })}`;
}

/** A title and nothing else: no file follows this one unless one is given it. */
export async function addTyped(title: string, author = ''): Promise<string> {
  return `/book/${await keepByHand({ title: title.trim(), author, kind: DEFAULT_KIND })}`;
}
