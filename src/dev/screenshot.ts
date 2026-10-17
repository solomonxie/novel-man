import i18n from 'i18next';
import { closeDatabase } from '../db';
import { deleteBook, listBooks, listEntities } from '../db/repo';
import { router } from '../navigation/router';
import { addSampleBook } from '../sample/sample';
import { SAMPLE_GUTENBERG } from '../sample/prideAndPrejudice';
import { setDemoMode } from './demo';
import { seedDemoLibrary } from './seedDemo';

// Only reachable when the native side passes a `screen` prop (SCREENSHOTS builds).
let sampleId: string | undefined;

/**
 * `seed`: `demo` (default) the made-up library; `sample` the real Pride and
 * Prejudice with its prepared analysis (`sample-fresh` imports it again);
 * `off` back to the real library.
 * `lang` applies for this launch only.
 */
export async function prepareScreenshots(seed = 'demo', lang?: string) {
  if (lang) await i18n.changeLanguage(lang);
  await setDemoMode(seed !== 'off');
  closeDatabase();
  if (seed.startsWith('sample')) sampleId = await ensureSample(seed === 'sample-fresh');
  else if (seed === 'demo') await seedDemoLibrary();
}

async function ensureSample(fresh: boolean): Promise<string> {
  for (const book of await listBooks()) {
    if (book.title !== SAMPLE_GUTENBERG.title) continue;
    if (fresh) {
      await deleteBook(book.id);
      continue;
    }
    if ((await listEntities(book.id, 'character')).length > 10) return book.id;
  }
  return new Promise((resolve) => void addSampleBook(resolve));
}

/**
 * `/book/@Moby-Dick/cast`: `@Title` (underscores for spaces) becomes that book's id,
 * `@sample` the sample's. `/entity/@sample~Elizabeth_Bennet`: that book's character or place.
 */
export async function openScreen(spec: string) {
  const books = await listBooks();
  const bookId = (name: string) => {
    if (name === 'sample') return sampleId ?? name;
    const title = name.replace(/_/g, ' ').toLowerCase();
    return books.find((b) => b.title.toLowerCase().startsWith(title))?.id ?? name;
  };
  const entityId = async (book: string, name: string) => {
    const wanted = name.replace(/_/g, ' ');
    const all = [...(await listEntities(book, 'character')), ...(await listEntities(book, 'place'))];
    return all.find((e) => e.name === wanted)?.id ?? name;
  };
  const match = spec.match(/@([^/~]+)(?:~([^/]+))?/);
  if (!match) return router.replace(spec);
  const book = bookId(match[1]);
  const id = match[2] ? await entityId(book, match[2]) : book;
  router.replace(spec.replace(match[0], id));
}
