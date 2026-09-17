import { presign, signRequest, type Credentials } from './sign';
import type { Connection } from './providers';

export type RemoteObject = { key: string; size: number; modified: number };

export class CloudError extends Error {
  constructor(public status: number, public detail: string) {
    super(`${status}: ${detail}`);
  }
}

/**
 * Scoped to one bucket and one prefix, on purpose. The app never asks for a
 * credential that can see anything else, and every key it builds is checked
 * against that prefix before a request is made.
 */
export class Bucket {
  constructor(
    private connection: Connection,
    private credentials: Omit<Credentials, 'region' | 'service'>
  ) {}

  private creds(): Credentials {
    return { ...this.credentials, region: this.connection.region, service: 's3' };
  }

  urlFor(key: string): string {
    const full = this.scoped(key);
    const base = this.connection.endpoint.replace(/\/+$/, '');
    return this.connection.pathStyle
      ? `${base}/${this.connection.bucket}/${encodePath(full)}`
      : insertHost(base, this.connection.bucket, encodePath(full));
  }

  private scoped(key: string): string {
    const prefix = this.connection.prefix.replace(/^\/+|\/+$/g, '');
    const clean = key.replace(/^\/+/, '');
    if (clean.includes('..')) throw new Error('key escapes the prefix');
    return prefix ? `${prefix}/${clean}` : clean;
  }

  async list(under = ''): Promise<RemoteObject[]> {
    const prefix = this.scoped(under);
    const base = this.connection.pathStyle
      ? `${this.connection.endpoint.replace(/\/+$/, '')}/${this.connection.bucket}`
      : insertHost(this.connection.endpoint.replace(/\/+$/, ''), this.connection.bucket, '');
    const url = `${base}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
    const body = await this.send('GET', url);
    return parseListing(await body.text(), this.connection.prefix);
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.send('GET', this.urlFor(key));
    return new Uint8Array(await response.arrayBuffer());
  }

  async put(key: string, body: Uint8Array, contentType = 'application/octet-stream') {
    await this.send('PUT', this.urlFor(key), body, contentType);
  }

  async remove(key: string) {
    await this.send('DELETE', this.urlFor(key));
  }

  /** A link the share sheet or a browser can open without the secret. */
  link(key: string, expiresIn = 900): string {
    return presign({
      method: 'GET',
      url: this.urlFor(key),
      credentials: this.creds(),
      expiresIn,
    });
  }

  private async send(method: string, url: string, body?: Uint8Array, contentType?: string) {
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    // Bodies go up unsigned: hashing megabytes in JS would cost more than the
    // upload, and the connection is TLS either way.
    const signed = signRequest({ method, url, headers, credentials: this.creds() });
    const response = await fetch(url, {
      method,
      headers: signed.headers,
      body: body as BodyInit | undefined,
    });
    if (!response.ok) {
      throw new CloudError(response.status, extractMessage(await response.text()));
    }
    return response;
  }
}

/** ListObjectsV2 XML, read linearly — the same reason the epub parser does. */
export function parseListing(xml: string, prefix: string): RemoteObject[] {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  const objects: RemoteObject[] = [];
  let cursor = 0;
  while (true) {
    const open = xml.indexOf('<Contents>', cursor);
    if (open < 0) break;
    const close = xml.indexOf('</Contents>', open);
    if (close < 0) break;
    const block = xml.slice(open, close);
    cursor = close + 1;
    const key = tag(block, 'Key');
    if (!key) continue;
    objects.push({
      key: trimmed && key.startsWith(`${trimmed}/`) ? key.slice(trimmed.length + 1) : key,
      size: Number(tag(block, 'Size') ?? 0),
      modified: Date.parse(tag(block, 'LastModified') ?? '') || 0,
    });
  }
  return objects;
}

function tag(block: string, name: string): string | null {
  const open = block.indexOf(`<${name}>`);
  if (open < 0) return null;
  const close = block.indexOf(`</${name}>`, open);
  if (close < 0) return null;
  return decodeEntities(block.slice(open + name.length + 2, close));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The vendor's own message is what tells the user which field is wrong. */
export function extractMessage(body: string): string {
  const message = /<Message>([\s\S]*?)<\/Message>/.exec(body);
  const code = /<Code>([\s\S]*?)<\/Code>/.exec(body);
  if (message) return code ? `${code[1]}: ${message[1]}` : message[1];
  return body.slice(0, 200) || 'no response body';
}

function encodePath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function insertHost(endpoint: string, bucket: string, path: string): string {
  return endpoint.replace(/^(https?:\/\/)/, `$1${bucket}.`) + (path ? `/${path}` : '');
}
