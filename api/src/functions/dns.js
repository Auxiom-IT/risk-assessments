import { app } from '@azure/functions';
import dns from 'node:dns/promises';

const SUPPORTED_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT']);

function isLikelyHostname(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim();
  // basic sanity: no scheme, no path
  if (h.includes('://') || h.includes('/') || h.includes(' ')) return false;
  // allow dots and labels; allow leading underscore for _dmarc, etc.
  return /^[A-Za-z0-9._-]+$/.test(h);
}

function toAnswer(name, type, data) {
  return { name, type, TTL: 0, data };
}

app.http('dns', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dns',
  handler: async (request) => {
    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || '').trim();
    const type = (url.searchParams.get('type') || 'A').trim().toUpperCase();

    if (!isLikelyHostname(name)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid 'name' parameter" },
      };
    }

    if (!SUPPORTED_TYPES.has(type)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid 'type' parameter", supported: Array.from(SUPPORTED_TYPES) },
      };
    }

    try {
      let records = [];

      switch (type) {
        case 'A': {
          const res = await dns.resolve4(name);
          records = res.map((ip) => toAnswer(name, type, ip));
          break;
        }
        case 'AAAA': {
          const res = await dns.resolve6(name);
          records = res.map((ip) => toAnswer(name, type, ip));
          break;
        }
        case 'CNAME': {
          const res = await dns.resolveCname(name);
          records = res.map((c) => toAnswer(name, type, c));
          break;
        }
        case 'MX': {
          const res = await dns.resolveMx(name);
          // Match common display format: "priority exchange"
          records = res
            .sort((a, b) => a.priority - b.priority)
            .map((mx) => toAnswer(name, type, `${mx.priority} ${mx.exchange}`));
          break;
        }
        case 'TXT': {
          const res = await dns.resolveTxt(name);
          // Each record is an array of strings; join segments per RFC.
          records = res.map((parts) => toAnswer(name, type, parts.join('')));
          break;
        }
        default:
          records = [];
      }

      // Return a Google DNS JSON API *compatible-ish* shape so the frontend can stay simple.
      // Status: 0 == NOERROR. If there are no records, omit Answer.
      const body = records.length ? { Status: 0, Answer: records } : { Status: 0 };

      return {
        status: 200,
        jsonBody: body,
      };
    } catch (err) {
      // For common "no data"/"not found" cases, return NOERROR with no Answer so callers treat it as empty.
      const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
      if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'ESERVFAIL' || code === 'ETIMEOUT') {
        return {
          status: 200,
          jsonBody: { Status: 0 },
        };
      }

      return {
        status: 500,
        jsonBody: { error: 'DNS lookup failed' },
      };
    }
  },
});
