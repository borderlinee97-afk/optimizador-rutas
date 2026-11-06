const test = require("node:test"),
  assert = require("node:assert/strict"),
  { loadTs } = require("./helpers/loadTs.cjs");
function harness() {
  const state = {
    session: { user: { id: "a" }, access_token: "old" },
    calls: 0,
    wait: null,
    error: null,
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      refreshSession: async () => {
        state.calls++;
        if (state.wait) await state.wait;
        if (!state.error && state.session?.user.id === "a")
          state.session = { user: { id: "a" }, access_token: "fresh" };
        return { error: state.error, data: { session: state.session } };
      },
    },
  };
  return {
    state,
    service: loadTs(
      "src/services/sessionRenewal.ts",
      { "../lib/supabase": { supabase } },
      { atob },
    ),
  };
}
test("concurrent mobile renewal runs once and returns the same account token", async () => {
  const h = harness();
  let release;
  h.state.wait = new Promise((r) => (release = r));
  const one = h.service.renewRequestToken("old"),
    two = h.service.renewRequestToken("old");
  await new Promise((r) => setImmediate(r));
  assert.equal(h.state.calls, 1);
  release();
  assert.deepEqual(await Promise.all([one, two]), ["fresh", "fresh"]);
});
test("mobile renewal never adopts a different user or a rejected refresh", async () => {
  const h = harness();
  let release;
  h.state.wait = new Promise((r) => (release = r));
  const result = h.service.renewRequestToken("old");
  await new Promise((r) => setImmediate(r));
  h.state.session = { user: { id: "b" }, access_token: "b" };
  release();
  assert.equal(await result, null);
  const denied = harness();
  denied.state.error = Error("Revoked");
  assert.equal(await denied.service.renewRequestToken("old"), null);
});
test("an already refreshed mobile token is reused only for the same subject", async () => {
  const h = harness();
  h.state.session = { user: { id: "a" }, access_token: "fresh" };
  const token = (id) =>
    "x." +
    Buffer.from(JSON.stringify({ sub: id })).toString("base64url") +
    ".x";
  assert.equal(await h.service.renewRequestToken(token("a")), "fresh");
  assert.equal(await h.service.renewRequestToken(token("b")), null);
  assert.equal(h.state.calls, 0);
});
