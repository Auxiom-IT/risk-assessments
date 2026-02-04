import { app } from "@azure/functions";
import tls from "tls";

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

function fetchCertificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      443,
      host,
      {
        servername: host,
        timeout: 5000
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        socket.end();
        resolve(cert);
      }
    );

    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS connection timeout"));
    });
  });
}

app.http("certificates", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "certificates",
  handler: async (req) => {
    const host = (req.query.get("host") || "").trim();

    if (!isValidHostname(host)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid host" }
      };
    }

    try {
      const cert = await fetchCertificate(host);

      return {
        status: 200,
        jsonBody: {
          host,
          subject: cert.subject,
          issuer: cert.issuer,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
          altNames: cert.subjectaltname || null
        }
      };
    } catch (err) {
      return {
        status: 502,
        jsonBody: {
          error: "Unable to retrieve certificate",
          details: err.message
        }
      };
    }
  }
});
