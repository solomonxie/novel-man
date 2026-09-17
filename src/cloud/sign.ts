import { concat, hex, hmacSha256, sha256Hex, utf8 } from './sha256';

export type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  region: string;
  service?: string;
};

export type SignedRequest = { url: string; headers: Record<string, string> };

/**
 * AWS Signature Version 4. Written out rather than pulled in because the AWS
 * SDK is tens of megabytes for the four calls this app makes, and every
 * S3-compatible provider (R2, B2, Wasabi, MinIO, Spaces) speaks this same
 * signature — so one signer is the whole compatibility story.
 */
export function signRequest(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  credentials: Credentials;
  payloadHash?: string;
  now?: Date;
}): SignedRequest {
  const { credentials } = input;
  const service = credentials.service ?? 's3';
  const now = input.now ?? new Date();
  const amzDate = stamp(now);
  const dateOnly = amzDate.slice(0, 8);
  const parsed = parseUrl(input.url);

  const payloadHash = input.payloadHash ?? 'UNSIGNED-PAYLOAD';
  const headers: Record<string, string> = {
    ...input.headers,
    host: parsed.host,
    'x-amz-date': amzDate,
  };
  // `x-amz-content-sha256` is an S3 requirement, not a SigV4 one; sending it
  // to other services changes the signature for no reason.
  if (service === 's3') headers['x-amz-content-sha256'] = payloadHash;
  if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;

  const canonicalHeaders = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const signedHeaders = canonicalHeaders.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    parsed.path,
    parsed.query,
    canonicalHeaders
      .map((name) => `${name}:${collapse(findHeader(headers, name))}`)
      .join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateOnly}/${credentials.region}/${service}/aws4_request`;
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hex(hmacSha256(signingKey(credentials, dateOnly, service), utf8(toSign)));
  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: input.url, headers };
}

/** A link the OS or a browser can follow without ever seeing the secret. */
export function presign(input: {
  method: string;
  url: string;
  credentials: Credentials;
  expiresIn: number;
  now?: Date;
}): string {
  const { credentials } = input;
  const service = credentials.service ?? 's3';
  const now = input.now ?? new Date();
  const amzDate = stamp(now);
  const dateOnly = amzDate.slice(0, 8);
  const parsed = parseUrl(input.url);
  const scope = `${dateOnly}/${credentials.region}/${service}/aws4_request`;

  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (credentials.sessionToken) query.push(['X-Amz-Security-Token', credentials.sessionToken]);
  for (const pair of parsed.query ? parsed.query.split('&') : []) {
    const [name, value = ''] = pair.split('=');
    if (name) query.push([decodeURIComponent(name), decodeURIComponent(value)]);
  }

  const canonicalQuery = query
    .map(([name, value]) => [escape(name), escape(value)] as [string, string])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

  const canonicalRequest = [
    input.method.toUpperCase(),
    parsed.path,
    canonicalQuery,
    `host:${parsed.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hex(hmacSha256(signingKey(credentials, dateOnly, service), utf8(toSign)));
  return `${parsed.origin}${parsed.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function signingKey(credentials: Credentials, dateOnly: string, service: string): Uint8Array {
  const dateKey = hmacSha256(concat(utf8('AWS4'), utf8(credentials.secretAccessKey)), utf8(dateOnly));
  const regionKey = hmacSha256(dateKey, utf8(credentials.region));
  const serviceKey = hmacSha256(regionKey, utf8(service));
  return hmacSha256(serviceKey, utf8('aws4_request'));
}

export function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** RFC 3986, which is stricter than `encodeURIComponent` about four characters. */
export function escape(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function findHeader(headers: Record<string, string>, lowercased: string): string {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === lowercased);
  return key ? headers[key] : '';
}

type ParsedUrl = { origin: string; host: string; path: string; query: string };

/** `URL` is not reliably available on Hermes, and the rules here are narrow. */
export function parseUrl(url: string): ParsedUrl {
  const match = /^(https?:\/\/)([^/?#]+)([^?#]*)(?:\?([^#]*))?/.exec(url);
  if (!match) throw new Error(`not a url: ${url}`);
  const [, scheme, host, rawPath, rawQuery] = match;
  const path = rawPath
    ? rawPath.split('/').map((segment) => escape(decodeURIComponent(segment))).join('/')
    : '/';
  const query = (rawQuery ?? '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [name, value = ''] = pair.split('=');
      return [escape(decodeURIComponent(name)), escape(decodeURIComponent(value))] as const;
    })
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  return { origin: `${scheme}${host}`, host, path, query };
}
