import { bookFromIndex, type GutenbergBook } from './gutenberg';
import { bookFromIndex as standardEbookFromIndex, type StandardEbook } from './standardEbooks';
import type { Paper } from './arxiv';
import type { Translation } from './ebible';
import type { RepoEdition } from './repoBible';
import { workOf, type Work } from './openLibrary';
import { readCatalog } from './ebible';
import type { IndexedBook } from './catalog';

/**
 * What the reader picked on a find page, on its way back to the Add page. It
 * is a handoff between two screens of one flow rather than state anything
 * owns — the Add page takes it, and taking it clears it.
 */
export type Choice =
  | { source: 'ebible'; translation: Translation }
  | { source: 'repo'; edition: RepoEdition }
  | { source: 'gutenberg'; book: GutenbergBook }
  | { source: 'standardebooks'; book: StandardEbook }
  | { source: 'arxiv'; paper: Paper }
  /** A record and nothing more: no file follows this one. */
  | { source: 'openlibrary'; work: Work };

let held: Choice | null = null;

export function choose(choice: Choice) {
  held = choice;
}

/**
 * Whether one is waiting, without spending it. The page a pick comes back to
 * has to know to open the menu that consumes it, and the menu is what
 * consumes it — so looking and taking are two questions.
 */
export function pendingChoice(): Choice | null {
  return held;
}

export function takeChoice(): Choice | null {
  const choice = held;
  held = null;
  return choice;
}

/**
 * A row out of a kept list, as the thing every source hands over.
 *
 * Open Library keeps a list per category, so a kept source is
 * `openlibrary:fiction` and the source it belongs to is the part before the
 * colon. A bible is the one that can come back null: the index knows the
 * edition and the catalog file describing it can be missing — a restore
 * brings one back without the other — and there is nothing to choose until
 * that list is fetched again.
 */
export function choiceFromIndex(hit: IndexedBook): Choice | null {
  const base = hit.source.split(':')[0];
  if (base === 'gutenberg') return { source: 'gutenberg', book: bookFromIndex(hit) };
  if (base === 'standardebooks') {
    return { source: 'standardebooks', book: standardEbookFromIndex(hit) };
  }
  if (base === 'openlibrary') return { source: 'openlibrary', work: workOf(hit) };
  const translation = readCatalog()?.translations.find((entry) => entry.id === hit.extId);
  return translation ? { source: 'ebible', translation } : null;
}
