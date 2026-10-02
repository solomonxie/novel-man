/** A paragraph the parser recovered, with any structure hint the format carried. */
export type Block = {
  text: string;
  /** 1-6 when the source marked this as a heading (docx styles, markdown #, epub h1). */
  heading?: number;
  /** epub spine items and similar: a hard boundary the format already knows about. */
  boundary?: boolean;
  /**
   * The page of the original this block begins on, where the source said so.
   *
   * EPUB 3 marks these with `epub:type="pagebreak"`, and a converted PDF emits
   * them — which is what lets the reader say `p. 84` and open the real page
   * beside it. Most formats carry nothing of the sort and leave it unset: a
   * Markdown file has no pages, and neither does a web page.
   */
  page?: number;
};

export type ParsedSource = {
  blocks: Block[];
  title?: string;
  author?: string;
  /**
   * What the source says it was made from, when it says anything. A converted
   * PDF stamps the file it came out of here so the book can be matched against
   * that PDF later and refuse a different one.
   */
  origin?: Origin;
};

/**
 * Enough of a file to recognise it again without reading all of it.
 *
 * Not a hash: hashing 35 MB in JavaScript on a phone takes seconds, and the
 * question being answered is only "is this the same file", not "prove it".
 * A byte count and a page count already make a collision far-fetched, and the
 * strided sample the app takes of every file it adopts settles it.
 */
export type Origin = {
  /** `pdf`, for now the only thing that is converted rather than read. */
  kind: string;
  name: string;
  bytes: number;
  pages: number;
  fingerprint: string;
};

/**
 * Parsing a long novel takes long enough to freeze the UI, so parsers report
 * progress and hand control back at the same time.
 */
export type ParseContext = {
  onProgress?: (done: number, total: number) => void | Promise<void>;
  /**
   * Where a picture found inside the source goes. Handed in rather than
   * imported so a parser stays a pure function of its bytes — which is what
   * lets the fixture tests run these outside the app.
   */
  saveImage?: (name: string, bytes: Uint8Array) => string;
  /** LaTeX in, a base64 PNG per formula out. Absent outside the app. */
  renderMath?: (latex: string[]) => Promise<string[]>;
};

export type Importer = {
  id: string;
  label: string;
  extensions: string[];
  /** iOS uniform type identifiers — what the system picker filters on. A MIME
   *  type there resolves to nothing, and nothing is selectable. */
  utis: string[];
  /**
   * Formats whose extraction can silently come out wrong — a scanned PDF, a
   * page saved as HTML — show what they got before it becomes a book.
   */
  needsPreview?: boolean;
  parse: (bytes: Uint8Array, fileName: string, context?: ParseContext) => Promise<ParsedSource>;
};
