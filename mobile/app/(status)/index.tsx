import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '../../src/context/AuthContext'

export default function AccountStatusScreen() {
  const {
    profileError,
    refreshProfile,
    signOut,
  } = useAuth()

  const [retrying, setRetrying] = useState(false)
  const [signingOut, setSigningOut] =
    useState(false)

  async function handleRetry() {
    try {
      setRetrying(true)
      await refreshProfile()
    } finally {
      setRetrying(false)
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center px-6">
        <View className="rounded-3xl border border-slate-200 bg-white p-6">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <Text className="text-2xl">!</Text>
          </View>

          <Text className="text-2xl font-bold text-slate-900">
            Acceso pendiente
          </Text>

          <Text className="mt-3 text-base leading-6 text-slate-500">
            Tu cuenta inició sesión correctamente,
            pero todavía no fue posible cargar un
            perfil operativo autorizado.
          </Text>

          {profileError ? (
            <View className="mt-5 rounded-2xl bg-red-50 px-4 py-3">
              <Text className="text-sm leading-5 text-danger">
                {profileError}
              </Text>
            </View>
          ) : null}

          <Pressable
            className="mt-6 h-14 items-center justify-center rounded-2xl bg-primary-600"
            onPress={handleRetry}
            disabled={retrying || signingOut}
          >
            {retrying ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-bold text-white">
                Intentar nuevamente
              </Text>
            )}
          </Pressable>

          <Pressable
            className="mt-3 h-14 items-center justify-center rounded-2xl border border-slate-300"
            onPress={handleSignOut}
            disabled={retrying || signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#475569" />
            ) : (
              <Text className="text-base font-semibold text-slate-700">
                Cerrar sesión
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}