import { pool } from '../db/pool.js'

export const PUSH_PROJECT_ID = '2e1997e4-1a88-4623-afe6-3a3a58a95998'
const EXPO_API = 'https://exp.host/--/api/v2/push'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/

export async function registerPushDevice(profile, authUserId, body, db = pool) {
  if (!UUID.test(body?.installationId ?? '') || body?.projectId !== PUSH_PROJECT_ID ||
      body?.platform !== 'android' || !TOKEN.test(body?.token ?? '') || body.token.length > 256) {
    throw Object.assign(new Error('El registro de notificaciones no es válido.'), { status: 400 })
  }
  if (!profile?.activo || profile.area !== 'FARMACIAS' ||
      !['SUPERVISOR', 'COORDINADOR', 'GERENTE'].includes(profile.rol) || profile.auth_user_id !== authUserId) {
    throw Object.assign(new Error('El perfil no está autorizado para notificaciones.'), { status: 403 })
  }
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.token])
    await client.query('DELETE FROM public.app_push_device WHERE expo_push_token=$1 AND installation_id<>$2::uuid', [body.token, body.installationId])
    await client.query(`INSERT INTO public.app_push_device
      (installation_id,persona_id,auth_user_id,expo_push_token,project_id,platform,active)
      VALUES($1,$2,$3,$4,$5,'android',true)
      ON CONFLICT(installation_id) DO UPDATE SET persona_id=EXCLUDED.persona_id,
        auth_user_id=EXCLUDED.auth_user_id,expo_push_token=EXCLUDED.expo_push_token,
        project_id=EXCLUDED.project_id,active=true,updated_at=now()`,
    [body.installationId, profile.id, authUserId, body.token, PUSH_PROJECT_ID])
    await client.query(`UPDATE public.plan_push_outbox SET status='CANCELLED',updated_at=now()
      WHERE device_id=$1 AND status IN ('PENDING','SENDING','SENT')
       AND (recipient_id<>$2::uuid OR push_token<>$3)`, [body.installationId, profile.id, body.token])
    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

// Supabase signOut() uses global scope; disable this account's devices before logout.
export async function revokePushDevices(authUserId, db = pool) {
  await db.query(`WITH revoked AS (
    UPDATE public.app_push_device SET active=false,updated_at=now() WHERE auth_user_id=$1 RETURNING installation_id
   ) UPDATE public.plan_push_outbox SET status='CANCELLED',updated_at=now()
   WHERE device_id IN (SELECT installation_id FROM revoked) AND status IN ('PENDING','SENDING')`, [authUserId])
  return { ok: true }
}

// Called inside the plan transaction. Notification failure must not prevent plan approval/submission.
export async function queuePlanNotifications(client, planId, kind) {
  if (!['PLAN_SUBMITTED', 'PLAN_APPROVED'].includes(kind)) throw new Error('Tipo de notificación no válido')
  await client.query('SAVEPOINT plan_push_enqueue')
  try {
    await client.query(`INSERT INTO public.plan_push_outbox
      (device_id,recipient_id,plan_id,revision_number,kind,push_token)
      SELECT d.installation_id,recipient.id,wp.id,wp.revision_number,$2,d.expo_push_token
      FROM public.work_plan wp
      JOIN public.personas owner ON owner.id=wp.supervisor_id
      JOIN public.personas recipient ON recipient.activo AND recipient.area::text='FARMACIAS'
      JOIN public.app_push_device d ON d.persona_id=recipient.id AND d.auth_user_id=recipient.auth_user_id AND d.active
      WHERE wp.id=$1 AND wp.archived_at IS NULL AND owner.activo AND owner.area::text='FARMACIAS'
       AND (($2::text='PLAN_SUBMITTED' AND wp.status='PENDING_APPROVAL'
         AND public.can_review_farmacias_plan(recipient.id,owner.id)
         AND (recipient.rol::text='COORDINADOR' OR owner.rol::text='COORDINADOR' OR owner.superior_id=recipient.id))
        OR ($2::text='PLAN_APPROVED' AND wp.status='APPROVED' AND recipient.id=owner.id))
      ON CONFLICT(device_id,recipient_id,plan_id,revision_number,kind) DO NOTHING`, [planId, kind])
    await client.query('RELEASE SAVEPOINT plan_push_enqueue')
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT plan_push_enqueue')
    await client.query('RELEASE SAVEPOINT plan_push_enqueue')
    console.error('[plan-notifications][enqueue]', error.code ?? 'ENQUEUE_FAILED')
  }
}

const eligible = `d.active AND d.persona_id=o.recipient_id AND d.expo_push_token=o.push_token
  AND d.auth_user_id=p.auth_user_id AND p.activo AND p.area::text='FARMACIAS'
  AND wp.archived_at IS NULL AND wp.revision_number=o.revision_number
  AND ((o.kind='PLAN_APPROVED' AND wp.status='APPROVED' AND wp.supervisor_id=p.id)
    OR (o.kind='PLAN_SUBMITTED' AND wp.status='PENDING_APPROVAL' AND public.can_review_farmacias_plan(p.id,wp.supervisor_id)))`

async function expoRequest(route, body, fetcher) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
  const response = await fetcher(`${EXPO_API}/${route}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`EXPO_HTTP_${response.status}`)
  const result = await response.json()
  if (result.errors?.length) throw new Error(result.errors[0]?.code ?? 'EXPO_RESPONSE_ERROR')
  return result.data
}

async function failDelivery(db, row, code, retry = false) {
  const status = retry && row.attempts < 6 ? 'PENDING' : 'FAILED'
  const delay = Math.min(900, 30 * 2 ** Math.min(row.attempts, 5))
  await db.query(`UPDATE public.plan_push_outbox SET status=$2,last_error=$3,
    next_attempt_at=now()+($4::int*interval '1 second'),updated_at=now() WHERE id=$1 AND status='SENDING'`,
  [row.id, status, String(code).slice(0,200), delay])
  if (code === 'DeviceNotRegistered') {
    await db.query(`UPDATE public.app_push_device SET active=false,updated_at=now()
      WHERE installation_id=$1 AND expo_push_token=$2 AND persona_id=$3`, [row.device_id, row.push_token, row.recipient_id])
  }
}

export async function dispatchPlanNotifications({ db = pool, fetcher = fetch } = {}) {
  await db.query(`UPDATE public.plan_push_outbox SET status='PENDING',updated_at=now()
    WHERE status='SENDING' AND claimed_at<now()-interval '5 minutes'`)
  await db.query(`UPDATE public.plan_push_outbox o SET status='CANCELLED',updated_at=now()
    WHERE o.status='PENDING' AND NOT EXISTS (
      SELECT 1 FROM public.app_push_device d JOIN public.personas p ON p.id=d.persona_id
       JOIN public.work_plan wp ON wp.id=o.plan_id WHERE d.installation_id=o.device_id AND ${eligible})`)
  const { rows } = await db.query(`WITH candidates AS (
    SELECT o.id FROM public.plan_push_outbox o JOIN public.app_push_device d ON d.installation_id=o.device_id
     JOIN public.personas p ON p.id=d.persona_id JOIN public.work_plan wp ON wp.id=o.plan_id
    WHERE o.status='PENDING' AND o.next_attempt_at<=now() AND ${eligible}
    ORDER BY o.created_at LIMIT 50 FOR UPDATE OF o SKIP LOCKED
   ) UPDATE public.plan_push_outbox o SET status='SENDING',attempts=attempts+1,claimed_at=now(),updated_at=now()
    FROM candidates c WHERE c.id=o.id RETURNING o.*,
    (SELECT auth_user_id FROM public.app_push_device WHERE installation_id=o.device_id) AS recipient_auth_id`)
  if (rows.length) {
    try {
      const tickets = await expoRequest('send', rows.map(row => ({
        to: row.push_token, sound: 'default', channelId: 'work-plans',
        title: row.kind === 'PLAN_SUBMITTED' ? 'Plan pendiente de autorización' : 'Plan de trabajo aprobado',
        body: row.kind === 'PLAN_SUBMITTED' ? 'Tienes un plan de trabajo por revisar.' : 'Tu plan de trabajo ya fue aprobado.',
        data: { kind: row.kind, planId: row.plan_id, recipientAuthId: row.recipient_auth_id },
      })), fetcher)
      if (!Array.isArray(tickets) || tickets.length !== rows.length) throw new Error('EXPO_TICKET_COUNT_MISMATCH')
      for (const [i, row] of rows.entries()) {
        const ticket = tickets[i]
        if (ticket.status === 'ok' && ticket.id) {
          await db.query(`UPDATE public.plan_push_outbox SET status='SENT',receipt_id=$2,last_error=NULL,updated_at=now()
            WHERE id=$1 AND status='SENDING'`, [row.id, ticket.id])
        } else await failDelivery(db, row, ticket.details?.error ?? 'EXPO_TICKET_ERROR', ticket.details?.error === 'MessageRateExceeded')
      }
    } catch (error) {
      for (const row of rows) await failDelivery(db, row, error.message, true)
    }
  }
  const receipts = await db.query(`SELECT * FROM public.plan_push_outbox WHERE status='SENT'
    AND receipt_id IS NOT NULL AND receipt_checked_at IS NULL AND updated_at<now()-interval '15 minutes' LIMIT 50`)
  if (receipts.rows.length) {
    const results = await expoRequest('getReceipts', { ids: receipts.rows.map(r => r.receipt_id) }, fetcher)
    for (const row of receipts.rows) {
      const receipt = results?.[row.receipt_id]
      if (!receipt) continue
      const code = receipt.details?.error ?? (receipt.status === 'ok' ? null : 'EXPO_RECEIPT_ERROR')
      await db.query(`UPDATE public.plan_push_outbox SET status=$2,receipt_checked_at=now(),last_error=$3,updated_at=now()
        WHERE id=$1 AND status='SENT'`, [row.id, code ? 'FAILED' : 'DELIVERED', code])
      if (code === 'DeviceNotRegistered') await db.query(`UPDATE public.app_push_device SET active=false,updated_at=now()
        WHERE installation_id=$1 AND expo_push_token=$2 AND persona_id=$3`, [row.device_id,row.push_token,row.recipient_id])
    }
  }
}

let timer, running
export function startPlanPushWorker() {
  if (timer) return
  const tick = () => {
    if (running) return
    running = dispatchPlanNotifications().catch(error => console.error('[plan-notifications][worker]', error.code ?? error.name)).finally(() => { running = null })
  }
  timer = setInterval(tick,30_000);timer.unref();tick()
}
export async function stopPlanPushWorker() {
  if (timer) clearInterval(timer)
  timer = null
  if (running) await running
}
