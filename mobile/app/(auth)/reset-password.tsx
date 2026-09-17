import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { supabase } from '../../src/lib/supabase'

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function acceptUrl(url: string | null) {
      if (!url) {
        setReady(true)
        return
      }

      const code = Linking.parse(url).queryParams?.code
      if (typeof code === 'string' && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          Alert.alert('Enlace no válido', error.message)
        }
      }

      setReady(true)
    }

    void Linking.getInitialURL().then(acceptUrl)
    const subscription = Linking.addEventListener('url', event => {
      void acceptUrl(event.url)
    })

    return () => subscription.remove()
  }, [])

  async function updatePassword() {
    if (password.length < 12) {
      Alert.alert('Contraseña corta', 'Usa al menos 12 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Las contraseñas no coinciden')
      return
    }

    try {
      setBusy(true)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      Alert.alert('Contraseña actualizada', 'Ya puedes ingresar con tu nueva contraseña.', [
        { text: 'Continuar', onPress: () => router.replace('/login') },
      ])
    } catch (error) {
      Alert.alert(
        'No fue posible actualizar la contraseña',
        error instanceof Error ? error.message : 'Solicita un enlace nuevo.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#0f64ad" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface px-6 pt-16">
      <View className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6">
        <Text className="text-2xl font-bold text-slate-900">Nueva contraseña</Text>
        <Text className="mt-2 text-sm text-slate-500">Usa al menos 12 caracteres y no la compartas.</Text>
        <TextInput
          className="mt-6 rounded-2xl border border-slate-300 px-4 py-4"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Nueva contraseña"
        />
        <TextInput
          className="mt-3 rounded-2xl border border-slate-300 px-4 py-4"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="Confirmar contraseña"
        />
        <Pressable
          className="mt-5 items-center rounded-2xl bg-sky-700 px-4 py-4"
          disabled={busy}
          onPress={() => void updatePassword()}
        >
          <Text className="font-bold text-white">{busy ? 'Guardando…' : 'Guardar contraseña'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
