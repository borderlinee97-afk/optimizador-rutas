import '../global.css'

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import 'react-native-reanimated'

import { useColorScheme } from '@/components/useColorScheme'
import {
  AuthProvider,
  useAuth,
} from '../src/context/AuthContext'
import {
  PlanProvider,
} from '../src/context/PlanContext'

export {
  ErrorBoundary,
} from 'expo-router'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [
    fontsLoaded,
    fontError,
  ] =
    useFonts({
      SpaceMono: require(
        '../assets/fonts/SpaceMono-Regular.ttf',
      ),
    })

  useEffect(
    () => {
      if (
        fontError
      ) {
        throw fontError
      }
    },
    [
      fontError,
    ],
  )

  if (
    !fontsLoaded
  ) {
    return null
  }

  return (
    <AuthProvider>
      <PlanProvider>
        <RootNavigator />
      </PlanProvider>
    </AuthProvider>
  )
}

function RootNavigator() {
  const colorScheme =
    useColorScheme()

  const {
    session,
    profile,
    loading,
  } =
    useAuth()

  useEffect(
    () => {
      if (
        !loading
      ) {
        SplashScreen.hideAsync()
      }
    },
    [
      loading,
    ],
  )

  if (
    loading
  ) {
    return null
  }

  return (
    <ThemeProvider
      value={
        colorScheme ===
        'dark'
          ? DarkTheme
          : DefaultTheme
      }
    >
      <Stack
        screenOptions={{
          headerShown:
            false,
        }}
      >
        <Stack.Protected
          guard={
            !session
          }
        >
          <Stack.Screen
            name="(auth)"
          />
        </Stack.Protected>

        <Stack.Protected
          guard={Boolean(
            session &&
            !profile,
          )}
        >
          <Stack.Screen
            name="(status)"
          />
        </Stack.Protected>

        <Stack.Protected
          guard={Boolean(
            session &&
            profile,
          )}
        >
          <Stack.Screen
            name="(tabs)"
          />

          <Stack.Screen
            name="modal"
            options={{
              presentation:
                'modal',
            }}
          />

          <Stack.Screen
            name="unit/[id]"
          />

          <Stack.Screen
            name="extra-stop/new"
          />

          <Stack.Screen
            name="work-plans/index"
          />

          <Stack.Screen
            name="work-plans/[id]"
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  )
}