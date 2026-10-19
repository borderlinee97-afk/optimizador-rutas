import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) {
  throw new Error(
    'Falta EXPO_PUBLIC_SUPABASE_URL en el archivo mobile/.env',
  )
}

if (!supabasePublishableKey) {
  throw new Error(
    'Falta EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en mobile/.env',
  )
}

// Same storage key used by Supabase by default; no second copy of tokens.
export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

export async function readPersistedAuthSession(): Promise<import('@supabase/supabase-js').Session | null> {
  if (Platform.OS === 'web') return null
  try {
    const raw = await AsyncStorage.getItem(authStorageKey)
    const value = raw ? JSON.parse(raw) : null
    return typeof value?.user?.id === 'string' && value.user.id &&
      typeof value.access_token === 'string' && value.access_token &&
      typeof value.refresh_token === 'string' && value.refresh_token ? value : null
  } catch {
    return null
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: {
      fetch: async (input, init) => {
        const isEvidenceUpload = String(input).includes('/storage/v1/object/upload/sign/')
        if (!isEvidenceUpload) return fetch(input, init)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60_000)
        try {
          return await fetch(input, { ...init, signal: controller.signal })
        } finally {
          clearTimeout(timeout)
        }
      },
    },
    auth: {
      storageKey: authStorageKey,
      ...(Platform.OS !== 'web'
        ? {
            storage: AsyncStorage,
          }
        : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
    },
  },
)

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
      return
    }

    supabase.auth.stopAutoRefresh()
  })
}
