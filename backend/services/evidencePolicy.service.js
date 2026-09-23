import {
  getSupabaseAdmin,
} from '../lib/supabaseAdmin.js'

const EVIDENCE_READ_URL_TTL_SECONDS = 300

export async function addSignedEvidenceReadUrl(
  row,
  getAdmin = getSupabaseAdmin,
) {
  const {
    storage_bucket: storageBucket,
    storage_path: storagePath,
    ...safeEvidence
  } = row

  if (
    row.status !== 'READY' ||
    !storagePath
  ) {
    return {
      ...safeEvidence,
      signedUrl: null,
      signedUrlExpiresIn: null,
    }
  }

  const admin = getAdmin()
  const { data, error } =
    await admin.storage
      .from(
        storageBucket || 'visit-evidence',
      )
      .createSignedUrl(
        storagePath,
        EVIDENCE_READ_URL_TTL_SECONDS,
      )

  if (error || !data?.signedUrl) {
    const storageError =
      new Error(
        'No fue posible preparar la visualización de la evidencia',
      )

    storageError.code =
      'EVIDENCE_READ_URL_FAILED'

    storageError.status =
      502

    throw storageError
  }

  return {
    ...safeEvidence,
    signedUrl: data.signedUrl,
    signedUrlExpiresIn:
      EVIDENCE_READ_URL_TTL_SECONDS,
  }
}

export async function attachEvidenceToPlanItems(
  db,
  items,
  signEvidence = addSignedEvidenceReadUrl,
) {
  const normalized =
    Array.isArray(items)
      ? items
      : []

  if (!normalized.length) {
    return normalized
  }

  const itemIds =
    normalized.map(item => item.id)

  const result =
    await db.query(
      `
      SELECT
        id,
        plan_item_id,
        activity_id,
        supervisor_id,
        status,
        captured_at,
        uploaded_at,
        latitude,
        longitude,
        accuracy_m,
        mocked,
        mime_type,
        byte_size,
        rejection_reason,
        storage_bucket,
        storage_path
      FROM public.visit_evidence
      WHERE plan_item_id = ANY($1::uuid[])
        AND status = 'READY'
      ORDER BY captured_at ASC, created_at ASC, id ASC
      `,
      [itemIds],
    )

  const signedEvidence =
    await Promise.all(
      result.rows.map(
        row => signEvidence(row),
      ),
    )

  const grouped =
    new Map()

  for (const evidence of signedEvidence) {
    const key =
      String(evidence.plan_item_id)

    const current =
      grouped.get(key) ?? []

    current.push(evidence)
    grouped.set(key, current)
  }

  return normalized.map(
    item => ({
      ...item,
      evidence:
        grouped.get(String(item.id)) ?? [],
    }),
  )
}

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
