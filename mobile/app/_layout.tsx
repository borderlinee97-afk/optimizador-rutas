import '../src/services/backgroundTask'
import { BackgroundSyncBridge } from '../src/components/BackgroundSyncBridge'
import { AppUpdateProvider } from '../src/components/AppUpdateProvider'
import { AppUpdateCard } from '../src/components/AppUpdateCard'
import '../global.css'

import {
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native'
import { Stack,useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import 'react-native-reanimated'

import {
  AuthProvider,
  useAuth,
} from '../src/context/AuthContext'
import {
  PlanProvider,
} from '../src/context/PlanContext'
import { NotificationBridge } from '../src/components/NotificationBridge'
import { OfflineStatus } from '../src/components/OfflineStatus'
import { View,Text,Pressable } from 'react-native'
import type {ErrorBoundaryProps} from 'expo-router'
import Constants from 'expo-constants'
import {supabase} from '../src/lib/supabase'
import {apiRequest} from '../src/lib/api'
import { StatusBar } from 'expo-status-bar'

export function ErrorBoundary({retry}:ErrorBoundaryProps){
  useEffect(()=>{void(async()=>{try{const {data}=await supabase.auth.getSession();if(data.session)await apiRequest('/api/diagnostics/client',{method:'POST',body:JSON.stringify({source:'mobile',kind:'runtime_error',operation:'expo_screen',version:Constants.expoConfig?.version||'mobile'})},data.session.access_token)}catch{}})()},[])
  return <View style={{flex:1,padding:28,justifyContent:'center',backgroundColor:'#eef2f5'}}><Text style={{fontSize:24,fontWeight:'700',color:'#102332'}}>No fue posible abrir esta pantalla</Text><Text style={{fontSize:16,marginTop:16,color:'#435667'}}>Los registros guardados se conservan. Vuelve a intentar y revisa Mis pendientes.</Text><Pressable onPress={retry} style={{minHeight:48,marginTop:24,padding:14,borderRadius:10,backgroundColor:'#096e91'}}><Text style={{color:'#fff',fontSize:16,fontWeight:'700'}}>Reintentar</Text></Pressable></View>
}

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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
  return <PlanProvider key={session?.user.id ?? 'signed-out'}><NotificationBridge /><BackgroundSyncBridge /><RootNavigator /></PlanProvider>
}

function RootNavigator() {
  const segments=useSegments()
  const resettingPassword=String(segments.at(-1))==='reset-password'

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
      value={DefaultTheme}
    >
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar style="dark" />
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
