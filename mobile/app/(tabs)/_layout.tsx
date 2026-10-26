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

  tasks: {
    active: 'list-circle',
    inactive: 'list-circle-outline',
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

  const role =
    profile?.rol ?? null

  const canExecuteFieldWork =
    role ===
      'SUPERVISOR' ||
    role ===
      'COORDINADOR'

  const canAccessApprovals =
    role ===
      'COORDINADOR' ||
    role ===
      'GERENTE' ||
    role ===
      'DIRECTOR'

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
            '#147b9d',

          tabBarInactiveTintColor:
            '#237347',

          sceneStyle: {
            backgroundColor:
              '#ffffff',
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

          tabBarActiveBackgroundColor: '#edf6fa',
          tabBarItemStyle: { borderRadius: 10, marginHorizontal: 3 },

          tabBarLabelStyle: {
            fontSize:
              12,

            fontWeight:
              '600',
          },

          tabBarStyle: {
            marginHorizontal: 12,
            marginBottom: 8,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e5ebed',
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
              '#e5ebed',

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
            canExecuteFieldWork
              ? undefined
              : null,
        }}
      />

      <Tabs.Screen
        name="tasks"
        options={{
          title:
            'Agenda',
        }}
      />

      <Tabs.Screen
        name="approvals"
        options={{
          title:
            'Aprobaciones',

          href:
            canAccessApprovals
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