import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { base64 } from './base64';
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
  resolve: (value: never) => void;
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
  return ask<Block[]>('pdf', { data: base64(bytes) }, context);
}

/**
 * LaTeX in, a PNG per formula out — drawn black on nothing, so the reader can
 * tint it to whatever colour the page is set in. A paper's formulas are the
 * half of it that a PDF's text layer turns to gravel; from the HTML they
 * arrive as the author's own TeX, which is worth rendering properly.
 */
export function renderMath(latex: string[]): Promise<string[]> {
  if (!latex.length) return Promise.resolve([]);
  return ask<string[]>('math', { items: latex });
}

function ask<T>(kind: string, payload: object, context?: ParseContext): Promise<T> {
  if (!bridge) return Promise.reject(new ExtractorError('not-mounted'));
  const id = `${kind}-${counter++}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Pending['resolve'], reject, context });
    bridge!.send({ id, kind, ...payload });
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
    let payload: {
      id: string;
      type: string;
      blocks?: Block[];
      values?: string[];
      done?: number;
      total?: number;
      error?: string;
    };
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
    if (payload.type === 'done') waiting.resolve((payload.blocks ?? payload.values ?? []) as never);
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

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build';
const MATHJAX = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';

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

  let mathjax = null;

  async function math() {
    if (mathjax) return mathjax;
    window.MathJax = { startup: { typeset: false } };
    await new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = '${MATHJAX}';
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('mathjax'));
      document.head.appendChild(tag);
    });
    await window.MathJax.startup.promise;
    mathjax = window.MathJax;
    return mathjax;
  }

  // MathJax sizes its SVG in ex, which a canvas has no opinion about, so the
  // box is converted to pixels first and drawn at 3x for a retina page.
  async function pngOf(latex) {
    const mj = await math();
    const svg = mj.tex2svg(latex, { display: true }).querySelector('svg');
    const ex = (value) => Math.ceil(parseFloat(value || '1') * 8);
    const width = ex(svg.getAttribute('width'));
    const height = ex(svg.getAttribute('height'));
    svg.setAttribute('width', width + 'px');
    svg.setAttribute('height', height + 'px');
    const markup = new XMLSerializer().serializeToString(svg);
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('svg'));
      image.src = url;
    });
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }

  window.handle = async (raw) => {
    const request = JSON.parse(raw);
    try {
      if (request.kind === 'math') {
        const values = [];
        for (let at = 0; at < request.items.length; at++) {
          // One bad formula is one missing picture, not a failed import.
          try {
            values.push(await pngOf(request.items[at]));
          } catch (error) {
            values.push('');
          }
          post({ id: request.id, type: 'progress', done: at + 1, total: request.items.length });
        }
        post({ id: request.id, type: 'done', values });
        return;
      }
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
