// Read-only, current unresolved execution alerts. No fabricated checkout or automatic closure.
export async function listOverdueVisits(db, actor, filters = {}) {
  if (!actor?.activo || actor.area !== 'FARMACIAS' || !['COORDINADOR','GERENTE'].includes(actor.rol)) return {total:0,visits:[]}
  const offset=Number(filters.offset ?? 0),limit=100
  if (!Number.isSafeInteger(offset)||offset<0||offset>100000) throw Object.assign(new Error('Página no válida.'),{status:400})
  const result = await db.query(`
    SELECT i.id, i.plan_id AS "planId", p.supervisor_id AS "personId", person.nombre AS "personName",
      COALESCE(f.unidad, i.custom_name, 'Visita sin nombre') AS name,
      i.scheduled_date::text AS "scheduledDate", i.status,
      i.check_in_at AS "checkInAt", count(*) OVER()::int AS total
    FROM public.work_plan_item i
    JOIN public.work_plan p ON p.id=i.plan_id
    JOIN public.personas person ON person.id=p.supervisor_id
    LEFT JOIN public.farmacia f ON f.id=i.pharmacy_id
    WHERE i.removed_at IS NULL
      AND (p.status='APPROVED' OR (p.status='ARCHIVED' AND p.approved_at IS NOT NULL))
      AND i.status IN ('PENDING','IN_PROGRESS') AND i.check_out_at IS NULL
      AND i.scheduled_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date
      AND person.activo AND person.area::text='FARMACIAS'
      AND person.id <> $1::uuid AND public.can_review_farmacias_plan($1::uuid,person.id)
    ORDER BY i.scheduled_date, person.nombre, i.id LIMIT 100 OFFSET $2`, [actor.id,offset])
  if (!result.rows.length && offset) return listOverdueVisits(db,actor,{offset:0})
  const total=Number(result.rows[0]?.total ?? 0)
  return {total, offset, hasMore:offset+result.rows.length<total, visits:result.rows.map(({total,...row})=>({
    ...row, reason:row.status==='IN_PROGRESS'?'Sin finalizar':'No realizada', requiresReview:true,
  }))}
}
