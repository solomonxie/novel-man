/** Providers are data: each is an endpoint shape plus where the region comes from. */
export type Provider = {
  id: string;
  name: string;
  /** `{bucket}` and `{region}` are filled in; empty means the user supplies it. */
  endpoint: string;
  /** Providers that ignore the region still require a value in the signature. */
  fixedRegion?: string;
  regionHint?: string;
  consoleUrl: string;
  /** Path-style is required by MinIO and friends; AWS prefers virtual-host. */
  pathStyle?: boolean;
};

export const providers: Provider[] = [
  {
    id: 'aws',
    name: 'Amazon S3',
    endpoint: 'https://s3.{region}.amazonaws.com',
    regionHint: 'eu-west-2',
    consoleUrl: 'https://s3.console.aws.amazon.com/s3/buckets',
  },
  {
    id: 'r2',
    name: 'Cloudflare R2',
    endpoint: 'https://{account}.r2.cloudflarestorage.com',
    fixedRegion: 'auto',
    consoleUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
  },
  {
    id: 'b2',
    name: 'Backblaze B2',
    endpoint: 'https://s3.{region}.backblazeb2.com',
    regionHint: 'us-west-004',
    consoleUrl: 'https://secure.backblaze.com/b2_buckets.htm',
  },
  {
    id: 'wasabi',
    name: 'Wasabi',
    endpoint: 'https://s3.{region}.wasabisys.com',
    regionHint: 'eu-central-1',
    consoleUrl: 'https://console.wasabisys.com',
  },
  {
    id: 'spaces',
    name: 'DigitalOcean Spaces',
    endpoint: 'https://{region}.digitaloceanspaces.com',
    regionHint: 'ams3',
    consoleUrl: 'https://cloud.digitalocean.com/spaces',
  },
  {
    id: 'custom',
    name: 'S3-compatible',
    endpoint: '',
    regionHint: 'us-east-1',
    consoleUrl: '',
    pathStyle: true,
  },
];

export function providerById(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}

export type Connection = {
  id: string;
  name: string;
  providerId: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  pathStyle: boolean;
  frequency: 'manual' | 'daily' | 'weekly';
  createdAt: number;
};

/**
 * Credentials arrive pasted from a console — as a block, an .env chunk, or a
 * CSV row. Parsing that block is one fewer chance to mistype a 40-character
 * secret, which is the single most likely way this form fails.
 */
export function parsePasted(block: string): Partial<{
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint: string;
}> {
  const found: Record<string, string> = {};
  const patterns: [string, RegExp][] = [
    ['accessKeyId', /(?:aws_)?access[_\- ]?key(?:[_\- ]?id)?\s*[:=]\s*["']?([A-Za-z0-9/+=_\-]{12,})/i],
    ['secretAccessKey', /(?:aws_)?secret[_\- ]?(?:access[_\- ]?)?key\s*[:=]\s*["']?([A-Za-z0-9/+=_\-]{20,})/i],
    ['region', /region\s*[:=]\s*["']?([a-z0-9\-]{2,})/i],
    ['bucket', /bucket(?:[_\- ]?name)?\s*[:=]\s*["']?([A-Za-z0-9.\-_]{3,})/i],
    ['endpoint', /endpoint(?:[_\- ]?url)?\s*[:=]\s*["']?(https?:\/\/[^\s"']+)/i],
  ];
  for (const [key, pattern] of patterns) {
    const match = pattern.exec(block);
    if (match) found[key] = match[1];
  }

  // A bare AKIA… on its own line is unambiguous enough to pick up.
  if (!found.accessKeyId) {
    const bare = /\b(AKIA[A-Z0-9]{16})\b/.exec(block);
    if (bare) found.accessKeyId = bare[1];
  }
  if (!found.region && found.endpoint) {
    const derived = regionFromEndpoint(found.endpoint);
    if (derived) found.region = derived;
  }
  return found;
}

/** Most S3 endpoints name their region; reading it beats asking for it twice. */
export function regionFromEndpoint(endpoint: string): string | null {
  const patterns = [
    /s3[.-]([a-z0-9-]+)\.amazonaws\.com/i,
    /s3\.([a-z0-9-]+)\.backblazeb2\.com/i,
    /s3\.([a-z0-9-]+)\.wasabisys\.com/i,
    /^https?:\/\/([a-z0-9-]+)\.digitaloceanspaces\.com/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(endpoint);
    if (match) return match[1];
  }
  if (/r2\.cloudflarestorage\.com/i.test(endpoint)) return 'auto';
  return null;
}

export function endpointFor(provider: Provider, values: { region: string; account?: string }): string {
  return provider.endpoint
    .replace('{region}', values.region)
    .replace('{account}', values.account ?? '');
}
