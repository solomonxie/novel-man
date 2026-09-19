import { useColorScheme } from 'react-native';
import { useAppearance } from './appearance';

export type ReadingTheme = 'paper' | 'sepia' | 'grey' | 'night';

export type ReadingPalette = { bg: string; text: string; dim: string; tint: string; accent: string };

/** Each reading theme carries its own accent: one blue can't sit on all four. */
export const readingThemes: Record<ReadingTheme, ReadingPalette> = {
  paper: { bg: '#FFFFFF', text: '#1A1A1A', dim: '#8A8A8E', tint: '#E8EEF7', accent: '#2F6FEB' },
  sepia: { bg: '#F6EFE2', text: '#3B3227', dim: '#9B8D77', tint: '#EADFC6', accent: '#9A6B3F' },
  grey: { bg: '#CFD2CD', text: '#242628', dim: '#6E7271', tint: '#BFC4BE', accent: '#3C6E52' },
  night: { bg: '#121212', text: '#D6D3CE', dim: '#6E6B67', tint: '#25292E', accent: '#6FA0FF' },
};

export const highlightColors = ['#FFE58A', '#BFE3B4', '#BBD9F5', '#F2C2D6'] as const;
export type HighlightColor = (typeof highlightColors)[number];

/**
 * The same four marks mixed into a night page rather than laid on top of it.
 * A paper-bright block on near-black is a lamp, and the page's own light ink
 * disappears into it — so night keeps the hue and gives up the brightness.
 */
const nightMarks: Record<string, string> = {
  '#FFE58A': '#5F4E12',
  '#BFE3B4': '#2F5738',
  '#BBD9F5': '#25496E',
  '#F2C2D6': '#6E3653',
};

/** A mark, and the ink that stays readable on it. */
export function markOn(color: string, theme: ReadingTheme): { bg: string; ink: string } {
  const ink = readingThemes[theme].text;
  if (theme !== 'night') return { bg: color, ink };
  const night = nightMarks[color];
  // A colour with no night counterpart keeps itself and brings its own ink.
  return night ? { bg: night, ink } : { bg: color, ink: '#1A1A1A' };
}

const light = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#11181C',
  dim: '#6B7280',
  faint: '#9CA3AF',
  accent: '#2F6FEB',
  danger: '#D9342B',
  border: '#E3E3E8',
  /** Accent at a weight that can sit behind text: chips, badges, tinted bands. */
  soft: 'rgba(47,111,235,0.10)',
  /** A well inside a card — an excerpt, a quote, anything quoted rather than said. */
  sunken: '#F7F7FA',
  scrim: 'rgba(0,0,0,0.35)',
  /** Text that sits on `accent` — the one color that must not follow scheme. */
  onAccent: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#000000',
  surface: '#1C1C1E',
  text: '#F2F2F7',
  dim: '#9BA1A6',
  faint: '#6B7280',
  // Lifted off the iOS system blue: #2F6FEB on near-black fails contrast.
  accent: '#6FA0FF',
  danger: '#FF6961',
  border: '#2C2C2E',
  soft: 'rgba(111,160,255,0.16)',
  sunken: '#161618',
  scrim: 'rgba(0,0,0,0.6)',
  onAccent: '#0B1220',
};

export type Palette = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** CJK needs looser leading than Latin at the same point size. */
export const lineHeightFor = (script: 'latin' | 'cjk', fontSize: number) =>
  Math.round(fontSize * (script === 'cjk' ? 1.9 : 1.6));

export type Scheme = 'light' | 'dark';

/** The override wins; `system` is what most people leave it on. */
export function useScheme(): Scheme {
  const appearance = useAppearance();
  const system = useColorScheme();
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return useScheme() === 'dark' ? dark : light;
}

export const palettes = { light, dark };
