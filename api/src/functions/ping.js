import { app } from "@azure/functions";

app.http("ping", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ping",
  handler: async () => {
    return {
      status: 200,
      jsonBody: { ok: true, ts: new Date().toISOString() }
    };
  }
});
