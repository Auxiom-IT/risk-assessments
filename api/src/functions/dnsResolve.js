import { app } from '@azure/functions';
import dns from 'node:dns/promises';

function normalizeType(type) {
  return String(type || '').trim().toUpperCase();
}

app.http('dnsResolve', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dns/resolve',
  handler: async (request) => {
    const name = request.query.get('name');
    const type = normalizeType(request.query.get('type'));

    if (!name) {
      return {
        status: 400,
        jsonBody: { error: "Missing required query param 'name'" },
      };
    }

    if (!type) {
      return {
        status: 400,
        jsonBody: { error: "Missing required query param 'type'" },
      };
    }

    try {
      let data = [];

      switch (type) {
        case 'A': {
          data = await dns.resolve4(name);
          break;
        }
        case 'AAAA': {
          data = await dns.resolve6(name);
          break;
        }
        case 'CNAME': {
          data = await dns.resolveCname(name);
          break;
        }
        case 'MX': {
          const mx = await dns.resolveMx(name);
          // Convert objects to a stable string format
          data = mx
            .sort((a, b) => a.priority - b.priority)
            .map((r) => `${r.priority} ${r.exchange}`);
          break;
        }
        case 'TXT': {
          const txt = await dns.resolveTxt(name);
          // resolveTxt returns string[][]
          data = txt.map((chunks) => chunks.join(''));
          break;
        }
        default:
          return {
            status: 400,
            jsonBody: {
              error: `Unsupported type '${type}'. Supported: A, AAAA, CNAME, MX, TXT`,
            },
          };
      }

      return {
        status: 200,
        jsonBody: { type, data },
      };
    } catch (err) {
      // NXDOMAIN / no data should be treated as empty, not a hard failure
      // (keeps UI consistent with "no records found")
      return {
        status: 200,
        jsonBody: { type, data: [] },
      };
    }
  },
});
