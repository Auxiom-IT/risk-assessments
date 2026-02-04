import { app } from '@azure/functions';
import dns from 'node:dns/promises';

function normalizeType(type) {
  return String(type || '').trim().toUpperCase();
}

app.http('dns', {
  // ✅ Explicit route so SWA exposes it as /api/dns
  route: 'dns',
  methods: ['GET'],
  authLevel: 'anonymous',
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
      let answers = [];

      switch (type) {
        case 'A':
          answers = await dns.resolve4(name);
          break;
        case 'AAAA':
          answers = await dns.resolve6(name);
          break;
        case 'CNAME':
          answers = await dns.resolveCname(name);
          break;
        case 'MX':
          answers = await dns.resolveMx(name);
          break;
        case 'TXT':
          answers = await dns.resolveTxt(name);
          answers = answers.map((parts) => parts.join(''));
          break;
        default:
          return {
            status: 400,
            jsonBody: { error: `Unsupported record type '${type}'` },
          };
      }

      return {
        status: 200,
        jsonBody: { name, type, answers },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 502,
        jsonBody: { error: 'DNS resolution failed', details: message, name, type },
      };
    }
  },
});
