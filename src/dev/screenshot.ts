import { closeDatabase } from '../db';
import { listBooks } from '../db/repo';
import { router } from '../navigation/router';
import { setDemoMode } from './demo';
import { seedDemoLibrary } from './seedDemo';

// Only reachable when the native side passes a `screen` prop (SCREENSHOTS builds).
export async function prepareScreenshots() {
  await setDemoMode(true);
  closeDatabase();
  await seedDemoLibrary();
}

/** `/book/@Moby-Dick/cast`: `@Title` (underscores for spaces) becomes that book's id. */
export async function openScreen(spec: string) {
  const books = await listBooks();
  const path = spec.replace(/@([^/]+)/, (_, name: string) => {
    const title = name.replace(/_/g, ' ').toLowerCase();
    return books.find((b) => b.title.toLowerCase().startsWith(title))?.id ?? name;
  });
  router.replace(path);
}
