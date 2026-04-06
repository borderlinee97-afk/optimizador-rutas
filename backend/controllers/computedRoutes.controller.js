import { pool } from '../db/pool.js'

export async function createComputedRoute(req, res) {
  const {
    scope, assignmentId, region, strategy, options,
    total, linkChunkSize,
    visits = [], legs = [], links = []
  } = req.body

  const client = await pool.connect()
  try{
    await client.query('BEGIN')

    const ins = `
      INSERT INTO computed_routes
        (scope, assignment_id, region, strategy, options,
         total_distance_m, total_duration_s, link_chunk_size)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `
    const totalDurS = total?.duration ? Math.round(parseFloat(String(total.duration).replace('s',''))||0) : null
    const { rows: cr } = await client.query(ins, [
      scope, assignmentId ?? null, region ?? null, strategy ?? null, options ?? {},
      total?.distanceMeters ?? null, totalDurS, linkChunkSize ?? null
    ])
    const crid = cr[0].id

    for (const v of visits){
      await client.query(
        `INSERT INTO computed_route_visits
           (computed_route_id, ord, pharmacy_id, name, lat, lng, subroute_idx)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          crid, Number(v.ord ?? 0),
          v.pharmacyId != null ? Number(v.pharmacyId) : null, // BIGINT
          v.name ?? null, v.lat ?? null, v.lng ?? null, v.subroute_idx ?? null
        ]
      )
    }

    for (const L of legs){
      const durS = L.duration ? Math.round(parseFloat(String(L.duration).replace('s',''))||0) : null
      await client.query(
        `INSERT INTO computed_route_legs
           (computed_route_id, ord, distance_m, duration_s)
         VALUES ($1,$2,$3,$4)`,
        [crid, Number(L.ord ?? 0), L.distanceMeters ?? null, durS]
      )
    }

    for (const k of links){
      await client.query(
        `INSERT INTO computed_route_links
           (computed_route_id, ord, from_ord, to_ord, url)
         VALUES ($1,$2,$3,$4,$5)`,
        [crid, Number(k.ord ?? 0), Number(k.from ?? 0), Number(k.to ?? 0), k.url]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ id: crid })
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally {
    client.release()
  }
}

export async function getComputedRoute(req, res) {
  const { id } = req.params
  const { rows: hdr } = await pool.query(`SELECT * FROM computed_routes WHERE id=$1`, [id])
  if (!hdr.length) return res.status(404).json({ error: 'Not found' })

  const [visits, legs, links] = await Promise.all([
    pool.query(`SELECT ord, pharmacy_id, name, lat, lng, subroute_idx
                FROM computed_route_visits WHERE computed_route_id=$1 ORDER BY ord`, [id]),
    pool.query(`SELECT ord, distance_m, duration_s
                FROM computed_route_legs WHERE computed_route_id=$1 ORDER BY ord`, [id]),
    pool.query(`SELECT ord, from_ord, to_ord, url
                FROM computed_route_links WHERE computed_route_id=$1 ORDER BY ord`, [id]),
  ])

  res.json({ header: hdr[0], visits: visits.rows, legs: legs.rows, links: links.rows })
}
``