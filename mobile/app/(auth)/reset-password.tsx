import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { supabase } from '../../src/lib/supabase'
import {createRecoveryCodeExchange} from '../../src/services/passwordRecovery'
const exchangeRecoveryCode=createRecoveryCodeExchange(code=>supabase.auth.exchangeCodeForSession(code))

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [resetError,setResetError]=useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active=true
    async function acceptUrl(url: string | null) {
      try {
        const code=url?Linking.parse(url).queryParams?.code:null
        if(typeof code==='string'&&code)await exchangeRecoveryCode(code)
        const {data,error}=await supabase.auth.getUser()
        if(error||!data.user)throw new Error('El enlace no es válido o ya expiró. Solicita uno nuevo.')
        if(active){setResetError('');setReady(true)}
      } catch(error) {
        if(active){setResetError(error instanceof Error?error.message:'Solicita un enlace nuevo.');setReady(false)}
      }
    }
    void Linking.getInitialURL().then(acceptUrl)
    const subscription = Linking.addEventListener('url', event => {
      void acceptUrl(event.url)
    })

    return () => {active=false;subscription.remove()}
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
      // The next online login renews the offline credential with the new password.
      await supabase.auth.signOut({scope:'local'})
      setPassword('');setConfirmPassword('')

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

  if(resetError)return <SafeAreaView className="flex-1 justify-center bg-white px-6"><Text className="text-xl font-bold">No fue posible validar el enlace</Text><Text className="mt-4">{resetError}</Text><Pressable className="mt-5 rounded-xl bg-sky-700 p-4" onPress={()=>router.replace('/forgot-password')}><Text className="text-white">Solicitar otro enlace</Text></Pressable></SafeAreaView>
  if (!ready) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#0f64ad" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface px-6 pt-16">
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{flexGrow:1,paddingBottom:24}}><View className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6">
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
      </View></ScrollView></KeyboardAvoidingView>
    </SafeAreaView>
  )
}
