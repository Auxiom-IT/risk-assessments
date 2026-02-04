import { app } from "@azure/functions";

function isValidHostname(host) {
  if (!host) return false;
  if (host.length > 253) return false;
  if (/[\/\\\s:@]/.test(host)) return false;

  const labels = host.split(".");
  const labelRe = /^[a-z0-9-]+$/i;

  return labels.every(
    (l) =>
      l.length > 0 &&
      l.length < 64 &&
      labelRe.test(l) &&
      !l.startsWith("-") &&
      !l.endsWith("-")
  );
}

app.http("ssllabsAnalyze", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ssllabs/analyze",
  handler: async (req) => {
    const host = (req.query.get("host") || "").trim();

    if (!isValidHostname(host)) {
      return { status: 400, jsonBody: { error: "Invalid host" } };
    }

    const url = new URL("https://api.ssllabs.com/api/v3/analyze");
    url.searchParams.set("host", host);
    url.searchParams.set("fromCache", "on");
    url.searchParams.set("all", "done");
    url.searchParams.set("ignoreMismatch", "on");

    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Auxiom-RA/1.0 (ssllabs-proxy)",
        "Accept": "application/json"
      }
    });

    const text = await resp.text();
    try {
      return { status: resp.status, jsonBody: JSON.parse(text) };
    } catch {
      return {
        status: resp.status,
        headers: { "content-type": resp.headers.get("content-type") || "text/plain" },
        body: text
      };
    }
  }
});
