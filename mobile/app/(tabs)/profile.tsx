import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { useAuth } from '../../src/context/AuthContext'
import {
  AREA_LABELS,
  ROLE_LABELS,
} from '../../src/config/roles'

function getInitials(name?: string): string {
  if (!name?.trim()) {
    return 'U'
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function ProfileScreen() {
  const {
    profile,
    user,
    signOut,
  } = useAuth()

  const [signingOut, setSigningOut] =
    useState(false)

  async function handleSignOut() {
    try {
      setSigningOut(true)

      const { error } = await signOut()

      if (error) {
        Alert.alert(
          'No fue posible cerrar sesión',
          error.message,
        )
      }
    } catch (error) {
      console.error(
        'Error cerrando sesión:',
        error,
      )

      Alert.alert(
        'Error',
        'No fue posible cerrar la sesión.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-surface"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl px-5 pb-8 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-3xl font-bold text-slate-900">
          Perfil
        </Text>

        <View className="mt-6 items-center rounded-3xl border border-slate-200 bg-white p-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary-600">
            <Text className="text-2xl font-bold text-white">
              {getInitials(profile?.nombre)}
            </Text>
          </View>

          <Text className="mt-4 text-center text-xl font-bold text-slate-900">
            {profile?.nombre ?? 'Usuario'}
          </Text>

          <Text className="mt-1 text-center text-sm text-slate-500">
            {user?.email ?? 'Sin correo disponible'}
          </Text>

          {profile ? (
            <View className="mt-4 flex-row gap-2">
              <View className="rounded-full bg-primary-100 px-3 py-2">
                <Text className="text-xs font-bold text-primary-700">
                  {ROLE_LABELS[profile.rol]}
                </Text>
              </View>

              <View className="rounded-full bg-slate-100 px-3 py-2">
                <Text className="text-xs font-bold text-slate-700">
                  {AREA_LABELS[profile.area]}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View className="mt-5 rounded-3xl border border-slate-200 bg-white">
          <ProfileRow
            label="Estado de la cuenta"
            value={
              profile?.activo
                ? 'Activa'
                : 'Inactiva'
            }
          />

          <View className="mx-5 h-px bg-slate-100" />

          <ProfileRow
            label="Rol"
            value={
              profile
                ? ROLE_LABELS[profile.rol]
                : 'No disponible'
            }
          />

          <View className="mx-5 h-px bg-slate-100" />

          <ProfileRow
            label="Área"
            value={
              profile
                ? AREA_LABELS[profile.area]
                : 'No disponible'
            }
          />
        </View>

        <Pressable
          className="mt-6 h-14 items-center justify-center rounded-2xl border border-red-200 bg-red-50"
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#c13b3b" />
          ) : (
            <Text className="text-base font-bold text-danger">
              Cerrar sesión
            </Text>
          )}
        </Pressable>

        <Text className="mt-6 text-center text-xs text-slate-400">
          Optimizador de Rutas · Aplicación móvil
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function ProfileRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-center justify-between px-5 py-4">
      <Text className="text-sm text-slate-500">
        {label}
      </Text>

      <Text className="ml-4 flex-1 text-right text-sm font-bold text-slate-800">
        {value}
      </Text>
    </View>
  )
}