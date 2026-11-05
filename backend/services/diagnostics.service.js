const events = [];
const startedAt = new Date().toISOString();
const MAX = 300;
const safeCode = (value) =>
  String(value || "unknown")
    .replace(/[^A-Za-z0-9_.:-]/g, "")
    .slice(0, 80);
export function recordDiagnostic(input) {
  const event = {
    at: new Date().toISOString(),
    source: ["web", "mobile", "server"].includes(input.source)
      ? input.source
      : "server",
    kind: safeCode(input.kind),
    operation: safeCode(input.operation),
    version: safeCode(input.version),
    status: Number.isInteger(input.status) ? input.status : 0,
    durationMs: Math.max(0, Math.min(300000, Number(input.durationMs) || 0)),
    requestId: safeCode(input.requestId),
  };
  events.push(event);
  if (events.length > MAX) events.shift();
  return event;
}
export function diagnosticsSnapshot() {
  const requests = events.filter((e) => e.kind === "request"),
    durations = requests.map((e) => e.durationMs).sort((a, b) => a - b);
  return {
    startedAt,
    retention:
      "Últimos 300 eventos de esta instancia; se reinician al desplegar.",
    version: safeCode(
      process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || "local",
    ),
    requests: requests.length,
    serverErrors: requests.filter((e) => e.status >= 500).length,
    p95Ms: durations.length
      ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)]
      : null,
    events: events.slice().reverse(),
  };
}
