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
};

export type Importer = {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  parse: (bytes: Uint8Array, fileName: string, context?: ParseContext) => Promise<ParsedSource>;
};
