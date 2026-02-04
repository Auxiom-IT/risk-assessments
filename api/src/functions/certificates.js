import { app } from '@azure/functions';

app.http('certificates', {
  // ✅ Explicit route so SWA exposes it as /api/certificates
  route: 'certificates',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const domain = request.query.get('domain');

    if (!domain) {
      return {
        status: 400,
        jsonBody: { error: "Missing required query param 'domain'" },
      };
    }

    try {
      const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ra-api/1.0 (+Azure Static Web Apps)' },
      });

      if (!res.ok) {
        return {
          status: 502,
          jsonBody: { error: `crt.sh returned ${res.status}`, domain },
        };
      }

      const raw = await res.json();

      // Deduplicate by cert id
      const seen = new Set();
      const certs = [];
      for (const item of raw) {
        const id = item?.id ?? item?.min_cert_id ?? item?.cert_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        certs.push({
          id,
          issuer_name: item?.issuer_name,
          common_name: item?.common_name,
          name_value: item?.name_value,
          entry_timestamp: item?.entry_timestamp,
          not_before: item?.not_before,
          not_after: item?.not_after,
        });
      }

      return {
        status: 200,
        jsonBody: { domain, certs },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 502,
        jsonBody: { error: 'Certificates lookup failed', details: message, domain },
      };
    }
  },
});
