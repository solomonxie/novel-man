import { useEffect, useState } from 'react';
import {
  type GestureResponderEvent,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { codeColors, inlineCode, readingThemes, space, type ReadingTheme } from '../theme';
import { highlight } from '../reader/highlight';
import { cutAt, drawn, runsIn, type Align, type Run } from '../reader/rich';
import type { Link } from '../reader/links';
import { useDrawing } from '../reader/drawings';
import { DRAWN_SCALE, PX_PER_EX } from '../import/extractor';

type Press = (event: GestureResponderEvent) => void;
type Common = { theme: ReadingTheme; fontSize: number; onPress?: Press; onLongPress?: Press };

const MONO = 'Menlo';

/** An ex at 8px puts an em near 18: the size a formula has to be scaled from to match the page. */
const formulaScale = (fontSize: number) => fontSize / (PX_PER_EX * 2.3) / DRAWN_SCALE;

/** What a fence's language is called on the page. */
const LANGUAGE_NAMES: Record<string, string> = {
  cpp: 'C++', 'c++': 'C++', cc: 'C++', hpp: 'C++', c: 'C', cs: 'C#', csharp: 'C#', js: 'JavaScript',
  javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python',
  sh: 'Shell', bash: 'Shell', shell: 'Shell', zsh: 'Shell', console: 'Shell', rb: 'Ruby', rs: 'Rust',
  rust: 'Rust', go: 'Go', golang: 'Go', kt: 'Kotlin', yml: 'YAML', yaml: 'YAML', json: 'JSON',
  html: 'HTML', xml: 'XML', md: 'Markdown', markdown: 'Markdown', sql: 'SQL', swift: 'Swift', java: 'Java', tex: 'TeX', mermaid: 'Mermaid',
};

/** Menlo's advance, as a share of its size: CJK takes two. */
const MONO_ADVANCE = 0.602;

/**
 * The width of the longest line, set outright: left to measure itself inside a
 * sideways scroller, the text wraps at the screen and there is nothing to scroll.
 */
function listingWidth(body: string, size: number): number {
  let widest = 0;
  for (const line of body.split('\n')) {
    let cells = 0;
    for (const char of line) cells += char.codePointAt(0)! >= 0x2e80 ? 2 : 1;
    widest = Math.max(widest, cells);
  }
  return Math.ceil(widest * size * MONO_ADVANCE) + space.md;
}

const languageName = (lang: string) => LANGUAGE_NAMES[lang] ?? (lang ? lang[0].toUpperCase() + lang.slice(1) : '');

/**
 * A listing, as written: never wrapped, because a line break in code is part
 * of the code — a long line scrolls sideways instead. Coloured by language,
 * and copied whole by the button over it.
 */
export function CodeBlock({ lang, body, theme, fontSize, onPress, onLongPress, onCopy }: Common & {
  lang: string;
  body: string;
  onCopy?: () => void;
}) {
  const { t } = useTranslation();
  const palette = readingThemes[theme];
  const colors = codeColors[theme];
  const size = Math.round(fontSize * 0.8);
  const tokens = highlight(body, lang);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.code, { borderColor: palette.dim }]}>
      <View style={styles.codeHead}>
        <Text style={{ color: palette.dim, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>
          {languageName(lang)}
        </Text>
        {onCopy ? (
          <Pressable onPress={onCopy} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '600' }}>{t('reader.copy')}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <Text
          style={{
            color: palette.text,
            fontFamily: MONO,
            fontSize: size,
            lineHeight: Math.round(size * 1.45),
            width: listingWidth(body, size),
          }}
        >
          {tokens.map((token, at) =>
            token.kind === 'plain' ? (
              token.text
            ) : (
              <Text
                key={at}
                style={{ color: colors[token.kind], fontStyle: token.kind === 'comment' ? 'italic' : undefined }}
              >
                {token.text}
              </Text>
            )
          )}
        </Text>
      </ScrollView>
    </Pressable>
  );
}

const LINES = {
  '': undefined,
  u: 'underline',
  s: 'line-through',
  us: 'underline line-through',
} as const;

/** How a run is drawn, on the page and in a table alike. A link is its colour, as on the web. */
export function runStyle(run: Run, theme: ReadingTheme, fontSize: number, link = false): TextStyle {
  const palette = readingThemes[theme];
  const code = run.code ? inlineCode[theme] : null;
  return {
    fontWeight: run.bold ? '700' : undefined,
    fontStyle: run.italic ? 'italic' : undefined,
    textDecorationLine: LINES[`${run.underline ? 'u' : ''}${run.strike ? 's' : ''}`],
    backgroundColor: run.mark ? palette.tint : code?.bg,
    fontFamily: run.code || run.math ? MONO : undefined,
    fontSize: run.code ? Math.round(fontSize * 0.86) : run.math ? Math.round(fontSize * 0.92) : undefined,
    color: link ? palette.accent : code?.ink,
  };
}

/** How wide a column is, guessed from the longest thing in it before anything is laid out. */
function columnWidths(rows: string[][], fontSize: number): number[] {
  const columns = Math.max(...rows.map((row) => row.length));
  return Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(
      1,
      ...rows.map((row) => runsIn(row[column] ?? '').reduce((sum, run) => sum + run.text.length, 0))
    );
    return Math.min(260, Math.max(56, longest * fontSize * 0.56 + space.sm * 2));
  });
}

/** Rows and columns, scrolling sideways when there are more than the page is wide. */
export function TableBlock({ rows, at, head, align, links = [], onLink, theme, fontSize, onPress, onLongPress }: Common & {
  rows: string[][];
  at: number[][];
  head: boolean;
  align: Align[];
  /** Offsets in the same paragraph `at` counts in. */
  links?: { from: number; to: number; link: Link }[];
  onLink?: (link: Link) => void;
}) {
  const palette = readingThemes[theme];
  const size = Math.round(fontSize * 0.85);
  const widths = columnWidths(rows, size);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View style={[styles.table, { borderColor: palette.dim }]}>
          {rows.map((row, rowAt) => {
            const isHead = head && rowAt === 0;
            return (
              <View
                key={rowAt}
                style={[
                  styles.row,
                  { borderColor: palette.dim },
                  isHead ? { backgroundColor: palette.tint } : null,
                  rowAt === rows.length - 1 ? { borderBottomWidth: 0 } : null,
                ]}
              >
                {widths.map((width, column) => (
                  <View key={column} style={[styles.cell, { width, borderColor: palette.dim }]}>
                    <Text
                      style={{
                        color: palette.text,
                        fontSize: size,
                        lineHeight: Math.round(size * 1.35),
                        fontWeight: isHead ? '600' : undefined,
                        textAlign: align[column] ?? 'left',
                      }}
                    >
                      {cellRuns(row[column] ?? '', at[rowAt]?.[column] ?? 0, links).map((run, index) => (
                        <Text
                          key={index}
                          onPress={run.link && onLink ? () => onLink(run.link!.link) : undefined}
                          suppressHighlighting
                          style={runStyle(run, theme, size, Boolean(run.link))}
                        >
                          {drawn(run)}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Pressable>
  );
}

type Placed = { from: number; to: number; link: Link };

function cellRuns(cell: string, at: number, links: Placed[]): (Run & { link?: Placed })[] {
  const runs = runsIn(cell);
  const end = at + cell.length;
  const inside = links
    .filter((link) => link.from < end && link.to > at)
    .map((link) => ({ from: link.from - at, to: link.to - at, link: link.link }));
  return inside.length ? runs.flatMap((run) => cutAt(run, inside)) : runs;
}

function useSize(uri: string | null): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!uri) return;
    let live = true;
    Image.getSize(uri, (width, height) => live && setSize({ width, height }), () => undefined);
    return () => {
      live = false;
    };
  }, [uri]);
  return size;
}

/** A formula set on its own line, at the page's size and in its ink. Its TeX until it is drawn. */
export function MathBlock({ tex, theme, fontSize, width, onPress, onLongPress }: Common & { tex: string; width: number }) {
  const palette = readingThemes[theme];
  const { uri, done } = useDrawing('math', tex);
  const size = useSize(uri);
  if (!uri || !size) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <Text style={{ color: done ? palette.text : palette.dim, fontFamily: MONO, fontSize: Math.round(fontSize * 0.8), textAlign: 'center' }}>
          {tex}
        </Text>
      </Pressable>
    );
  }
  const scale = formulaScale(fontSize);
  const shown = { width: size.width * scale, height: size.height * scale };
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{ minWidth: width, alignItems: 'center' }}
      >
        <Image source={{ uri }} style={[shown, { tintColor: palette.text }]} />
      </ScrollView>
    </Pressable>
  );
}

/** A formula inside a sentence, as a picture the height of its line — or its TeX until then. */
export function InlineMath({ tex, theme, fontSize }: { tex: string; theme: ReadingTheme; fontSize: number }) {
  const palette = readingThemes[theme];
  const { uri } = useDrawing('inline-math', tex);
  const size = useSize(uri);
  if (!uri || !size) {
    return <Text style={{ fontFamily: MONO, fontSize: Math.round(fontSize * 0.88) }}>{tex}</Text>;
  }
  const scale = formulaScale(fontSize);
  return (
    <Image source={{ uri }} style={{ width: size.width * scale, height: size.height * scale, tintColor: palette.text }} />
  );
}

/**
 * A Mermaid diagram, drawn the first time it is read. Tapped, it opens on its
 * own to be pinched; the source stays the fallback, so a diagram that cannot
 * be drawn — offline, or a syntax this version of Mermaid refuses — is still
 * readable as what the author wrote.
 */
export function DiagramBlock({ body, theme, fontSize, width, onLongPress, onCopy }: Common & {
  body: string;
  width: number;
  onCopy?: () => void;
}) {
  const { t } = useTranslation();
  const palette = readingThemes[theme];
  const { uri, done } = useDrawing('diagram', body, theme === 'night');
  const size = useSize(uri);
  const [zoomed, setZoomed] = useState(false);
  const { height: screen } = useWindowDimensions();

  if (done && !uri) {
    return <CodeBlock lang="mermaid" body={body} theme={theme} fontSize={fontSize} onLongPress={onLongPress} onCopy={onCopy} />;
  }
  if (!uri || !size) {
    return (
      <View style={[styles.waiting, { borderColor: palette.tint, width }]}>
        <Text style={{ color: palette.dim, fontSize: 13 }}>{t('reader.drawing')}</Text>
      </View>
    );
  }
  const natural = size.width / DRAWN_SCALE;
  const shownWidth = Math.min(width, natural);
  const shownHeight = Math.min(screen * 0.75, (shownWidth * size.height) / size.width);
  return (
    <>
      <Pressable onPress={() => setZoomed(true)} onLongPress={onLongPress} style={{ alignItems: 'center' }}>
        <Image source={{ uri }} style={{ width: shownWidth, height: shownHeight }} resizeMode="contain" />
      </Pressable>
      {zoomed ? <Zoomed uri={uri} ratio={size.width / size.height} background={palette.bg} onClose={() => setZoomed(false)} /> : null}
    </>
  );
}

/** A picture on its own, to be pinched and panned; a tap puts it away. */
function Zoomed({ uri, ratio, background, onClose }: { uri: string; ratio: number; background: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const fitted = Math.min(width, height * ratio);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: background }}
        contentContainerStyle={{ minHeight: height, alignItems: 'center', justifyContent: 'center' }}
        maximumZoomScale={6}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onClose}>
          <Image source={{ uri }} style={{ width: fitted, height: fitted / ratio }} resizeMode="contain" />
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** Code is set apart by a rule, not a box: a box on a reading page is a form. */
  code: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: space.xs },
  codeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs, paddingRight: space.xs },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { paddingHorizontal: space.sm, paddingVertical: space.xs + 2, borderRightWidth: StyleSheet.hairlineWidth },
  waiting: { height: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
