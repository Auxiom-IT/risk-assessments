const https = require('https');

function isValidHostname(host) {
  if (!host) return false;
  if (host.length > 253) return false;
  if (host.includes('/') || host.includes('\\') || host.includes(' ') || host.includes(':') || host.includes('@')) {
    return false;
  }

  const labels = host.split('.');
  if (labels.some((l) => !l.length || l.length > 63)) return false;

  const labelRe = /^[a-z0-9-]+$/i;
  return labels.every((l) => labelRe.test(l) && !l.startsWith('-') && !l.endsWith('-'));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Auxiom-RA/1.0 (ssllabs-proxy)',
            Accept: 'application/json'
          }
        },
        (resp) => {
          let data = '';
          resp.on('data', (chunk) => (data += chunk));
          resp.on('end', () => resolve({ status: resp.statusCode || 500, body: data }));
        }
      )
      .on('error', reject);
  });
}

module.exports = async function (context, req) {
  const host = String((req.query && req.query.host) || '').trim();

  if (!isValidHostname(host)) {
    context.res = {
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid host' })
    };
    return;
  }

  const fromCache = (req.query && req.query.fromCache) || 'on';
  const all = (req.query && req.query.all) || 'done';
  const ignoreMismatch = (req.query && req.query.ignoreMismatch) || 'on';

  const url =
    'https://api.ssllabs.com/api/v3/analyze' +
    `?host=${encodeURIComponent(host)}` +
    `&fromCache=${encodeURIComponent(fromCache)}` +
    `&all=${encodeURIComponent(all)}` +
    `&ignoreMismatch=${encodeURIComponent(ignoreMismatch)}`;

  try {
    const { status, body } = await httpGet(url);
    context.res = {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      },
      body
    };
  } catch (e) {
    context.res = {
      status: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Upstream request failed' })
    };
  }
};
