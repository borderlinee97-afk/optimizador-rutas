import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireOperationalProfile } from "../middleware/operationalAccess.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import {
  recordDiagnostic,
  diagnosticsSnapshot,
} from "../services/diagnostics.service.js";
import { pool } from "../db/pool.js";
export function createDiagnosticsRouter({
  auth = requireAuth,
  profile = requireOperationalProfile,
  db = pool,
} = {}) {
  const router = Router();
  router.get("/admin/diagnostics", auth, profile, async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (
      !req.identityProfile?.activo ||
      req.identityProfile.system_role !== "ADMIN"
    )
      return res
        .status(403)
        .json({ error: "Sólo administración puede consultar el diagnóstico." });
    let pushQueue = { available: false, groups: [] };
    try {
      const result = await db.query(
        "SELECT status,count(*)::int total,min(created_at) oldest_at FROM public.plan_push_outbox WHERE status IN ('PENDING','SENDING','FAILED') GROUP BY status",
      );
      pushQueue = { available: true, groups: result.rows };
    } catch {}
    res.json({ ...diagnosticsSnapshot(), pushQueue });
  });
  router.post(
    "/diagnostics/client",
    auth,
    profile,
    createRateLimit({ windowMs: 60_000, max: 20 }),
    (req, res) => {
      const body = req.body || {};
      if (
        !["web", "mobile"].includes(body.source) ||
        ![
          "runtime_error",
          "request_error",
          "slow_screen",
          "queue_blocked",
        ].includes(body.kind)
      )
        return res.status(400).json({ error: "Evento no válido." });
      const operation = [
        "vue_runtime",
        "browser_runtime",
        "unhandled_promise",
        "navigation",
        "expo_screen",
        "sync",
        "screen_load",
      ].includes(body.operation)
        ? body.operation
        : "client";
      recordDiagnostic({
        source: body.source,
        kind: body.kind,
        operation,
        version: body.version,
        status: body.status,
        durationMs: body.durationMs,
        requestId: req.requestId,
      });
      res.status(202).json({ ok: true, requestId: req.requestId });
    },
  );
  return router;
}
export default createDiagnosticsRouter();
