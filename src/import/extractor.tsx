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

export type Drawing = 'math' | 'inline-math' | 'diagram';

/**
 * TeX or Mermaid in, a base64 PNG out, by libraries this page fetches the
 * first time it needs them rather than ones the app carries: MathJax and
 * Mermaid are megabytes, and a drawing is made once and then kept.
 *
 * Formulas come out black on nothing, so the reader tints them to the page; a
 * diagram has colours of its own and is drawn once per light and dark.
 */
export function draw(kind: Drawing, source: string, dark = false): Promise<string> {
  return ask<string[]>('draw', { items: [{ kind, source, dark }] }).then((values) => {
    if (!values[0]) throw new ExtractorError('failed', kind);
    return values[0];
  });
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
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

/** One pixel of drawing per this many of the page, so a picture is sharp on a retina screen. */
export const DRAWN_SCALE = 3;
/** MathJax sizes in ex; this many pixels to the ex is a formula at a 16pt page. */
export const PX_PER_EX = 8;

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
<script type="module">
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));

  function script(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('offline'));
      document.head.appendChild(tag);
    });
  }

  let mathjax = null;
  async function math() {
    if (mathjax) return mathjax;
    window.MathJax = { startup: { typeset: false }, svg: { fontCache: 'none' } };
    await script('${MATHJAX}');
    await window.MathJax.startup.promise;
    mathjax = window.MathJax;
    return mathjax;
  }

  let mermaid = null;
  async function diagrams() {
    if (mermaid) return mermaid;
    await script('${MERMAID}');
    mermaid = window.mermaid;
    return mermaid;
  }

  async function png(svg, width, height) {
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
    // iOS will not make a canvas much past 16 million pixels; a long sequence
    // diagram at full scale is one, so it is drawn a little smaller instead.
    const scale = Math.min(${DRAWN_SCALE}, Math.sqrt(16000000 / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }

  // MathJax sizes its SVG in ex, which a canvas has no opinion about, so the
  // box is converted to pixels first.
  async function formula(tex, display) {
    const mj = await math();
    const svg = mj.tex2svg(tex, { display }).querySelector('svg');
    if (svg.querySelector('[data-mjx-error], merror')) throw new Error('tex');
    const ex = (value) => Math.max(1, parseFloat(value || '1') * ${PX_PER_EX});
    return png(svg, ex(svg.getAttribute('width')), ex(svg.getAttribute('height')));
  }

  let drawn = 0;
  async function diagram(source, dark) {
    const lib = await diagrams();
    // Labels as SVG text, not HTML inside the SVG: a canvas refuses to be
    // read back once it has drawn a foreignObject.
    lib.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: '-apple-system, Helvetica, sans-serif',
    });
    const { svg } = await lib.render('drawn' + drawn++, source);
    const holder = document.createElement('div');
    holder.innerHTML = svg;
    const element = holder.querySelector('svg');
    const box = (element.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
    const width = box[2] || parseFloat(element.style.maxWidth) || 600;
    const height = box[3] || 400;
    element.removeAttribute('style');
    return png(element, width, height);
  }

  window.handle = async (raw) => {
    const request = JSON.parse(raw);
    try {
      if (request.kind === 'draw') {
        const values = [];
        for (const item of request.items) {
          try {
            values.push(item.kind === 'diagram'
              ? await diagram(item.source, item.dark)
              : await formula(item.source, item.kind === 'math'));
          } catch (error) {
            values.push('');
          }
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
