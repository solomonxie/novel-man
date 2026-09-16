import { useColorScheme } from 'react-native';

export type ReadingTheme = 'paper' | 'sepia' | 'grey' | 'night';

export const readingThemes: Record<ReadingTheme, { bg: string; text: string; dim: string; tint: string }> = {
  paper: { bg: '#FFFFFF', text: '#1A1A1A', dim: '#8A8A8E', tint: '#E8EEF7' },
  sepia: { bg: '#F6EFE2', text: '#3B3227', dim: '#9B8D77', tint: '#EADFC6' },
  grey: { bg: '#CFD2CD', text: '#242628', dim: '#6E7271', tint: '#BFC4BE' },
  night: { bg: '#121212', text: '#D6D3CE', dim: '#6E6B67', tint: '#25292E' },
};

export const highlightColors = ['#FFE58A', '#BFE3B4', '#BBD9F5', '#F2C2D6'] as const;
export type HighlightColor = (typeof highlightColors)[number];

const light = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#11181C',
  dim: '#6B7280',
  faint: '#9CA3AF',
  accent: '#2F6FEB',
  danger: '#D9342B',
  border: '#E3E3E8',
};

const dark: typeof light = {
  bg: '#000000',
  surface: '#1C1C1E',
  text: '#F2F2F7',
  dim: '#9BA1A6',
  faint: '#6B7280',
  accent: '#6FA0FF',
  danger: '#FF6961',
  border: '#2C2C2E',
};

export type Palette = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16 };

/** CJK needs looser leading than Latin at the same point size. */
export const lineHeightFor = (script: 'latin' | 'cjk', fontSize: number) =>
  Math.round(fontSize * (script === 'cjk' ? 1.9 : 1.6));

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
