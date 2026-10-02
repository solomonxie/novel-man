import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ParseContext } from './types';

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
    if (payload.type === 'done') waiting.resolve((payload.values ?? []) as never);
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

const MATHJAX = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
<script type="module">
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
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
      post({ id: request.id, type: 'error', error: 'unknown request ' + request.kind });
    } catch (error) {
      post({ id: request.id, type: 'error', error: String(error && error.message ? error.message : error) });
    }
  };
</script>
</body></html>`;

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -10, left: -10 },
});
