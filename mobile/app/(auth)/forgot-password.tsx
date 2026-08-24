import { Link } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useAuth } from '../../src/context/AuthContext'

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function handleSendEmail() {
    setErrorMessage('')
    setSuccessMessage('')

    if (!email.trim()) {
      setErrorMessage('Ingresa tu correo electrónico.')
      return
    }

    try {
      setSubmitting(true)

      const { error } =
        await sendPasswordReset(email)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setSuccessMessage(
        'Te enviamos las instrucciones para restablecer tu contraseña.',
      )
    } catch (error) {
      console.error(error)
      setErrorMessage(
        'No fue posible enviar el correo de recuperación.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-md">
            <Text className="text-3xl font-bold text-slate-900">
              Recuperar contraseña
            </Text>

            <Text className="mt-2 text-base leading-6 text-slate-500">
              Ingresa tu correo y recibirás las instrucciones
              para crear una nueva contraseña.
            </Text>

            <View className="mt-8 rounded-3xl border border-slate-200 bg-white p-5">
              <Text className="mb-2 text-sm font-semibold text-slate-700">
                Correo electrónico
              </Text>

              <TextInput
                className="h-14 rounded-2xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900"
                value={email}
                onChangeText={setEmail}
                placeholder="nombre@empresa.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                returnKeyType="send"
                onSubmitEditing={handleSendEmail}
              />

              {errorMessage ? (
                <View className="mt-5 rounded-2xl bg-red-50 px-4 py-3">
                  <Text className="text-sm text-danger">
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {successMessage ? (
                <View className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3">
                  <Text className="text-sm leading-5 text-success">
                    {successMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                className="mt-6 h-14 items-center justify-center rounded-2xl bg-primary-600"
                onPress={handleSendEmail}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-base font-bold text-white">
                    Enviar instrucciones
                  </Text>
                )}
              </Pressable>

              <Link
                href="/login"
                className="mt-5 text-center font-semibold text-primary-600"
              >
                Regresar al inicio de sesión
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}