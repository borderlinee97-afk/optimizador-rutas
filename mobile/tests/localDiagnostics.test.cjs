const test = require("node:test"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite"),
  { loadTs } = require("./helpers/loadTs.cjs");
test("local diagnosis counts actual queues without exposing payloads and refuses a different account", () => {
  const sql = new DatabaseSync(":memory:");
  for (const table of [
    "execution_outbox",
    "evidence_queue",
    "operational_task_outbox",
  ])
    sql.exec(
      `CREATE TABLE ${table}(status TEXT,created_at INTEGER,payload_json TEXT)`,
    );
  sql.exec(
    "INSERT INTO execution_outbox VALUES ('PENDING',100,'secret'),('FAILED',50,'private'),('SYNCED',10,'old');INSERT INTO evidence_queue VALUES ('READY',10,'photo'),('PENDING',90,'photo2')",
  );
  let owner = "a";
  const db = {
    getFirstSync: (query, args = []) => sql.prepare(query).get(...args),
  };
  const service = loadTs("src/services/localDiagnostics.ts", {
    "../../storage/db": {
      db,
      getDatabaseUserId: () => owner,
      isDatabaseActive: (id) => id === owner,
    },
  });
  const rows = service.localDiagnostics("a");
  assert.equal(rows[0].pending, 2);
  assert.equal(rows[0].failed, 1);
  assert.equal(rows[0].oldestAt, 50);
  assert.equal(rows[1].pending, 1);
  assert.ok(!JSON.stringify(rows).includes("secret"));
  assert.equal(
    sql.prepare("SELECT count(*) n FROM execution_outbox").get().n,
    3,
  );
  owner = "b";
  assert.throws(() => service.localDiagnostics("a"));
  sql.close();
});
