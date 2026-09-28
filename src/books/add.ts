import { DEFAULT_KIND, kindFromSubjects } from './kinds';
import { keepByHand, keepCoverFrom, keepWork } from './save';
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
import { fillFromEdition, type Candidate } from '../sources/identify';
import { isBible } from '../scripture/canon';
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

/**
 * The record, and the job that goes and gets its words.
 *
 * `into` is a book already on the shelf asking for its text — the second half
 * of the workflow, where a record chosen by name goes looking for an edition.
 * Then there is nothing to create and the job fills that book in.
 */
export async function addChoice(
  choice: Choice,
  options?: CanonChoice,
  into?: string
): Promise<string> {
  const kind = kindFromSource(choice.source);

  if (into) {
    if (choice.source === 'standardebooks') {
      return `/job/${enqueueStandardEbook(choice.book, kind, into)}`;
    }
    if (choice.source === 'gutenberg') {
      return `/job/${enqueueGutenberg(choice.book, kind, into)}`;
    }
    // Everything else builds its own book — a bible's structure comes out of
    // the download — so there is nothing here that could fill this one.
    throw new Error(`${choice.source} cannot fill a book that exists`);
  }


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

/**
 * A book named by a catalog, onto the shelf as a record.
 *
 * This is the front door now. A reader looks a book up by what it is called
 * or by the number on the back of it, and what comes back is the work — not a
 * file, and not a promise that anyone here can supply one. The words come
 * afterwards, from the book's own page, where there is already a book for
 * them to belong to.
 *
 * The edition is asked for in full before anything is written: a search
 * result carries a cover and a title, and the record behind it carries the
 * summary and the number, which are worth one request at the moment somebody
 * commits to a book.
 */
export async function addCandidate(candidate: Candidate): Promise<string> {
  const full = await fillFromEdition(candidate).catch(() => candidate);
  const kind =
    isBible(full.title) ? 'scripture' : kindFromSubjects(full.subjects) ?? DEFAULT_KIND;

  const id = await keepByHand({
    title: full.title,
    author: full.author,
    kind,
    language: full.language ?? undefined,
  });

  // The big one, then the one that was already on screen: not every book has
  // every size, and a large that 404s must not cost the cover just chosen.
  const key = `${id}-${Date.now().toString(36)}`;
  const cover =
    (full.cover ? await keepCoverFrom(full.cover, key) : null) ??
    (full.thumb && full.thumb !== full.cover ? await keepCoverFrom(full.thumb, key) : null);

  await updateBook(id, {
    ...(full.year ? { year: full.year } : {}),
    ...(full.isbn ? { isbn: full.isbn } : {}),
    ...(cover ? { cover_path: cover } : {}),
    ...(full.summary ? { summary: full.summary } : {}),
  });
  return `/book/${id}`;
}
