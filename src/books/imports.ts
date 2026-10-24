import { listBooks, type BookListItem } from '../db/repo';

/** The shelf, oldest first: where it holds a book twice, the first copy is the one matched. */
export async function shelfBooks(): Promise<BookListItem[]> {
  return (await listBooks()).slice().sort((a, b) => a.created_at - b.created_at);
}

/** One row of a file, where it is going, and whether the reader left it out. */
export type Planned<T> = { item: T; onto: BookListItem | null; skip: boolean };

/** What a book said before an import changed it. */
export type Was = {
  id: string;
  stars: number | null;
  review: string | null;
  status: string | null;
  year: string | null;
};
