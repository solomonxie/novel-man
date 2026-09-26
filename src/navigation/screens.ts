import Index from '../../app/index';
import Job from '../../app/job/[id]';
import SourceFind from '../../app/source/find';
import SourceEbible from '../../app/source/ebible';
import SourceEsv from '../../app/source/esv';
import SourceArxiv from '../../app/source/arxiv';
import SourceOpenLibrary from '../../app/source/openlibrary';
import SourceGoodreads from '../../app/source/goodreads';
import SourceDouban from '../../app/source/douban';
import Book from '../../app/book/[id]';
import Entity from '../../app/entity/[id]';
import Chapter from '../../app/chapter/[id]';
import Place from '../../app/place/[id]';
import Term from '../../app/term/[id]';
import Scene from '../../app/scene/[id]';
import AiKey from '../../app/ai-key/[id]';
import AiRequest from '../../app/ai-request/[id]';
import CloudLibrary from '../../app/settings/cloud-library';
import IcloudBackups from '../../app/settings/icloud-backups';
import Notes from '../../app/book/[id]/notes';
import Structure from '../../app/book/[id]/structure';
import Cast from '../../app/book/[id]/cast';
import Scenes from '../../app/book/[id]/scenes';
import Parts from '../../app/book/[id]/parts';
import Part from '../../app/book/[id]/part/[idx]';
import Graph from '../../app/book/[id]/graph';
import Translation from '../../app/book/[id]/translation';
import Terms from '../../app/book/[id]/terms';
import Mapping from '../../app/book/[id]/mapping';
import Script from '../../app/book/[id]/script';
import Reader from '../../app/reader/[id]';
import BookListScreen from '../../app/list/[id]';
import Tag from '../../app/tag/[name]';

export type Screen = {
  /** The path the app writes: `/book/[id]/notes`, with `[…]` for a value. */
  path: string;
  component: React.ComponentType;
  /** Only the shelf and the reader draw their own; the rest get a bar. */
  header?: boolean;
  animation?: 'fade';
};

/**
 * What the file tree used to say. Every path the app pushes is here, and the
 * name a screen is registered under is its path — one string to keep in step
 * instead of a name and a pattern that can drift apart.
 */
export const screens: Screen[] = [
  { path: '/', component: Index },
  { path: '/job/[id]', component: Job, header: true },
  { path: '/source/find', component: SourceFind, header: true },
  { path: '/source/ebible', component: SourceEbible, header: true },
  { path: '/source/esv', component: SourceEsv, header: true },
  { path: '/source/arxiv', component: SourceArxiv, header: true },
  { path: '/source/openlibrary', component: SourceOpenLibrary, header: true },
  { path: '/source/goodreads', component: SourceGoodreads, header: true },
  { path: '/source/douban', component: SourceDouban, header: true },
  { path: '/book/[id]', component: Book, header: true },
  { path: '/entity/[id]', component: Entity, header: true },
  { path: '/chapter/[id]', component: Chapter, header: true },
  { path: '/place/[id]', component: Place, header: true },
  { path: '/term/[id]', component: Term, header: true },
  { path: '/scene/[id]', component: Scene, header: true },
  { path: '/ai-key/[id]', component: AiKey, header: true },
  { path: '/ai-request/[id]', component: AiRequest, header: true },
  { path: '/settings/cloud-library', component: CloudLibrary, header: true },
  { path: '/settings/icloud-backups', component: IcloudBackups, header: true },
  { path: '/book/[id]/notes', component: Notes, header: true },
  { path: '/book/[id]/structure', component: Structure, header: true },
  { path: '/book/[id]/cast', component: Cast, header: true },
  { path: '/book/[id]/scenes', component: Scenes, header: true },
  { path: '/book/[id]/parts', component: Parts, header: true },
  { path: '/book/[id]/part/[idx]', component: Part, header: true },
  { path: '/book/[id]/graph', component: Graph, header: true },
  { path: '/book/[id]/translation', component: Translation, header: true },
  { path: '/book/[id]/terms', component: Terms, header: true },
  { path: '/book/[id]/mapping', component: Mapping, header: true },
  { path: '/book/[id]/script', component: Script, header: true },
  { path: '/list/[id]', component: BookListScreen, header: true },
  { path: '/tag/[name]', component: Tag, header: true },
  { path: '/reader/[id]', component: Reader, animation: 'fade' },
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
