import { reportClientIncident } from "./api.js";
let sent = 0,
  windowStarted = Date.now();
function report(kind, operation, durationMs = 0) {
  if (Date.now() - windowStarted > 60000) {
    sent = 0;
    windowStarted = Date.now();
  }
  if (sent >= 3) return;
  sent++;
  void reportClientIncident({
    source: "web",
    kind,
    operation,
    durationMs,
    version: import.meta.env.VITE_APP_VERSION || "web",
  }).catch(() => {});
}
export function installClientDiagnostics(app, router) {
  app.config.errorHandler = (error) => {
    console.error("[ui] No fue posible completar la pantalla.", error);
    report("runtime_error", "vue_runtime");
  };
  window.addEventListener("error", () =>
    report("runtime_error", "browser_runtime"),
  );
  window.addEventListener("unhandledrejection", () =>
    report("runtime_error", "unhandled_promise"),
  );
  let start = 0;
  router.beforeEach(() => {
    start = performance.now();
  });
  router.afterEach(() => {
    requestAnimationFrame(() => {
      const elapsed = performance.now() - start;
      if (start && elapsed > 1500) report("slow_screen", "navigation", elapsed);
    });
  });
}
