import type { GutenbergBook } from './gutenberg';
import type { StandardEbook } from './standardEbooks';
import type { Paper } from './arxiv';
import type { Translation } from './ebible';
import type { RepoEdition } from './repoBible';
import type { Work } from './openLibrary';

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

export function takeChoice(): Choice | null {
  const choice = held;
  held = null;
  return choice;
}
