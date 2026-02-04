import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

function isValidHostname(host: string): boolean {
  if (!host) return false;
  if (host.length > 253) return false;
  if (host.includes('/') || host.includes(':') || host.includes('@')) return false;

  const labels = host.split('.');
  const labelRe = /^[a-z0-9-]+$/i;

  return labels.every(
    (l) =>
      l.length > 0 &&
      l.length < 64 &&
      labelRe.test(l) &&
      !l.startsWith('-') &&
      !l.endsWith('-')
  );
}

export async function ssllabsAnalyze(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const host = (req.query.get('host') || '').trim();

  if (!isValidHostname(host)) {
    return {
      status: 400,
      jsonBody: { error: 'Invalid host' }
    };
  }

  const url = new URL('https://api.ssllabs.com/api/v3/analyze');
  url.searchParams.set('host', host);
  url.searchParams.set('fromCache', 'on');
  url.searchParams.set('all', 'done');

  const resp = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Auxiom-RA/1.0',
      Accept: 'application/json'
    }
  });

  const data = await resp.json();

  return {
    status: resp.status,
    jsonBody: data
  };
}

app.http('ssllabsAnalyze', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ssllabs/analyze',
  handler: ssllabsAnalyze
});
