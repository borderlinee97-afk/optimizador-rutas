import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  recordDiagnostic,
  diagnosticsSnapshot,
} from "../services/diagnostics.service.js";
process.env.DATABASE_URL ??= "postgresql://postgres@localhost/postgres";
process.env.SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_ANON_KEY ??= "local-test";
const { createDiagnosticsRouter } =
  await import("../routes/diagnostics.route.js");
test("diagnostic events are bounded and do not retain payloads, tokens or raw error messages", () => {
  for (let i = 0; i < 305; i++)
    recordDiagnostic({
      source: "web",
      kind: "runtime_error",
      operation: "vue_runtime",
      version: "1",
      status: 500,
      durationMs: 10,
      message: "private",
      token: "secret",
      payload: { name: "private" },
    });
  const snapshot = diagnosticsSnapshot();
  assert.equal(snapshot.events.length, 300);
  assert.ok(!JSON.stringify(snapshot).includes("private"));
  assert.ok(!JSON.stringify(snapshot).includes("secret"));
});
test("diagnostics are admin-only; incident submission is authenticated and unrelated routes stay public", async () => {
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => {
      if (!req.headers.authorization) return res.sendStatus(401);
      req.auth = { user: { id: "a" } };
      next();
    },
    profile = (req, res, next) => {
      req.identityProfile = {
        activo: true,
        system_role: req.headers.authorization === "admin" ? "ADMIN" : "USER",
      };
      next();
    };
  app.use(
    "/api",
    createDiagnosticsRouter({
      auth,
      profile,
      db: { query: async () => ({ rows: [] }) },
    }),
  );
  app.get("/api/public-probe", (_, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/public-probe")).status, 200);
    assert.equal((await fetch(base + "/api/admin/diagnostics")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/admin/diagnostics", {
          headers: { authorization: "user" },
        })
      ).status,
      403,
    );
    const response = await fetch(base + "/api/admin/diagnostics", {
      headers: { authorization: "admin" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal((await response.json()).pushQueue.available, true);
    assert.equal(
      (
        await fetch(base + "/api/diagnostics/client", {
          method: "POST",
          headers: {
            authorization: "user",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            source: "mobile",
            kind: "runtime_error",
            operation: "expo_screen",
          }),
        })
      ).status,
      202,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
