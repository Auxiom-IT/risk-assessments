// api/src/functions/securityHeaders.js
// Server-side fetch to securityheaders.com to avoid client-side CORS proxy issues.

import { app } from '@azure/functions';

function parseGrade(html) {
  // Try a couple likely patterns; keep robust/fallback
  const gradeMatch =
    html.match(/class="reportCardGrade[^"]*">\s*([A-F][+-]?)\s*</i) ||
    html.match(/Report\s*Card\s*Grade[^A-F]*([A-F][+-]?)/i);

  const grade = gradeMatch ? gradeMatch[1].trim() : null;

  // Score is optional
  const scoreMatch = html.match(/Score[^0-9]*([0-9]{1,3})\s*\/\s*100/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;

  return { grade, score };
}

async function securityHeaders(request, context) {
  try {
    const url = new URL(request.url);
    const host = (url.searchParams.get('host') || '').trim().toLowerCase();

    if (!host) {
      return { status: 400, jsonBody: { error: 'Missing host parameter' } };
    }

    const target = `https://securityheaders.com/?q=${encodeURIComponent(host)}&hide=on&followRedirects=on`;

    const res = await fetch(target, {
      headers: {
        'user-agent': 'ra.auxiom.com (Azure Functions)',
        accept: 'text/html,*/*',
      },
    });

    if (!res.ok) {
      return {
        status: res.status,
        jsonBody: { error: `SecurityHeaders request failed (${res.status})` },
      };
    }

    const html = await res.text();
    const { grade, score } = parseGrade(html);

    return {
      status: 200,
      jsonBody: {
        host,
        grade,
        score,
        reportUrl: target,
      },
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

app.http('securityHeaders', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: securityHeaders,
});

export default securityHeaders;
