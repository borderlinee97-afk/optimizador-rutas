export function getEvidencePolicy() {
  const productionDefault =
    process.env.NODE_ENV ===
    'production'

  return {
    requireForActivity:
      parseBoolean(
        process.env.EVIDENCE_REQUIRED_FOR_ACTIVITY ??
          process.env.EVIDENCE_REQUIRE_FOR_ACTIVITY,
        productionDefault,
      ),

    requireForCheckoutWithoutActivities:
      parseBoolean(
        process.env.EVIDENCE_REQUIRED_FOR_VISIT_WITHOUT_ACTIVITIES ??
          process.env.EVIDENCE_REQUIRE_FOR_CHECKOUT_WITHOUT_ACTIVITIES,
        productionDefault,
      ),

    maxBytes:
      positiveInteger(
        process.env.EVIDENCE_MAX_BYTES,
        6 *
          1024 *
          1024,
      ),

    maxPerActivity:
      positiveInteger(
        process.env.EVIDENCE_MAX_PER_ACTIVITY,
        3,
      ),

    maxPerItem:
      positiveInteger(
        process.env.EVIDENCE_MAX_PER_ITEM,
        10,
      ),

    maxAccuracyM:
      positiveNumber(
        process.env.EVIDENCE_MAX_ACCURACY_M,
        100,
      ),

    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  }
}

export async function hasReadyActivityEvidence(
  db,
  itemId,
  activityId,
) {
  const result =
    await db.query(
      `
      SELECT 1
      FROM public.visit_evidence
      WHERE plan_item_id = $1::uuid
        AND activity_id = $2::uuid
        AND status = 'READY'
      LIMIT 1
      `,
      [
        itemId,
        activityId,
      ],
    )

  return result.rowCount >
    0
}

export async function hasReadyItemEvidence(
  db,
  itemId,
) {
  const result =
    await db.query(
      `
      SELECT 1
      FROM public.visit_evidence
      WHERE plan_item_id = $1::uuid
        AND status = 'READY'
      LIMIT 1
      `,
      [
        itemId,
      ],
    )

  return result.rowCount >
    0
}

function parseBoolean(
  value,
  fallback,
) {
  if (
    value ==
      null ||
    value ===
      ''
  ) {
    return fallback
  }

  return [
    '1',
    'true',
    'yes',
    'si',
    'sí',
  ].includes(
    String(
      value,
    )
      .trim()
      .toLowerCase(),
  )
}

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      String(
        value ??
        '',
      ),
      10,
    )

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? parsed
    : fallback
}

function positiveNumber(
  value,
  fallback,
) {
  const parsed =
    Number(
      value,
    )

  return Number.isFinite(
    parsed,
  ) &&
    parsed >
      0
    ? parsed
    : fallback
}
