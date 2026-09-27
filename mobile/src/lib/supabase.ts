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
