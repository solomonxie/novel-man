import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Block, ParseContext } from './types';

/**
 * PDF text lives behind a layout engine, and there is no pure-JS extractor
 * that runs on Hermes. pdf.js does the job in a WebView that is mounted once,
 * off-screen, and talks over `postMessage` — so the importer stays a normal
 * async function and nothing about PDFs leaks into the rest of the pipeline.
 *
 * pdf.js is loaded from a CDN rather than bundled: it is several megabytes for
 * a format most manuscripts aren't in. That makes PDF the one import that
 * needs a network, which the error says plainly rather than failing oddly.
 */
type Pending = {
  resolve: (blocks: Block[]) => void;
  reject: (error: Error) => void;
  context?: ParseContext;
};

type Bridge = {
  send: (message: object) => void;
};

let bridge: Bridge | null = null;
const pending = new Map<string, Pending>();
let counter = 0;

export class ExtractorError extends Error {
  constructor(public code: 'not-mounted' | 'no-network' | 'failed', detail?: string) {
    super(detail ?? code);
  }
}

export function extractPdf(bytes: Uint8Array, context?: ParseContext): Promise<Block[]> {
  if (!bridge) return Promise.reject(new ExtractorError('not-mounted'));
  const id = `pdf-${counter++}`;
  return new Promise<Block[]>((resolve, reject) => {
    pending.set(id, { resolve, reject, context });
    bridge!.send({ id, kind: 'pdf', data: base64(bytes) });
  });
}

/** Mounted once, near the root. It renders nothing a reader can see. */
export function Extractor() {
  const webview = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bridge = {
      send: (message) =>
        webview.current?.injectJavaScript(
          `window.handle(${JSON.stringify(JSON.stringify(message))}); true;`
        ),
    };
    return () => {
      bridge = null;
    };
  }, [ready]);

  function onMessage(event: WebViewMessageEvent) {
    let payload: { id: string; type: string; blocks?: Block[]; done?: number; total?: number; error?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const waiting = pending.get(payload.id);
    if (!waiting) return;
    if (payload.type === 'progress') {
      void waiting.context?.onProgress?.(payload.done ?? 0, payload.total ?? 0);
      return;
    }
    pending.delete(payload.id);
    if (payload.type === 'done') waiting.resolve(payload.blocks ?? []);
    else waiting.reject(new ExtractorError('failed', payload.error));
  }

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webview}
        source={{ html: HOST_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={onMessage}
        onLoadEnd={() => setReady(true)}
      />
    </View>
  );
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hermes has no `btoa`, and the payload is bytes going over a string bridge. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += CHARS[a >> 2];
    out += CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : CHARS[c & 63];
  }
  return out;
}

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build';

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
<script type="module">
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
  let pdfjs = null;

  async function library() {
    if (pdfjs) return pdfjs;
    pdfjs = await import('${PDFJS}/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
    return pdfjs;
  }

  function bytesOf(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  // A PDF has lines, not paragraphs. A new line that starts further left than
  // the one above it, or after a vertical gap, is where a paragraph begins.
  function paragraphsOf(items) {
    const lines = [];
    let current = null;
    for (const item of items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!current || Math.abs(current.y - y) > 3) {
        current = { y, x, text: item.str };
        lines.push(current);
      } else {
        current.text += item.str;
      }
    }

    const paragraphs = [];
    let buffer = '';
    let lastY = null;
    let leftMargin = Math.min(...lines.map((line) => line.x));
    for (const line of lines) {
      const text = line.text.replace(/\\s+/g, ' ').trim();
      if (!text) continue;
      const gap = lastY === null ? 0 : lastY - line.y;
      const indented = line.x > leftMargin + 8;
      if (buffer && (gap > 22 || indented)) {
        paragraphs.push(buffer.trim());
        buffer = '';
      }
      buffer += (buffer ? ' ' : '') + text;
      lastY = line.y;
    }
    if (buffer.trim()) paragraphs.push(buffer.trim());
    return paragraphs;
  }

  window.handle = async (raw) => {
    const request = JSON.parse(raw);
    try {
      const lib = await library();
      const document = await lib.getDocument({ data: bytesOf(request.data) }).promise;
      const blocks = [];
      for (let page = 1; page <= document.numPages; page++) {
        const content = await document.getPage(page).then((p) => p.getTextContent());
        for (const paragraph of paragraphsOf(content.items)) blocks.push({ text: paragraph });
        post({ id: request.id, type: 'progress', done: page, total: document.numPages });
      }
      post({ id: request.id, type: 'done', blocks });
    } catch (error) {
      post({ id: request.id, type: 'error', error: String(error && error.message ? error.message : error) });
    }
  };
</script>
</body></html>`;

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -10, left: -10 },
});
