import {
  createClient,
} from '@supabase/supabase-js'

let adminClient =
  null

export function getSupabaseAdmin() {
  if (
    adminClient
  ) {
    return adminClient
  }

  const supabaseUrl =
    normalizeEnvValue(
      process.env.SUPABASE_URL,
    )

  const adminKey =
    normalizeEnvValue(
      process.env.SUPABASE_SECRET_KEY,
    ) ||
    normalizeEnvValue(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

  if (
    !supabaseUrl ||
    !adminKey
  ) {
    const error =
      new Error(
        'Supabase Storage admin credentials are not configured',
      )

    error.code =
      'STORAGE_ADMIN_NOT_CONFIGURED'

    error.status =
      503

    throw error
  }

  let parsedUrl

  try {
    parsedUrl =
      new URL(
        supabaseUrl,
      )
  } catch {
    const error =
      new Error(
        'SUPABASE_URL is not a valid URL',
      )

    error.code =
      'STORAGE_ADMIN_URL_INVALID'

    error.status =
      503

    throw error
  }

  if (
    ![
      'http:',
      'https:',
    ].includes(
      parsedUrl.protocol,
    )
  ) {
    const error =
      new Error(
        'SUPABASE_URL must use HTTP or HTTPS',
      )

    error.code =
      'STORAGE_ADMIN_URL_INVALID'

    error.status =
      503

    throw error
  }

  /*
   * Evita que por accidente se configure la publishable key
   * como credencial administrativa del backend.
   */
  if (
    adminKey.startsWith(
      'sb_publishable_',
    )
  ) {
    const error =
      new Error(
        'SUPABASE_SECRET_KEY must be a secret/admin key, not a publishable key',
      )

    error.code =
      'STORAGE_ADMIN_KEY_INVALID'

    error.status =
      503

    throw error
  }

  /*
   * Supabase soporta directamente:
   *
   * createClient(
   *   SUPABASE_URL,
   *   SUPABASE_SECRET_KEY
   * )
   *
   * No manipulamos manualmente Authorization ni apikey.
   */
  adminClient =
    createClient(
      supabaseUrl.replace(
        /\/+$/,
        '',
      ),
      adminKey,
      {
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,

          detectSessionInUrl:
            false,
        },
      },
    )

  return adminClient
}

function normalizeEnvValue(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  /*
   * Si una variable fue pegada accidentalmente en Render como:
   *
   * "valor"
   *
   * o
   *
   * 'valor'
   *
   * eliminamos solamente esas comillas exteriores.
   */
  if (
    normalized.length >=
      2 &&
    (
      (
        normalized.startsWith(
          '"',
        ) &&
        normalized.endsWith(
          '"',
        )
      ) ||
      (
        normalized.startsWith(
          "'",
        ) &&
        normalized.endsWith(
          "'",
        )
      )
    )
  ) {
    return normalized
      .slice(
        1,
        -1,
      )
      .trim()
  }

  return normalized
}