/** A paragraph the parser recovered, with any structure hint the format carried. */
export type Block = {
  text: string;
  /** 1-6 when the source marked this as a heading (docx styles, markdown #, epub h1). */
  heading?: number;
  /** epub spine items and similar: a hard boundary the format already knows about. */
  boundary?: boolean;
};

export type ParsedSource = {
  blocks: Block[];
  title?: string;
  author?: string;
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
  mimeTypes: string[];
  /**
   * Formats whose extraction can silently come out wrong — a scanned PDF, a
   * page saved as HTML — show what they got before it becomes a book.
   */
  needsPreview?: boolean;
  parse: (bytes: Uint8Array, fileName: string, context?: ParseContext) => Promise<ParsedSource>;
};
