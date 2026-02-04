// api/src/functions/dns.js
import { app } from '@azure/functions';
import dns from 'node:dns/promises';

function badRequest(message) {
  return {
    status: 400,
    jsonBody: { ok: false, error: message },
  };
}

async function resolveRecords(name, type) {
  switch (type) {
    case 'A': {
      const out = await dns.resolve4(name);
      return out;
    }
    case 'AAAA': {
      const out = await dns.resolve6(name);
      return out;
    }
    case 'CNAME': {
      const out = await dns.resolveCname(name);
      return out;
    }
    case 'MX': {
      const out = await dns.resolveMx(name);
      // Convert to simple strings so UI can display easily
      return out.map((m) => `${m.priority} ${m.exchange}`);
    }
    case 'TXT': {
      const out = await dns.resolveTxt(name);
      // resolveTxt returns string[][]; join each record chunk
      return out.map((chunks) => chunks.join(''));
    }
    default:
      return null;
  }
}

app.http('dnsResolve', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dns/resolve',
  handler: async (req) => {
    const name = req.query.get('name')?.trim();
    const type = req.query.get('type')?.trim().toUpperCase();

    if (!name) return badRequest("Missing query param 'name'");
    if (!type) return badRequest("Missing query param 'type'");

    const allowed = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT']);
    if (!allowed.has(type)) return badRequest(`Unsupported type '${type}'`);

    try {
      const records = await resolveRecords(name, type);
      if (!records) return badRequest(`Unsupported type '${type}'`);

      return {
        status: 200,
        jsonBody: { ok: true, name, type, records },
      };
    } catch (err) {
      // NXDOMAIN, timeout, etc — return 200 with empty records so UI doesn't crash.
      return {
        status: 200,
        jsonBody: { ok: true, name, type, records: [], error: String(err?.message ?? err) },
      };
    }
  },
});
