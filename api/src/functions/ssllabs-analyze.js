import { app } from "@azure/functions";

app.http("ssllabsAnalyze", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ssllabs/analyze",
  handler: async (req) => {
    const host = (req.query.get("host") || "").trim();
    if (!host) {
      return { status: 400, jsonBody: { error: "Missing host" } };
    }

    const url = new URL("https://api.ssllabs.com/api/v3/analyze");
    url.searchParams.set("host", host);

    // ✅ Use cache first
    url.searchParams.set("fromCache", "on");

    // ✅ Prevent constant new scans
    url.searchParams.set("startNew", "off");

    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Auxiom-RA/1.0",
        Accept: "application/json"
      }
    });

    const data = await resp.json();

    return {
      status: resp.status,
      jsonBody: data
    };
  }
});
