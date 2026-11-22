import type { AuthConfig, AuthIdentifier, EndpointVersion, HttpMethod } from '../types/domain';

let inMemoryToken: string | null = null;
let onAuthRequiredCb: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function registerAuthRequiredHandler(cb: () => void) {
  onAuthRequiredCb = cb;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'AUTH_REQUIRED' && onAuthRequiredCb) {
      onAuthRequiredCb();
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function buildEndpointUrl(
  baseUrl: string,
  version: EndpointVersion,
  pathParamValues?: Record<string, string>
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const vPrefix = version.versionLabel.toLowerCase().replace('.', '');
  const segs = version.pathSegments.map((s) => {
    if (s.startsWith('{') && s.endsWith('}') && pathParamValues) {
      const key = s.slice(1, -1);
      return pathParamValues[key] || s;
    }
    return s;
  });
  return `${cleanBase}/${vPrefix}/${segs.join('/')}`;
}

export function generateCurlCommand(params: {
  baseUrl: string;
  version: EndpointVersion;
  authConfig: AuthConfig | null;
  sampleIdentifier?: AuthIdentifier | null;
}): string {
  const { baseUrl, version, authConfig, sampleIdentifier } = params;
  const url = buildEndpointUrl(baseUrl, version);
  const lines: string[] = [`curl ${url} \\`, `  -X ${version.method} \\`];

  if (authConfig) {
    const keyVal = sampleIdentifier?.apiKey || '[AUTH_KEY]';
    const secVal = '[AUTH_SECRET]';
    if (authConfig.headerKeyName) {
      lines.push(`  -H "${authConfig.headerKeyName}: ${keyVal}" \\`);
    }
    if (authConfig.headerSecretName) {
      lines.push(`  -H "${authConfig.headerSecretName}: ${secVal}" \\`);
    }
  }

  for (const h of version.headers.filter((x) => !x.inheritedFromAuth)) {
    lines.push(`  -H "${h.name}: ${h.defaultValue || `[${h.name}]`}" \\`);
  }

  const hasBody = version.method !== 'GET' && version.method !== 'DELETE' && version.bodyFields.length > 0;
  if (hasBody) {
    lines.push(`  -H "Content-Type: application/json" \\`);
    const bodyObj: Record<string, unknown> = {};
    for (const f of version.bodyFields) {
      bodyObj[f.name] = f.sampleValue !== undefined ? f.sampleValue : null;
    }
    lines.push(`  -d '${JSON.stringify(bodyObj)}'`);
  } else {
    // Strip trailing backslash on last line
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }

  return lines.join('\n');
}

export function methodBadgeColor(method: HttpMethod): string {
  switch (method) {
    case 'POST':
      return 'bg-[#E5EDF8] text-[#3B5F96] border border-[#C8D8EE] dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60';
    case 'GET':
      return 'bg-[#E4F2EC] text-[#346E5A] border border-[#C5E2D6] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
    case 'PUT':
    case 'PATCH':
      return 'bg-[#F7EFE0] text-[#8A652A] border border-[#EAD8B8] dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
    case 'DELETE':
      return 'bg-[#F7E6E8] text-[#9E4754] border border-[#EBC9CE] dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60';
  }
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

export function formatDisplayDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
