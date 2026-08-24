import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  useAuth,
} from '../../src/context/AuthContext'

const TAB_ICONS: Record<
  string,
  {
    active: keyof typeof Ionicons.glyphMap
    inactive: keyof typeof Ionicons.glyphMap
  }
> = {
  index: {
    active: 'home',
    inactive: 'home-outline',
  },

  work: {
    active: 'clipboard',
    inactive: 'clipboard-outline',
  },

  approvals: {
    active: 'checkmark-done-circle',
    inactive: 'checkmark-done-circle-outline',
  },

  map: {
    active: 'map',
    inactive: 'map-outline',
  },

  profile: {
    active: 'person',
    inactive: 'person-outline',
  },
}

export default function TabLayout() {
  const insets =
    useSafeAreaInsets()

  const {
    profile,
  } =
    useAuth()

  const isSupervisor =
    profile?.rol ===
    'SUPERVISOR'

  const isManager =
    profile?.rol ===
    'GERENTE'

  return (
    <Tabs
      screenOptions={({
        route,
      }) => {
        const icons =
          TAB_ICONS[
            route.name
          ] ??
          TAB_ICONS.index

        return {
          headerShown:
            false,

          tabBarHideOnKeyboard:
            true,

          tabBarActiveTintColor:
            '#0f64ad',

          tabBarInactiveTintColor:
            '#64748b',

          sceneStyle: {
            backgroundColor:
              '#f5f7fa',
          },

          tabBarIcon: ({
            color,
            focused,
            size,
          }) => (
            <Ionicons
              name={
                focused
                  ? icons.active
                  : icons.inactive
              }
              color={
                color
              }
              size={
                size
              }
            />
          ),

          tabBarLabelStyle: {
            fontSize:
              12,

            fontWeight:
              '600',
          },

          tabBarStyle: {
            height:
              62 +
              insets.bottom,

            paddingTop:
              7,

            paddingBottom:
              Math.max(
                insets.bottom,
                8,
              ),

            borderTopWidth:
              1,

            borderTopColor:
              '#e2e8f0',

            backgroundColor:
              '#ffffff',
          },
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:
            'Inicio',
        }}
      />

      <Tabs.Screen
        name="work"
        options={{
          title:
            'Trabajo',

          href:
            isSupervisor
              ? undefined
              : null,
        }}
      />

      <Tabs.Screen
        name="approvals"
        options={{
          title:
            'Aprobaciones',

          href:
            isManager
              ? undefined
              : null,
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title:
            'Mapa',
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title:
            'Perfil',
        }}
      />
    </Tabs>
  )
}