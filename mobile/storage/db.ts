import * as SQLite from 'expo-sqlite'

export const db =
  SQLite.openDatabaseSync('local.db')

type TableColumn = {
  name: string
}

type MigrationRow = {
  name: string
}

export function initDB() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS plan_items (
      id TEXT PRIMARY KEY NOT NULL,

      plan_id TEXT,
      pharmacy_id TEXT,

      item_type TEXT
        NOT NULL DEFAULT 'PHARMACY',

      source TEXT
        NOT NULL DEFAULT 'PLAN',

      clues TEXT,
      name TEXT NOT NULL,
      address TEXT,
      region TEXT,
      project TEXT,

      lat REAL,
      lng REAL,

      google_place_id TEXT,
      activity_category TEXT,
      addition_reason TEXT,
      estimated_minutes INTEGER,

      added_by TEXT,
      added_at INTEGER,

      updated_by TEXT,
      updated_at INTEGER,

      scheduled_date TEXT,
      scheduled_time TEXT,

      ord INTEGER
        NOT NULL DEFAULT 1,

      required INTEGER
        NOT NULL DEFAULT 1,

      status TEXT
        NOT NULL DEFAULT 'PENDING',

      check_in_at INTEGER,
      check_out_at INTEGER,

      check_in_lat REAL,
      check_in_lng REAL,
      check_out_lat REAL,
      check_out_lng REAL,

      dwell_seconds INTEGER,
      notes TEXT,
      skip_reason TEXT,

      skipped_at INTEGER,
      skipped_by TEXT,

      rescheduled_from_item_id TEXT,
      rescheduled_to_item_id TEXT,

      reschedule_reason TEXT,
      reschedule_notes TEXT,

      rescheduled_at INTEGER,
      rescheduled_by TEXT,

      cancellation_request_status TEXT,
      cancellation_request_reason TEXT,
      cancellation_request_notes TEXT,

      cancellation_requested_at INTEGER,
      cancellation_requested_by TEXT,

      cancellation_reviewed_at INTEGER,
      cancellation_reviewed_by TEXT,
      cancellation_review_comment TEXT,

      cancellation_reason TEXT,
      cancellation_notes TEXT,
      cancelled_at INTEGER,
      cancelled_by TEXT,

      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS plan_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT,
      status TEXT,
      plan_type TEXT,
      period_start TEXT,
      period_end TEXT,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  ensurePlanItemColumn(
    'plan_id',
    'TEXT',
  )

  ensurePlanItemColumn(
    'pharmacy_id',
    'TEXT',
  )

  ensurePlanItemColumn(
    'item_type',
    "TEXT NOT NULL DEFAULT 'PHARMACY'",
  )

  ensurePlanItemColumn(
    'source',
    "TEXT NOT NULL DEFAULT 'PLAN'",
  )

  ensurePlanItemColumn(
    'clues',
    'TEXT',
  )

  ensurePlanItemColumn(
    'address',
    'TEXT',
  )

  ensurePlanItemColumn(
    'region',
    'TEXT',
  )

  ensurePlanItemColumn(
    'project',
    'TEXT',
  )

  ensurePlanItemColumn(
    'lat',
    'REAL',
  )

  ensurePlanItemColumn(
    'lng',
    'REAL',
  )

  ensurePlanItemColumn(
    'google_place_id',
    'TEXT',
  )

  ensurePlanItemColumn(
    'activity_category',
    'TEXT',
  )

  ensurePlanItemColumn(
    'addition_reason',
    'TEXT',
  )

  ensurePlanItemColumn(
    'estimated_minutes',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'added_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'added_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'updated_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'updated_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'scheduled_date',
    'TEXT',
  )

  ensurePlanItemColumn(
    'scheduled_time',
    'TEXT',
  )

  ensurePlanItemColumn(
    'required',
    'INTEGER NOT NULL DEFAULT 1',
  )

  ensurePlanItemColumn(
    'check_in_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'check_out_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'check_in_lat',
    'REAL',
  )

  ensurePlanItemColumn(
    'check_in_lng',
    'REAL',
  )

  ensurePlanItemColumn(
    'check_out_lat',
    'REAL',
  )

  ensurePlanItemColumn(
    'check_out_lng',
    'REAL',
  )

  ensurePlanItemColumn(
    'dwell_seconds',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'notes',
    'TEXT',
  )

  ensurePlanItemColumn(
    'skip_reason',
    'TEXT',
  )

  ensurePlanItemColumn(
  'skipped_at',
  'INTEGER',
  )

  ensurePlanItemColumn(
    'skipped_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'rescheduled_from_item_id',
    'TEXT',
  )

  ensurePlanItemColumn(
    'rescheduled_to_item_id',
    'TEXT',
  )

  ensurePlanItemColumn(
    'reschedule_reason',
    'TEXT',
  )

  ensurePlanItemColumn(
    'reschedule_notes',
    'TEXT',
  )

  ensurePlanItemColumn(
    'rescheduled_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'rescheduled_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_request_status',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_request_reason',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_request_notes',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_requested_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'cancellation_requested_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_reviewed_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'cancellation_reviewed_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_review_comment',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_reason',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancellation_notes',
    'TEXT',
  )

  ensurePlanItemColumn(
    'cancelled_at',
    'INTEGER',
  )

  ensurePlanItemColumn(
    'cancelled_by',
    'TEXT',
  )

  ensurePlanItemColumn(
    'synced_at',
    'INTEGER',
  )

  db.execSync(`
    CREATE INDEX IF NOT EXISTS
      idx_plan_items_status
    ON plan_items(status);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_ord
    ON plan_items(ord);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_plan_id
    ON plan_items(plan_id);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_scheduled_date
    ON plan_items(scheduled_date);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_item_type
    ON plan_items(item_type);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_source
    ON plan_items(source);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_google_place_id
    ON plan_items(google_place_id);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_cancelled_at
    ON plan_items(cancelled_at);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_cancelled_by
    ON plan_items(cancelled_by);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_updated_at
    ON plan_items(updated_at);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_updated_by
    ON plan_items(updated_by);

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_rescheduled_from
    ON plan_items(
      rescheduled_from_item_id
    );

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_rescheduled_to
    ON plan_items(
      rescheduled_to_item_id
    );

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_cancellation_request_status
    ON plan_items(
      cancellation_request_status
    );

    CREATE INDEX IF NOT EXISTS
      idx_plan_items_skipped_at
    ON plan_items(
      skipped_at
    );
  `)

  removeDevelopmentSeedOnce()
  normalizeExtraStopMetadataOnce()
  normalizeCancellationMetadataOnce()
}

function ensurePlanItemColumn(
  columnName: string,
  definition: string,
) {
  const columns = db.getAllSync(
    `PRAGMA table_info(plan_items)`,
  ) as TableColumn[]

  const exists = columns.some(
    (column) =>
      column.name === columnName,
  )

  if (exists) {
    return
  }

  db.execSync(
    `
    ALTER TABLE plan_items
    ADD COLUMN ${columnName}
    ${definition};
    `,
  )
}

function removeDevelopmentSeedOnce() {
  const migrationName =
    'remove-development-plan-seed-v1'

  const existing = db.getFirstSync(
    `
    SELECT name
    FROM local_migrations
    WHERE name = ?
    LIMIT 1
    `,
    [migrationName],
  ) as MigrationRow | null

  if (existing) {
    return
  }

  db.withTransactionSync(() => {
    db.runSync(`
      DELETE FROM plan_items
      WHERE plan_id IS NULL
        AND id IN (
          '1',
          '2',
          '3'
        )
    `)

    registerMigration(
      migrationName,
    )
  })
}

function normalizeExtraStopMetadataOnce() {
  const migrationName =
    'normalize-extra-stop-metadata-v1'

  const existing = db.getFirstSync(
    `
    SELECT name
    FROM local_migrations
    WHERE name = ?
    LIMIT 1
    `,
    [migrationName],
  ) as MigrationRow | null

  if (existing) {
    return
  }

  db.withTransactionSync(() => {
    db.runSync(`
      UPDATE plan_items
      SET
        item_type = 'EXTRA_STOP',
        source = 'SUPERVISOR_ADHOC'
      WHERE pharmacy_id IS NULL
    `)

    db.runSync(`
      UPDATE plan_items
      SET
        item_type = 'PHARMACY',
        source = 'PLAN'
      WHERE pharmacy_id IS NOT NULL
    `)

    registerMigration(
      migrationName,
    )
  })
}

function normalizeCancellationMetadataOnce() {
  const migrationName =
    'normalize-cancellation-metadata-v1'

  const existing = db.getFirstSync(
    `
    SELECT name
    FROM local_migrations
    WHERE name = ?
    LIMIT 1
    `,
    [migrationName],
  ) as MigrationRow | null

  if (existing) {
    return
  }

  db.withTransactionSync(() => {
    db.runSync(`
      UPDATE plan_items
      SET
        cancellation_reason = NULL,
        cancellation_notes = NULL,
        cancelled_at = NULL,
        cancelled_by = NULL
      WHERE status <> 'CANCELLED'
    `)

    registerMigration(
      migrationName,
    )
  })
}

function registerMigration(
  migrationName: string,
) {
  db.runSync(
    `
    INSERT INTO local_migrations (
      name,
      applied_at
    )
    VALUES (?, ?)
    `,
    [
      migrationName,
      Date.now(),
    ],
  )
}