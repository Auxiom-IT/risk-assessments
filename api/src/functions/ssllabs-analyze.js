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

    // ✅ Prevent starting new scans constantly
    url.searchParams.set("startNew", "off");

    // ✅ Prefer cached results
    url.searchParams.set("fromCache", "on");

    // ✅ Don't request full details until READY
    url.searchParams.set("all", "off");

    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Auxiom-RA/1.0",
        Accept: "application/json"
      }
    });

    const data = await resp.json();

    // If SSL Labs is overloaded, return clean message
    if (data.message?.includes("full capacity")) {
      return {
        status: 503,
        jsonBody: {
          error: "SSL Labs is at capacity. Try again later.",
          upstream: data.message
        }
      };
    }

    return {
      status: resp.status,
      jsonBody: data
    };
  }
});
