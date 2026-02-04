import { app } from "@azure/functions";
import dns from "node:dns/promises";

/**
 * Azure SWA API: DNS resolver using the runtime's configured DNS.
 * Route: /api/dns/resolve?name=example.com&type=TXT
 *
 * Returns a Google-DNS-like payload shape:
 * { Answer: [{ name, type, TTL, data }, ...] }
 */
app.http("dnsResolve", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dns/resolve",
  handler: async (request) => {
    try {
      const url = new URL(request.url);
      const name = (url.searchParams.get("name") || "").trim();
      const type = (url.searchParams.get("type") || "").trim().toUpperCase();

      if (!name) {
        return {
          status: 400,
          jsonBody: { error: "Missing required query param: name" },
        };
      }

      const allowed = new Set(["A", "AAAA", "MX", "TXT", "CNAME"]);
      if (!allowed.has(type)) {
        return {
          status: 400,
          jsonBody: { error: "Invalid type. Allowed: A, AAAA, MX, TXT, CNAME" },
        };
      }

      // Build a google-ish "Answer" array
      // type codes match DNS RR types used by Google DNS JSON API:
      // A=1, CNAME=5, MX=15, TXT=16, AAAA=28
      const typeCode = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 }[type];

      let answer = [];

      if (type === "A") {
        const records = await dns.resolve4(name, { ttl: true });
        answer = records.map((r) => ({
          name,
          type: typeCode,
          TTL: typeof r.ttl === "number" ? r.ttl : 0,
          data: r.address,
        }));
      } else if (type === "AAAA") {
        const records = await dns.resolve6(name, { ttl: true });
        answer = records.map((r) => ({
          name,
          type: typeCode,
          TTL: typeof r.ttl === "number" ? r.ttl : 0,
          data: r.address,
        }));
      } else if (type === "CNAME") {
        const records = await dns.resolveCname(name);
        answer = records.map((c) => ({
          name,
          type: typeCode,
          TTL: 0,
          data: c,
        }));
      } else if (type === "MX") {
        const records = await dns.resolveMx(name);
        answer = records.map((mx) => ({
          name,
          type: typeCode,
          TTL: 0,
          data: `${mx.priority} ${mx.exchange}`,
        }));
      } else if (type === "TXT") {
        const records = await dns.resolveTxt(name);
        // dns.resolveTxt returns string[][] (chunks); join them
        answer = records.map((chunks) => ({
          name,
          type: typeCode,
          TTL: 0,
          data: chunks.join(""),
        }));
      }

      return {
        status: 200,
        jsonBody: {
          Answer: answer,
        },
      };
    } catch (err) {
      // Keep response deterministic + useful
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        status: 502,
        jsonBody: {
          error: "DNS resolution failed",
          message,
        },
      };
    }
  },
});
