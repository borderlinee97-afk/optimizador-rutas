import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useWindowDimensions } from 'react-native'

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
  const { width, fontScale } = useWindowDimensions()

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

  const compact = width / (canExecuteFieldWork && canAccessApprovals ? 6 : 5) < 72
  const labelSize = compact ? 11 : 12
  const barHeight = 64 + Math.max(0, fontScale - 1) * 18

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <Tabs
      safeAreaInsets={{ bottom: 0, left: 0, right: 0 }}
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
            '#096e91',

          tabBarInactiveTintColor:
            '#435667',

          sceneStyle: {
            backgroundColor:
              '#eef2f5',
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

          tabBarLabelPosition: 'below-icon',
          tabBarLabel: ({ color, children }) => (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.5}
              style={{ color, fontSize: labelSize, fontWeight: '700', textAlign: 'center' }}>
              {compact && route.name === 'approvals' ? 'Aprob.' : children}
            </Text>
          ),
          tabBarActiveBackgroundColor: '#dfeef5',
          tabBarItemStyle: { borderRadius: 10, marginHorizontal: compact ? 0 : 2, minWidth: 0 },

          tabBarLabelStyle: {
            fontSize: labelSize,

            fontWeight:
              '600',
          },

          tabBarStyle: {
            height: barHeight,
            paddingTop: 6,
            paddingBottom: 8,
            paddingHorizontal: 4,
            borderTopWidth: 1,
            borderTopColor: '#bfcbd5',
            backgroundColor: '#ffffff',
            elevation: 0,
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
    </SafeAreaView>
  )
}
