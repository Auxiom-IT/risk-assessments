// api/src/functions/securityHeaders.js
import { app } from '@azure/functions';

function parseSecurityHeadersHtml(html) {
  // Try multiple patterns because securityheaders.com markup has changed over time
  const gradePatterns = [
    // Old-ish: <div class="score"><div class="score_yellow"><span>B</span>
    /<div\s+class="score">\s*<div\s+class="score_[^"]*">\s*<span>\s*([A-F][+-]?)\s*<\/span>/i,

    // Variant: class="score_*">A+</span> (less strict)
    /class="score_[^"]*".*?<span>\s*([A-F][+-]?)\s*<\/span>/is,

    // Textual fallback: "Grade: A"
    /Grade:\s*([A-F][+-]?)/i,

    // Another common variant: >A</ (single letter inside a score element)
    /<span[^>]*>\s*([A-F][+-]?)\s*<\/span>/i
  ];

  let grade = null;
  for (const re of gradePatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      grade = m[1].trim();
      break;
    }
  }

  // Score: "Score: 85"
  const scoreMatch = html.match(/Score:\s*(\d{1,3})/i);
  const score = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null;

  // Missing headers section
  const missingHeaders = [];
  const missingSection = html.match(
    /<div class="reportTitle">Missing Headers<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
  );
  if (missingSection?.[1]) {
    const headerMatches = missingSection[1].matchAll(/<th\s+class="tableLabel table_red">([^<]+)<\/th>/gi);
    for (const m of headerMatches) {
      const headerName = (m[1] || '').trim();
      if (headerName && !missingHeaders.includes(headerName)) missingHeaders.push(headerName);
    }
  }

  // Warnings section
  const warnings = [];
  const warningsSection = html.match(
    /<div class="reportTitle">Warnings<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
  );
  if (warningsSection?.[1]) {
    const warningMatches = warningsSection[1].matchAll(/<th\s+class="tableLabel table_orange">([^<]+)<\/th>/gi);
    for (const m of warningMatches) {
      const txt = (m[1] || '').trim();
      if (txt) warnings.push(txt);
    }
  }

  return { grade, score, missingHeaders, warnings };
}

app.http('securityHeaders', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'securityheaders',
  handler: async (request) => {
    try {
      const url = new URL(request.url);
      const host = (url.searchParams.get('host') || url.searchParams.get('domain') || '').trim();

      if (!host) {
        return {
          status: 400,
          jsonBody: { error: "Missing required query parameter: 'host'" }
        };
      }

      const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(host)}&hide=on&followRedirects=on`;

      // securityheaders.com can be picky; set a UA and accept HTML
      const resp = await fetch(testUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AuxiomRiskAssessments/1.0; +https://ra.auxiom.com)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });

      if (!resp.ok) {
        return {
          status: resp.status,
          jsonBody: {
            error: `securityheaders.com returned ${resp.status}`,
            testUrl
          }
        };
      }

      const html = await resp.text();
      const { grade, score, missingHeaders, warnings } = parseSecurityHeadersHtml(html);

      // IMPORTANT:
      // If parsing fails, we still return 200 with grade: null so the UI can render a friendly message.
      return {
        status: 200,
        headers: {
          'Cache-Control': 'no-store'
        },
        jsonBody: {
          ok: true,
          testUrl,
          grade,
          score,
          missingHeaders,
          warnings
        }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return {
        status: 500,
        jsonBody: { error: msg }
      };
    }
  }
});
