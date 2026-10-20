import { pool } from '../db/pool.js'
import { appendWorkPlanEvent } from './workPlanAudit.service.js'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (m, status = 400) => {
  throw Object.assign(new Error(m), { status })
}
export async function cancelRemainingVisits(actor, planId, body, db = pool) {
  if (
    !actor?.activo ||
    actor.area !== 'FARMACIAS' ||
    !['SUPERVISOR', 'COORDINADOR', 'GERENTE'].includes(actor.rol)
  )
    fail('El perfil no puede solicitar esta operación.', 403)
  const reason = String(body?.reason ?? '').trim()
  if (
    !UUID.test(planId) ||
    reason.length < 5 ||
    reason.length > 1000 ||
    body?.confirm !== true
  )
    fail('Confirma la operación e indica un motivo de 5 a 1000 caracteres.')
  const c = await db.connect()
  try {
    await c.query('BEGIN')
    const r = await c.query(
      `SELECT p.*,public.can_review_farmacias_plan($2::uuid,p.supervisor_id) AS can_review
    FROM public.work_plan p WHERE p.id=$1::uuid AND p.archived_at IS NULL FOR UPDATE OF p`,
      [planId, actor.id]
    )
    const plan = r.rows[0]
    if (!plan || (plan.supervisor_id !== actor.id && !plan.can_review))
      fail('El plan no pertenece a tu ámbito autorizado.', 404)
    if (plan.status !== 'APPROVED')
      fail('Esta operación sólo corresponde a planes aprobados.', 409)
    // Owners request cancellation; authorized reviewers cancel. Never self-approve.
    const approve = plan.supervisor_id !== actor.id && plan.can_review
    const { rows } = await c.query(
      `SELECT * FROM public.work_plan_item WHERE plan_id=$1 AND removed_at IS NULL
    AND status='PENDING' AND check_in_at IS NULL AND check_out_at IS NULL
    AND item_type='PHARMACY' AND source IN ('PLAN','HIERARCHY_ASSIGNED')
    AND COALESCE(cancellation_request_status,'NONE') NOT IN ('PENDING','APPROVED')
    ORDER BY id FOR UPDATE`,
      [planId]
    )
    for (const item of rows) {
      const updated = await c.query(
        `UPDATE public.work_plan_item SET
     status=CASE WHEN $4 THEN 'CANCELLED' ELSE status END,
     cancellation_request_status=CASE WHEN $4 THEN 'APPROVED' ELSE 'PENDING' END,
     cancellation_request_reason='OTHER',cancellation_request_notes=$3,cancellation_requested_at=now(),cancellation_requested_by=$2,
     cancellation_reviewed_at=CASE WHEN $4 THEN now() ELSE NULL END,
     cancellation_reviewed_by=CASE WHEN $4 THEN $2::uuid ELSE NULL END,cancellation_review_comment=NULL,
     cancelled_at=CASE WHEN $4 THEN now() ELSE NULL END,cancelled_by=CASE WHEN $4 THEN $2::uuid ELSE NULL END,
     updated_at=now(),updated_by=$2 WHERE id=$1 RETURNING *`,
        [item.id, actor.id, reason, approve]
      )
      await appendWorkPlanEvent(c, {
        planId,
        entityType: 'PLAN_ITEM',
        entityId: item.id,
        revisionNumber: plan.revision_number,
        eventType: approve
          ? 'VISIT_CANCELLATION_APPROVED'
          : 'VISIT_CANCELLATION_REQUESTED',
        actor,
        previousStatus: item.status,
        newStatus: approve ? 'CANCELLED' : 'PENDING',
        comment: reason,
        beforeData: item,
        afterData: updated.rows[0],
        metadata: { bulk: true, channel: 'WEB' },
      })
    }
    await c.query('COMMIT')
    return {
      ok: true,
      count: rows.length,
      mode: approve ? 'CANCELLED' : 'PENDING_APPROVAL',
    }
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
}
