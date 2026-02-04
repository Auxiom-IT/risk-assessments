// api/src/functions/certificates.js
// Fetch certificate transparency results via crt.sh and return normalized cert list.
// Accepts both ?host= and ?domain= for backwards compatibility.

import { app } from '@azure/functions';

async function certificates(request, context) {
  try {
    const url = new URL(request.url);
    const host =
      (url.searchParams.get('host') || url.searchParams.get('domain') || '').trim().toLowerCase();

    if (!host) {
      return {
        status: 400,
        jsonBody: { error: 'Missing host parameter' },
      };
    }

    // crt.sh JSON output
    const crtUrl = `https://crt.sh/?q=${encodeURIComponent(host)}&output=json`;

    const res = await fetch(crtUrl, {
      headers: {
        'user-agent': 'ra.auxiom.com (Azure Functions)',
        accept: 'application/json,text/plain,*/*',
      },
    });

    if (!res.ok) {
      return {
        status: res.status,
        jsonBody: { error: `crt.sh request failed (${res.status})` },
      };
    }

    // crt.sh sometimes returns an empty body or non-JSON under load; guard parse
    const text = await res.text();
    if (!text.trim()) {
      return { status: 200, jsonBody: [] };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return {
        status: 502,
        jsonBody: { error: 'crt.sh returned invalid JSON' },
      };
    }

    // Normalize + de-dup
    const seen = new Set();
    const certs = (Array.isArray(data) ? data : [])
      .map((row) => {
        const nameValue = (row?.name_value ?? '').toString();
        const commonName = (row?.common_name ?? '').toString();
        const issuerName = (row?.issuer_name ?? '').toString();
        const entryTimestamp = row?.entry_timestamp ?? row?.not_before ?? null;
        const notBefore = row?.not_before ?? null;
        const notAfter = row?.not_after ?? null;

        const key = `${commonName}|${issuerName}|${notBefore}|${notAfter}|${nameValue}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
          commonName,
          nameValue,
          issuerName,
          entryTimestamp,
          notBefore,
          notAfter,
        };
      })
      .filter(Boolean);

    return {
      status: 200,
      jsonBody: certs,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
    };
  } catch (err) {
    context.error(err);
    return { status: 500, jsonBody: { error: 'Internal error' } };
  }
}

app.http('certificates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: certificates,
});

export default certificates;
