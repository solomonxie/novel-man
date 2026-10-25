import Index from '../../app/index';

export type Screen = {
  /** The path the app writes: `/book/[id]/notes`, with `[…]` for a value. */
  path: string;
  /** The shelf only; every other screen is loaded the first time it opens. */
  component?: React.ComponentType;
  load?: () => React.ComponentType;
  /** Only the shelf and the reader draw their own; the rest get a bar. */
  header?: boolean;
  animation?: 'fade' | 'none';
};

/**
 * What the file tree used to say. Every path the app pushes is here, and the
 * name a screen is registered under is its path — one string to keep in step
 * instead of a name and a pattern that can drift apart.
 */
export const screens: Screen[] = [
  { path: '/', component: Index },
  { path: '/job/[id]', load: () => require('../../app/job/[id]').default, header: true },
  { path: '/merge/[id]', load: () => require('../../app/merge/[id]').default, header: true },
  // No slide: the pill on the shelf becomes this page, and iOS holds the
  // keyboard back until a push has finished — 350ms of slide before the
  // keyboard even starts. Measured: the page's own work is done in 10ms.
  { path: '/find', load: () => require('../../app/find').default, header: true, animation: 'none' },
  { path: '/settings', load: () => require('../../app/settings').default, header: true },
  { path: '/source/ebible', load: () => require('../../app/source/ebible').default, header: true },
  { path: '/source/esv', load: () => require('../../app/source/esv').default, header: true },
  { path: '/source/arxiv', load: () => require('../../app/source/arxiv').default, header: true },
  { path: '/source/openlibrary', load: () => require('../../app/source/openlibrary').default, header: true },
  { path: '/source/goodreads', load: () => require('../../app/source/goodreads').default, header: true },
  { path: '/source/csv', load: () => require('../../app/source/csv').default, header: true },
  { path: '/source/notes', load: () => require('../../app/source/notes').default, header: true },
  { path: '/book/[id]', load: () => require('../../app/book/[id]').default, header: true },
  { path: '/entity/[id]', load: () => require('../../app/entity/[id]').default, header: true },
  { path: '/chapter/[id]', load: () => require('../../app/chapter/[id]').default, header: true },
  { path: '/place/[id]', load: () => require('../../app/place/[id]').default, header: true },
  { path: '/term/[id]', load: () => require('../../app/term/[id]').default, header: true },
  { path: '/word/[id]', load: () => require('../../app/word/[id]').default, header: true },
  { path: '/scene/[id]', load: () => require('../../app/scene/[id]').default, header: true },
  { path: '/ai-key/[id]', load: () => require('../../app/ai-key/[id]').default, header: true },
  { path: '/ai-request/[id]', load: () => require('../../app/ai-request/[id]').default, header: true },
  { path: '/settings/cloud-library', load: () => require('../../app/settings/cloud-library').default, header: true },
  { path: '/settings/icloud-backups', load: () => require('../../app/settings/icloud-backups').default, header: true },
  { path: '/settings/backup-log', load: () => require('../../app/settings/backup-log').default, header: true },
  { path: '/settings/deleted', load: () => require('../../app/settings/deleted').default, header: true },
  { path: '/settings/copies', load: () => require('../../app/settings/copies').default, header: true },
  { path: '/book/[id]/notes', load: () => require('../../app/book/[id]/notes').default, header: true },
  { path: '/book/[id]/structure', load: () => require('../../app/book/[id]/structure').default, header: true },
  { path: '/book/[id]/cast', load: () => require('../../app/book/[id]/cast').default, header: true },
  { path: '/book/[id]/scenes', load: () => require('../../app/book/[id]/scenes').default, header: true },
  { path: '/book/[id]/parts', load: () => require('../../app/book/[id]/parts').default, header: true },
  { path: '/book/[id]/part/[idx]', load: () => require('../../app/book/[id]/part/[idx]').default, header: true },
  { path: '/book/[id]/graph', load: () => require('../../app/book/[id]/graph').default, header: true },
  { path: '/book/[id]/translation', load: () => require('../../app/book/[id]/translation').default, header: true },
  { path: '/book/[id]/terms', load: () => require('../../app/book/[id]/terms').default, header: true },
  { path: '/book/[id]/words', load: () => require('../../app/book/[id]/words').default, header: true },
  { path: '/book/[id]/study', load: () => require('../../app/book/[id]/study').default, header: true },
  { path: '/book/[id]/cards', load: () => require('../../app/book/[id]/cards').default, header: true },
  { path: '/card/[id]', load: () => require('../../app/card/[id]').default, header: true },
  { path: '/book/[id]/mapping', load: () => require('../../app/book/[id]/mapping').default, header: true },
  { path: '/book/[id]/script', load: () => require('../../app/book/[id]/script').default, header: true },
  { path: '/list/[id]', load: () => require('../../app/list/[id]').default, header: true },
  { path: '/tag/[name]', load: () => require('../../app/tag/[name]').default, header: true },
  { path: '/reviews', load: () => require('../../app/reviews').default, header: true },
  { path: '/flagged', load: () => require('../../app/flagged').default, header: true },
  { path: '/status/[name]', load: () => require('../../app/status/[name]').default, header: true },
  { path: '/reader/[id]', load: () => require('../../app/reader/[id]').default, animation: 'fade' },
];

/**
 * Longest and most literal first, so `/book/x/notes` never gets claimed by
 * `/book/[id]` — the order the file tree gave for free.
 */
const byPrecision = [...screens].sort((a, b) => {
  const depth = b.path.split('/').length - a.path.split('/').length;
  if (depth !== 0) return depth;
  const holes = (path: string) => (path.match(/\[/g) ?? []).length;
  return holes(a.path) - holes(b.path);
});

export type Match = { path: string; params: Record<string, string> };

/** `/book/abc/part/2?kind=novel` → the screen it names and everything in it. */
export function matchPath(target: string): Match | null {
  const [withoutQuery, query = ''] = target.split('?');
  const parts = withoutQuery.split('/').filter(Boolean);

  for (const screen of byPrecision) {
    const pattern = screen.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const fits = pattern.every((piece, at) => {
      if (piece.startsWith('[')) {
        params[piece.slice(1, -1)] = decodeURIComponent(parts[at]);
        return true;
      }
      return piece === parts[at];
    });
    if (!fits) continue;
    for (const pair of query.split('&')) {
      const cut = pair.indexOf('=');
      if (cut > 0) params[decodeURIComponent(pair.slice(0, cut))] = decodeURIComponent(pair.slice(cut + 1));
    }
    return { path: screen.path, params };
  }
  return null;
}
