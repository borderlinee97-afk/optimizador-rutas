import { Link } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin() {
    setErrorMessage('')

    if (!email.trim() || !password) {
      setErrorMessage(
        'Ingresa tu correo electrónico y contraseña.',
      )
      return
    }

    try {
      setSubmitting(true)

      const { error } = await signIn(email, password)

      if (error) {
        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'El correo o la contraseña son incorrectos.'
            : error.message,
        )
      }
    } catch (error) {
      console.error(error)
      setErrorMessage(
        'No fue posible iniciar sesión. Intenta nuevamente.',
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
            <View className="mb-8">
              <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-primary-600">
                <Text className="text-2xl font-bold text-white">
                  R
                </Text>
              </View>

              <Text className="text-3xl font-bold text-slate-900">
                Iniciar sesión
              </Text>

              <Text className="mt-2 text-base leading-6 text-slate-500">
                Accede a tus rutas, planes de trabajo y
                actividades asignadas.
              </Text>
            </View>

            <View className="rounded-3xl border border-slate-200 bg-white p-5">
              <View className="mb-5">
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
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text className="mb-2 text-sm font-semibold text-slate-700">
                  Contraseña
                </Text>

                <View className="flex-row items-center rounded-2xl border border-slate-300 bg-slate-50">
                  <TextInput
                    className="h-14 flex-1 px-4 text-base text-slate-900"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Ingresa tu contraseña"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!submitting}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />

                  <Pressable
                    className="h-14 justify-center px-4"
                    onPress={() =>
                      setShowPassword((current) => !current)
                    }
                    disabled={submitting}
                  >
                    <Text className="font-semibold text-primary-600">
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="mt-4 items-end">
                <Link
                  href="/forgot-password"
                  className="font-semibold text-primary-600"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </View>

              {errorMessage ? (
                <View className="mt-5 rounded-2xl bg-red-50 px-4 py-3">
                  <Text className="text-sm leading-5 text-danger">
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                className={`mt-6 h-14 items-center justify-center rounded-2xl ${
                  submitting
                    ? 'bg-primary-500'
                    : 'bg-primary-600'
                }`}
                onPress={handleLogin}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-base font-bold text-white">
                    Entrar
                  </Text>
                )}
              </Pressable>
            </View>

            <Text className="mt-6 text-center text-xs leading-5 text-slate-400">
              El acceso y las funciones disponibles dependen de
              tu área, rol y proyecto asignado.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}