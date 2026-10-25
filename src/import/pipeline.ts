import { yieldToUI } from '../async/yield';
import { adoptSourceFile, extensionOf, writeImage } from '../storage/files';
import { getBook, replacePages, saveImportedBook, setOrigin } from '../db/repo';
import { shelfBooks } from '../books/imports';
import { shelfMatch } from '../sources/sameBook';
import { bookWithSource, chapterBodies, hintsIn, mergeInto, type Decision, type Incoming } from '../db/versions';
import { alignChapters, type Step } from '../structure/merge';
import { applyToImport } from '../backup/pending';
import { detectChapters } from '../structure/detect';
import { hintsOf, pagesOf } from '../structure/document';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { DEFAULT_KIND } from '../books/kinds';
import { normalize } from './normalize';
import { importerFor } from './registry';

export type ImportStage = 'reading' | 'parsing' | 'detecting' | 'saving';
export type ImportProgress = { stage: ImportStage; fraction: number; detail?: string };

export class ImportError extends Error {
  constructor(
    public code: 'unsupported' | 'no-text' | 'unreadable' | 'rejected',
    public detail?: string
  ) {
    super(code);
  }
}

/** What the reader is shown before an uncertain extraction becomes a book. */
export type ImportPreview = {
  sample: string;
  characters: number;
  chapters: number;
  language: string;
  format: string;
};

export type ImportResult = { bookId: string; chapters: number; confident: boolean };

/** The book on the shelf a file looks like a copy of. */
export type SameBook = { id: string; title: string; author: string | null };

/** Both copies, lined up, for the reader to decide between. */
export type MergeProposal = {
  bookId: string;
  title: string;
  fileName: string;
  base: { id: string; title: string; text: string }[];
  incoming: Incoming[];
  steps: Step[];
};

/** Per step: which wording a changed chapter reads as, and which new ones to leave out. */
export type MergeAnswer = { decisions: Record<number, Decision>; skipped: number[] };

/** Questions only the reader can answer, asked while the job waits. Null backs out. */
export type ImportAsk = {
  same?: (book: SameBook) => Promise<'new' | 'merge' | null>;
  merge?: (proposal: MergeProposal) => Promise<MergeAnswer | null>;
};

/** Rough share of total time per stage, measured on a 3.4MB / 509-chapter docx. */
const WEIGHTS: Record<ImportStage, [number, number]> = {
  reading: [0, 0.12],
  parsing: [0.12, 0.92],
  detecting: [0.92, 0.96],
  saving: [0.96, 1],
};

export async function importFile(
  /** `into` lands the words on a book already on the shelf — see `saveImportedBook`. */
  input: { uri: string; name: string; kind?: string; into?: string; match?: boolean },
  onProgress?: (progress: ImportProgress) => void,
  confirm?: (preview: ImportPreview) => Promise<boolean>,
  ask?: ImportAsk
): Promise<ImportResult> {
  const extension = extensionOf(input.name);
  const importer = importerFor(extension);
  if (!importer) throw new ImportError('unsupported', extension || input.name);

  const report = (stage: ImportStage, within = 0, detail?: string) => {
    const [from, to] = WEIGHTS[stage];
    onProgress?.({ stage, fraction: from + (to - from) * within, detail });
  };

  report('reading');
  /**
   * Before the file is touched, not after.
   *
   * Reading it is synchronous all the way down — the filesystem module is
   * JSI-backed, and decoding the base64 it hands back is a loop over tens of
   * millions of characters. Nothing in there gives the thread up. So the queue
   * would start a job, the screen would be told to move to it, and then the
   * thread would be held for several seconds before a single frame could be
   * drawn: the picker's own sheet sat there, frozen, until the parse was
   * already under way.
   *
   * One turn here is what lets the progress page exist before the work that
   * page is reporting on begins.
   */
  await yieldToUI();
  const stored = await adoptSourceFile(input.uri, input.name);
  await yieldToUI();

  report('parsing', 0, importer.label);
  let parsed;
  try {
    parsed = await importer.parse(stored.bytes, input.name, {
      saveImage: writeImage,
      onProgress: async (done, total) => {
        report('parsing', total ? done / total : 0, importer.label);
        // The scan holds the JS thread until it lets go here.
        await yieldToUI();
      },
    });
  } catch (error) {
    throw new ImportError('unreadable', String(error));
  }

  const doc = normalize(parsed.blocks);
  if (!doc.text.trim()) throw new ImportError('no-text');
  await yieldToUI();

  report('detecting');
  const { language } = detectLanguage(doc.text);
  const detection = detectChapters(doc, language);
  // Import no longer guesses at scenes. A chapter arrives sceneless and stays
  // that way until a reader marks one or an analysis reads for them.
  const scenes: { chapterIndex: number; start: number; end: number }[] = [];
  const counts = countUnits(doc.text, language);
  await yieldToUI();

  if (importer.needsPreview && confirm) {
    const accepted = await confirm({
      sample: doc.text.slice(0, 1200),
      characters: doc.text.length,
      chapters: detection.chapters.length,
      language,
      format: importer.label,
    });
    // The stored source file stays either way: rejecting is a judgement about
    // this extraction, not a reason to make the user find the file again.
    if (!accepted) throw new ImportError('rejected', input.name);
  }

  const title = parsed.title?.trim() || input.name.replace(/\.[^.]+$/, '');
  let into = input.into;
  // Picked from the search page, where it is not yet anybody's: if the shelf
  // already has this book, the reader says whether this is another copy of it.
  if (!into && input.match && ask?.same) {
    const found =
      shelfMatch({ title, author: parsed.author }, await shelfBooks()) ?? (await bookWithSource(stored.hash));
    // A fetched edition has no manuscript of its own to fold a file into.
    if (found && !(await getBook(found.id))?.text_source) {
      const answer = await ask.same({ id: found.id, title: found.title, author: found.author });
      if (!answer) throw new ImportError('rejected', input.name);
      if (answer === 'merge') into = found.id;
    }
  }

  // A book that already has words is never overwritten: the file is lined up
  // against it and folded in, chapter by chapter, keeping every wording.
  const target = into ? await getBook(into) : null;
  if (into && target && !target.text_source && target.char_count > 0 && ask?.merge) {
    const base = await chapterBodies(into);
    if (base.length) {
      const docHints = hintsOf(doc);
      const incoming: Incoming[] = detection.chapters.map((chapter) => ({
        title: chapter.title,
        text: doc.text.slice(chapter.start, chapter.end).trimEnd(),
        hints: hintsIn(docHints, chapter.start, chapter.end),
      }));
      const steps = alignChapters(base, incoming);
      await yieldToUI();
      const answer = await ask.merge({
        bookId: into,
        title: target.title,
        fileName: input.name,
        base: base.map((body) => ({ id: body.chapter.id, title: body.title, text: body.text })),
        incoming,
        steps,
      });
      if (!answer) throw new ImportError('rejected', input.name);
      report('saving');
      await mergeInto(
        into,
        steps,
        incoming,
        (index) => answer.decisions[index] ?? 'mine',
        (index) => !answer.skipped.includes(index),
        input.name
      );
      report('saving', 1);
      const added = steps.filter((step, index) => step.kind === 'added' && !answer.skipped.includes(index));
      return { bookId: into, chapters: base.length + added.length, confident: true };
    }
  }

  report('saving');
  const bookId = await saveImportedBook({
    into,
    book: {
      title,
      author: parsed.author?.trim() || null,
      language,
      kind: input.kind ?? DEFAULT_KIND,
      source_name: input.name,
      source_hash: stored.hash,
      source_path: stored.path,
      source_ext: extension,
      word_count: counts.words,
      char_count: doc.text.length,
      cover_hue: hueFromTitle(input.name),
    },
    text: doc.text,
    hints: hintsOf(doc),
    chapters: detection.chapters,
    scenes,
  });
  /**
   * The pages of the original, and what that original was.
   *
   * Only a converted book has either — an EPUB out of `tools/convert-pdf.mjs`,
   * or a scholarly one that marks its printed pages. Everything else leaves
   * both empty and the reader never mentions a page.
   */
  const pages = pagesOf(doc);
  if (pages.length) await replacePages(bookId, pages);
  if (parsed.origin) await setOrigin(bookId, parsed.origin);

  // A backup without manuscripts left this book's own work waiting for the
  // file; the file has just arrived, so it goes back on now.
  await applyToImport(bookId, stored.hash);
  report('saving', 1);

  return { bookId, chapters: detection.chapters.length, confident: detection.method !== 'none' };
}

function hueFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}
