import { runChat } from '../ai/keys';
import { parseJson } from '../ai/run';
import { labelFor } from './languages';

/**
 * What a name is called in the other language, asked once for a list of them.
 *
 * A word mapping is the one place a translation can be fixed once instead of
 * three hundred times, which is exactly why filling it in is the tedious part:
 * forty names, typed by hand, before the first chapter reads properly. So the
 * model proposes them and the reader corrects what it got wrong — a reference
 * rather than an answer, which is also why they arrive as ordinary editable
 * rows and not as anything marked "confirmed".
 *
 * One request for the whole list: forty names asked one at a time is forty
 * round trips for a page nobody wants to wait on.
 */
const BATCH = 40;

export async function suggestTerms(
  sources: string[],
  from: string,
  target: string,
  context?: { title: string; summary: string | null },
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const wanted = sources.slice(0, BATCH).filter((source) => source.trim());
  if (!wanted.length) return new Map();

  const answer = await runChat(
    [
      {
        role: 'system',
        content:
          `You are building the terminology of a published ${labelFor(target) || target} ` +
          `translation of a novel written in ${labelFor(from) || from}. Each item is a ` +
          'name or a term from that book.\n\n' +
          // What the term *is* decides how it is rendered, so it is decided
          // first. The same characters are a surname, a rank and a place in
          // three different rows.
          'For each one, work out what it is — a personal name, a title or rank, a ' +
          'nickname, a place, an organisation, an artefact, a concept — and then choose ' +
          'the rendering that would read most naturally in a novel in the target ' +
          'language, while keeping the term\'s identity, its cultural setting and what ' +
          'it means to the story.\n\n' +
          'Personal names: neither transliterate blindly nor replace them with names ' +
          'from the target culture. Keep the original identity where it can be kept, ' +
          'and localise only where the original would be unusually hard to read, ' +
          'confusing, or unnatural in the target language.\n\n' +
          'Titles, roles, places, organisations and descriptive terms go by meaning and ' +
          'function rather than by sound. But do not translate a name literally merely ' +
          'because its characters carry a meaning: render the meaning only where the ' +
          'story clearly intends it to be read.\n\n' +
          'Where an established rendering already exists — a real place, a known work — ' +
          'use it. Keep each answer short and idiomatic: something a reader could meet ' +
          'on every page without stumbling. Do not gloss, explain, or turn a term into ' +
          'a phrase. Skip ordinary vocabulary: only recurring terminology and proper ' +
          'nouns belong in a glossary.\n\n' +
          'Reply with JSON only: {"terms":[{"source","translation"}]}, one row per item ' +
          'given, "source" copied exactly. Leave a row out rather than guessing at one ' +
          'you cannot place.',
      },
      {
        role: 'user',
        content: [
          context?.title ? `Book: ${context.title}` : '',
          context?.summary?.trim() ? `What it is about: ${context.summary.trim().slice(0, 400)}` : '',
          `Terms:\n${wanted.map((source) => `- ${source}`).join('\n')}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    { maxTokens: Math.min(2000, 200 + wanted.length * 30), signal }
  );

  const found = parseJson<{ terms?: { source?: string; translation?: string }[] }>(answer);
  const byName = new Map<string, string>();
  const asked = new Map(wanted.map((source) => [source.toLowerCase(), source]));
  for (const row of found.terms ?? []) {
    const source = asked.get(String(row?.source ?? '').trim().toLowerCase());
    const translation = String(row?.translation ?? '').trim();
    if (source && translation) byName.set(source, translation);
  }
  return byName;
}
