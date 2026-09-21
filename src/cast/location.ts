/**
 * A place in a bible or a history is somewhere you could stand today, and the
 * text will not tell you where. What a model does know is the name the place
 * goes by now — Hazor is Tel Hazor, Shushan is Susa in Iran — and a name is
 * the right thing to ask it for: a map searches names, and a name it gets
 * wrong is visibly wrong, where a coordinate it gets wrong is a pin dropped
 * confidently in a field.
 */

export type Certainty = 'certain' | 'probable' | 'disputed';

export type Pin = {
  /** The place today, as a map would be asked for it: "Tel Hazor, Israel". */
  located: string;
  located_certainty: Certainty;
};

const CERTAINTIES: Certainty[] = ['certain', 'probable', 'disputed'];
/**
 * A name, not a sentence about one. "Sultantepe, Şanlıurfa Province, Turkey"
 * is the long end of a real answer; anything past it is the model hedging in
 * prose, and prose put to a map search finds nothing.
 */
const LONGEST = 48;
const MOST_WORDS = 6;
/** What "I don't know" looks like when it gets written into the name anyway. */
const NOT_A_PLACE = /^(unknown|unidentified|uncertain|unclear|n\/?a|none|null|[-–—]+)$/i;

export function parsePin(raw: unknown): Pin | null {
  if (!raw || typeof raw !== 'object') return null;
  const claim = raw as Record<string, unknown>;
  const modern = typeof claim.modern === 'string' ? claim.modern.trim() : '';
  if (!modern || modern.length > LONGEST || NOT_A_PLACE.test(modern)) return null;
  if (modern.split(/\s+/).length > MOST_WORDS) return null;
  const stated = String(claim.certainty ?? '').toLowerCase();
  return {
    located: modern,
    located_certainty: CERTAINTIES.find((entry) => entry === stated) ?? 'probable',
  };
}

/**
 * Whichever map the phone opens it with: the Google Maps app if it is
 * installed, Google's web map otherwise. The name goes out as a search, which
 * is what makes this work at every scale — a tell, a town or a whole land all
 * resolve, and one nobody can find shows as a search that found nothing
 * rather than as a pin in the wrong place.
 */
export function mapUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

/** What to call the pin: the place today, falling back to the book's name for it. */
export function pinLabel(place: { name: string; located: string | null }): string {
  return place.located?.trim() || place.name;
}
