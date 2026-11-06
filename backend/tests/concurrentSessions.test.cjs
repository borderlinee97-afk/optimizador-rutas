const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function apiHarness() {
  const state = {
    session: { user: { id: "A" }, access_token: "old" },
    refreshes: 0,
    requests: [],
    wait: null,
    reply: null,
  };
  const auth = {
    getSession: async () => ({ data: { session: state.session } }),
    refreshSession: async () => {
      state.refreshes++;
      if (state.wait) await state.wait;
      if (state.session?.user.id === "A")
        state.session = { user: { id: "A" }, access_token: "fresh" };
      return { data: { session: state.session }, error: null };
    },
  };
  const source = fs
    .readFileSync(require.resolve("../../src/services/api.js"), "utf8")
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, "")
    .replace(/import\.meta\.env\.VITE_API_URL/g, '"https://api.test/api"')
    .replace(/export\s*\{[^}]+\}/g, "")
    .replace(/export /g, "");
  const ctx = {
    supabase: { auth },
    Headers,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    fetch: async (url, options) => {
      state.requests.push({
        url,
        options,
        token: options.headers.get("Authorization"),
      });
      return state.reply
        ? state.reply(url, options)
        : new Response("{}", {
            status:
              options.headers.get("Authorization") === "Bearer fresh"
                ? 200
                : 401,
            headers: { "content-type": "application/json" },
          });
    },
  };
  vm.runInNewContext(
    source + "\nthis.api={getCurrentProfile,submitSupervisorWorkPlan}",
    ctx,
  );
  return { state, api: ctx.api };
}
test("simultaneous expired web requests share renewal and retry the same operation once", async () => {
  const h = apiHarness();
  let release;
  h.state.wait = new Promise((r) => (release = r));
  const first = h.api.getCurrentProfile(),
    second = h.api.submitSupervisorWorkPlan("plan-a");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.state.refreshes, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(h.state.requests.length, 4);
  assert.equal(
    h.state.requests.filter((r) => r.token === "Bearer fresh").length,
    2,
  );
  assert.ok(
    h.state.requests
      .filter((r) => r.url.includes("submit"))
      .every((r) => r.options.method === "POST"),
  );
});
test("web renewal never retries a former user operation with the newly signed in account", async () => {
  const h = apiHarness();
  let release;
  h.state.wait = new Promise((r) => (release = r));
  const operation = h.api.submitSupervisorWorkPlan("plan-a");
  await new Promise((r) => setTimeout(r, 10));
  h.state.session = { user: { id: "B" }, access_token: "b" };
  release();
  await assert.rejects(operation, { status: 401 });
  assert.equal(h.state.requests.length, 1);
});
test("permission denial never refreshes or logs out another device", async () => {
  const h = apiHarness();
  h.state.reply = () =>
    new Response('{"error":"Sin permiso"}', {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(h.api.getCurrentProfile(), { status: 403 });
  assert.equal(h.state.refreshes, 0);
  assert.equal(h.state.session.user.id, "A");
});
test("transient profile failure preserves the current web profile; explicit denial removes it", async () => {
  const vue = require("../../node_modules/vue");
  let failure = { status: 503, message: "Temporal" };
  const source = fs
    .readFileSync(require.resolve("../../src/composables/useAuth.js"), "utf8")
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, "")
    .replace(/export /g, "");
  const ctx = {
    ...vue,
    console: { error() {} },
    supabase: { auth: {} },
    setActiveWebArea() {},
    getCurrentProfile: async () => {
      throw failure;
    },
    getWebContext: async () => ({}),
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
  };
  vm.runInNewContext(source + "\nthis.h={session,profile,refreshProfile,setOwner:id=>profileOwnerId=id}", ctx);
  ctx.h.session.value = { user: { id: "A" } };
  ctx.h.profile.value = { id: "p", area: "FARMACIAS", rol: "SUPERVISOR" };
  ctx.h.setOwner('A');
  await assert.rejects(ctx.h.refreshProfile());
  assert.equal(ctx.h.profile.value.id, "p");
  ctx.h.session.value={user:{id:'B'}};
  await assert.rejects(ctx.h.refreshProfile());assert.equal(ctx.h.profile.value,null);
  ctx.h.session.value={user:{id:'A'}};ctx.h.profile.value={id:'p',area:'FARMACIAS',rol:'SUPERVISOR'};ctx.h.setOwner('A');
  failure = { status: 403, message: "Revocado" };
  await assert.rejects(ctx.h.refreshProfile());
  assert.equal(ctx.h.profile.value, null);
});
test("ordinary logout paths use local scope in both clients", () => {
  for (const file of [
    "../../src/composables/useAuth.js",
    "../../mobile/src/context/AuthContext.tsx",
  ])
    assert.ok(
      !/\.signOut\(\)/.test(fs.readFileSync(require.resolve(file), "utf8")),
    );
});
test("push logout targets the current installation and cannot disable all other devices", async () => {
  process.env.DATABASE_URL ??= "postgresql://postgres@localhost/postgres";
  const { revokePushDevices } =
      await import("../services/planNotifications.service.js"),
    queries = [],
    db = { query: async (sql, params) => queries.push({ sql, params }) },
    device = "11111111-1111-4111-8111-111111111111";
  await revokePushDevices("A", db);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params,["A",null]);
  queries.length=0;
  await revokePushDevices("A", db, device);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /installation_id=\$2::uuid/);
  assert.deepEqual(queries[0].params, ["A", device]);
  await assert.rejects(revokePushDevices("A",db,"invalid"),{status:400});
});
