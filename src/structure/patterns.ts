/** Chapter conventions vary more by language than by format, so they live as data. */
export type ChapterPattern = { language: string; pattern: RegExp };

export const chapterPatterns: ChapterPattern[] = [
  { language: 'en', pattern: /^(chapter|part|book|act|interlude)\b[\s.:—-]*([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty)?\b/i },
  { language: 'en', pattern: /^(prologue|epilogue|foreword|afterword|preface)\b/i },
  { language: 'zh', pattern: /^第\s*[0-9０-９零〇一二三四五六七八九十百千万两]+\s*[章回節节卷部篇折]/ },
  { language: 'zh', pattern: /^(楔子|序章|序言|序|引子|尾声|尾聲|终章|終章|后记|後記|番外|外传|外傳)(?![\u4e00-\u9fff])/ },
  { language: 'any', pattern: /^[0-9]{1,4}[.、]?$/ },
];

/** A heading line is short; a paragraph that merely opens with "Chapter" is not. */
export const MAX_HEADING_LENGTH = 60;
