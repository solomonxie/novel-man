/**
 * Where an offset into the old manuscript lands in the new one, as arithmetic
 * and as SQL. The two must agree exactly; the fixture tests hold them to it.
 */

/** An old range of the manuscript and where it lands in the new one. */
export type Segment = { os: number; oe: number; ns: number; ne: number; linear: boolean };

/** Neighbouring stretches that moved by the same amount are one stretch. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.oe <= segment.os && segment.linear) continue;
    const last = out[out.length - 1];
    if (last && last.linear && segment.linear && last.oe === segment.os && last.ns - last.os === segment.ns - segment.os) {
      last.oe = segment.oe;
      last.ne = segment.ne;
    } else out.push({ ...segment });
  }
  return out;
}

export function mapOffset(segments: Segment[], offset: number, oldLength: number, newLength: number): number {
  for (const s of segments) {
    if (offset < s.os || offset >= s.oe) continue;
    if (s.linear) return Math.min(s.ns + (offset - s.os), s.ne);
    return s.ns + Math.floor(((offset - s.os) * (s.ne - s.ns)) / Math.max(1, s.oe - s.os));
  }
  return newLength + Math.max(0, offset - oldLength);
}

export function offsetCase(segments: Segment[], column: string, oldLength: number, newLength: number): string {
  const arms = segments.map((s) =>
    s.linear
      ? `WHEN ${column} >= ${s.os} AND ${column} < ${s.oe} THEN MIN(${column} + ${s.ns - s.os}, ${s.ne})`
      : `WHEN ${column} >= ${s.os} AND ${column} < ${s.oe} THEN ${s.ns} + ((${column} - ${s.os}) * ${s.ne - s.ns}) / ${Math.max(1, s.oe - s.os)}`
  );
  return `(CASE ${arms.join(' ')} ELSE ${newLength} + MAX(0, ${column} - ${oldLength}) END)`;
}

/** Old chapter number to new, as runs that share a shift. */
export function indexCase(newIdx: Map<number, number>, column: string): string {
  const pairs = [...newIdx].sort((a, b) => a[0] - b[0]);
  const arms: string[] = [];
  for (let at = 0; at < pairs.length;) {
    const shiftBy = pairs[at][1] - pairs[at][0];
    let until = at;
    while (until + 1 < pairs.length && pairs[until + 1][1] - pairs[until + 1][0] === shiftBy) until++;
    arms.push(`WHEN ${column} >= ${pairs[at][0]} AND ${column} <= ${pairs[until][0]} THEN ${column} + ${shiftBy}`);
    at = until + 1;
  }
  return arms.length ? `(CASE ${arms.join(' ')} ELSE ${column} END)` : column;
}
