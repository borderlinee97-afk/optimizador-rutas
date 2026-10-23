import { AppUpdateProvider } from '../src/components/AppUpdateProvider'
import { AppUpdateCard } from '../src/components/AppUpdateCard'
import '../global.css'

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack,useSegments } from 'expo-router'
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
import { NotificationBridge } from '../src/components/NotificationBridge'
import { OfflineStatus } from '../src/components/OfflineStatus'
import { View } from 'react-native'

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
    <AppUpdateProvider>
    <AuthProvider>
      <AccountNavigator />
    </AuthProvider>
    </AppUpdateProvider>
  )
}

function AccountNavigator() {
  const { session } = useAuth()
  // Remount all account-local screen state when the authenticated identity changes.
  return <PlanProvider key={session?.user.id ?? 'signed-out'}><NotificationBridge /><RootNavigator /></PlanProvider>
}

function RootNavigator() {
  const segments=useSegments()
  const resettingPassword=String(segments.at(-1))==='reset-password'
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
      <View style={{ flex: 1 }}>
      <OfflineStatus />
      <AppUpdateCard compact />
      <Stack
        screenOptions={{
          headerShown:
            false,
        }}
      >
        <Stack.Protected
          guard={
            !session || resettingPassword
          }
        >
          <Stack.Screen
            name="(auth)"
          />
        </Stack.Protected>

        <Stack.Protected
          guard={Boolean(
            session && !resettingPassword &&
            !profile,
          )}
        >
          <Stack.Screen
            name="(status)"
          />
        </Stack.Protected>

        <Stack.Protected
          guard={Boolean(
            session && !resettingPassword &&
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
          <Stack.Screen name="legacy-recovery" />

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
      </View>
    </ThemeProvider>
  )
}
