import { useCallback, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth } from "../src/context/AuthContext";
import { usePlan } from "../src/context/PlanContext";
import { localDiagnostics } from "../src/services/localDiagnostics";
export default function PendingScreen() {
  const { session, profile, accessState } = useAuth(),
    { refresh, lastSyncedAt, syncing } = usePlan(),
    [rows, setRows] = useState<ReturnType<typeof localDiagnostics>>([]),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      try {
        setRows(session ? localDiagnostics(session.user.id) : []);
        setError("");
      } catch {
        setRows([]);
        setError("La información local no está disponible para esta sesión.");
      }
    }, [session?.user.id, accessState, lastSyncedAt]),
  );
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="p-5 pb-12">
        <Pressable
          className="min-h-[44px] justify-center"
          onPress={() => router.back()}
        >
          <Text className="text-base font-bold text-primary-700">← Volver</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-slate-900">
          Mis pendientes
        </Text>
        <Text className="mt-2 text-base text-slate-600">
          Estado:{" "}
          {accessState === "online"
            ? "En línea"
            : accessState === "offline"
              ? "Sin conexión"
              : "Validando acceso"}{" "}
          · Versión {Constants.expoConfig?.version || "—"}
        </Text>
        <Text className="mt-2 text-sm text-slate-600">
          Última descarga:{" "}
          {lastSyncedAt
            ? new Date(lastSyncedAt).toLocaleString("es-MX")
            : "Sin descarga confirmada"}
        </Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            className="mt-3 text-base text-red-700"
          >
            {error}
          </Text>
        ) : null}
        {rows.map((row) => (
          <View
            key={row.name}
            className="mt-4 rounded-xl border border-slate-300 bg-white p-4"
          >
            <Text className="text-lg font-bold text-slate-900">{row.name}</Text>
            <Text className="mt-2 text-base text-slate-700">
              {row.pending} por sincronizar · {row.failed} requieren atención
            </Text>
            {row.oldestAt ? (
              <Text className="mt-1 text-sm text-slate-600">
                Más antiguo: {new Date(row.oldestAt).toLocaleString("es-MX")}
              </Text>
            ) : null}
          </View>
        ))}
        <Pressable
          disabled={syncing}
          onPress={() => {
            void refresh();
          }}
          className="mt-5 min-h-[48px] items-center justify-center rounded-xl bg-primary-600"
        >
          <Text className="text-base font-bold text-white">
            {syncing ? "Sincronizando…" : "Actualizar trabajo y sincronización"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/tasks")}
          className="mt-3 min-h-[48px] justify-center"
        >
          <Text className="text-base font-bold text-primary-700">
            Abrir tareas de agenda →
          </Text>
        </Pressable>
        {["COORDINADOR", "GERENTE"].includes(profile?.rol || "") ? (
          <>
            <Pressable
              onPress={() => router.push("/(tabs)/approvals")}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-base font-bold text-primary-700">
                Solicitudes por aprobar →
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/follow-up")}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-base font-bold text-primary-700">
                Seguimiento de visitas →
              </Text>
            </Pressable>
          </>
        ) : null}
        <Text className="mt-4 text-sm text-slate-600">
          Este diagnóstico conserva los registros pendientes. No elimina
          operaciones ni reintenta automáticamente rechazos definitivos.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
