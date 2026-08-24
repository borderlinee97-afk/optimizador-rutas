import { db } from './db'

type CountRow = {
  total: number
}

type SeedPlanItem = {
  id: string
  name: string
  lat: number
  lng: number
  ord: number
}

export function seedPlanIfEmpty() {
  const result = db.getFirstSync(
    `
    SELECT COUNT(*) AS total
    FROM plan_items
    `,
  ) as CountRow | null

  const total = Number(result?.total ?? 0)

  if (total > 0) {
    return
  }

  const items: SeedPlanItem[] = [
    {
      id: '1',
      name: 'Farmacia Centro',
      lat: 20.498,
      lng: -103.275,
      ord: 1,
    },
    {
      id: '2',
      name: 'Farmacia Norte',
      lat: 20.512,
      lng: -103.26,
      ord: 2,
    },
    {
      id: '3',
      name: 'Farmacia Sur',
      lat: 20.47,
      lng: -103.29,
      ord: 3,
    },
  ]

  db.withTransactionSync(() => {
    for (const item of items) {
      db.runSync(
        `
        INSERT INTO plan_items (
          id,
          name,
          lat,
          lng,
          ord,
          status,
          check_in_at,
          check_out_at
        )
        VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL)
        `,
        [
          item.id,
          item.name,
          item.lat,
          item.lng,
          item.ord,
        ],
      )
    }
  })
}