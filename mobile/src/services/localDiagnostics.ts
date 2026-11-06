import { db, getDatabaseUserId, isDatabaseActive } from "../../storage/db";
export function localDiagnostics(owner: string) {
  if (!isDatabaseActive(owner) || getDatabaseUserId() !== owner)
    throw new Error("No hay información autorizada para esta cuenta.");
  const queues = [
    ["Visitas", "execution_outbox", "status <> 'SYNCED'"],
    ["Evidencias", "evidence_queue", "status NOT IN ('READY','SYNCED')"],
    ["Agenda", "operational_task_outbox", "status <> 'SYNCED'"],
  ];
  return queues.map(([name, table, where]) => {
    const exists = db.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type=? AND name=?",
      ["table", table],
    );
    if (!exists) return { name, pending: 0, failed: 0, oldestAt: null };
    const row = db.getFirstSync<{
      pending: number;
      failed: number;
      oldestAt: number | null;
    }>(
      `SELECT count(*) pending,sum(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed,min(created_at) oldestAt FROM ${table} WHERE ${where}`,
    );
    return {
      name,
      pending: Number(row?.pending || 0),
      failed: Number(row?.failed || 0),
      oldestAt: row?.oldestAt ?? null,
    };
  });
}
