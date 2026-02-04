import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function isValidHostname(host: string): boolean {
  // Conservative hostname validation (prevents SSRF)
  // Allows: foo.com, sub.foo.com, foo-bar.com
  // Disallows: protocols, paths, spaces, IP literals (optional)
  if (!host) return false;
  if (host.length > 253) return false;
  if (host.includes('/') || host.includes('\\') || host.includes(' ') || host.includes(':')) return false;
  const labels = host.split('.');
  if (labels.some((l) => !l.length || l.length > 63)) return false;
  const labelRe = /^[a-z0-9-]+$/i;
  if (!labels.every((l) => labelRe.test(l) && !l.startsWith('-') && !l.endsWith('-'))) return false;
  return true;
}

export async function ssllabsAnalyze(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const host = (req.query.get('host') || '').trim();

  if (!isValidHostname(host)) {
    return badRequest('Invalid host');
  }

  // Pass-through supported SSL Labs params (optional)
  const fromCache = req.query.get('fromCache') ?? 'on';
  const all = req.query.get('all') ?? 'done';
  const ignoreMismatch = req.query.get('ignoreMismatch') ?? 'on';

  const url = new URL('https://api.ssllabs.com/api/v3/analyze');
  url.searchParams.set('host', host);
  url.searchParams.set('fromCache', fromCache);
  url.searchParams.set('all', all);
  url.searchParams.set('ignoreMismatch', ignoreMismatch);

  // NOTE: Node 18+ has global fetch
  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'Auxiom-RA/1.0 (ssllabs-proxy)',
      'Accept': 'application/json',
    },
  });

  const contentType = resp.headers.get('content-type') || '';
  const bodyText = await resp.text();

  // Return upstream status to client; keep body as JSON if possible
  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(bodyText);
      return { status: resp.status, jsonBody: json };
    } catch {
      // fall through to text response
    }
  }

  return {
    status: resp.status,
    body: bodyText,
    headers: { 'content-type': contentType || 'text/plain' },
  };
}

app.http('ssllabsAnalyze', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ssllabs/analyze',
  handler: ssllabsAnalyze,
});
