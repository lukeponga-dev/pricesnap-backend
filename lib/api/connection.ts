import { ENGINE_VERSION, getEvidenceModel, getModel, getVisionModel, hasApiKey } from "../valuation-engine/ai/client";

/** Configuration check only: does not spend quota or claim provider availability. */
export function connectionStatus() {
  const configured = hasApiKey();
  return {
    ok: configured,
    timestamp: Date.now(),
    backend: {
      status: "online", service: "pricesnap-backend", version: "0.1.0",
      nodeVersion: process.version, environment: process.env.NODE_ENV || "development",
      serverTime: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()),
    },
    engine: {
      status: configured ? "configured" : "not_configured",
      service: "internal-gemini", hasApiKey: configured, model: getModel(),
      visionModel: getVisionModel(), evidenceModel: getEvidenceModel(),
      engineVersion: ENGINE_VERSION,
      geminiLatencyMs: null,
      providerChecked: false,
    },
  };
}
