import {
  createClient,
} from '@supabase/supabase-js'

let adminClient =
  null

export function getSupabaseAdmin() {
  if (adminClient) {
    return adminClient
  }

  const supabaseUrl =
    process.env.SUPABASE_URL

  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (
    !supabaseUrl ||
    !secretKey
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

  adminClient =
    createClient(
      supabaseUrl,
      secretKey,
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
