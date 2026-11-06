import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { Pool } = require("pg");
const backup = process.argv[2],
  url = new URL(
    process.env.RESTORE_TEST_DATABASE_URL ||
      "postgresql://postgres@localhost:5432/postgres",
  );
if (
  !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
  !["", "/postgres"].includes(url.pathname)
)
  throw Error("El destino debe ser la base de control postgres en localhost.");
if (!backup || !existsSync(backup) || !statSync(backup).isFile())
  throw Error(
    "Indica un archivo PostgreSQL custom existente, fuera del repositorio.",
  );
const repository = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  backupRelative = relative(repository, realpathSync(backup));
if (!(
  backupRelative === ".." ||
  backupRelative.startsWith(".." + sep) ||
  isAbsolute(backupRelative)
))
  throw Error("El respaldo debe permanecer fuera del repositorio.");
const name = "routes_restore_" + randomUUID().replaceAll("-", ""),
  admin = new Pool({ connectionString: url.toString(), max: 1 });
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username || "postgres"),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: name,
  };
  execFileSync(
    process.env.PG_RESTORE_BIN || "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      name,
      backup,
    ],
    { env, stdio: "pipe" },
  );
  url.pathname = "/" + name;
  const db = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    const result = await db.query(
      "SELECT count(*)::int total FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    console.log(
      JSON.stringify({
        restored: true,
        database: name,
        publicTables: result.rows[0].total,
        retainedForInspection: true,
      }),
    );
  } finally {
    await db.end();
  }
} catch (error) {
  console.error(
    JSON.stringify({
      restored: false,
      database: name,
      retainedForInspection: true,
      errorCode: error.code || "RESTORE_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await admin.end();
}
