import { ScrollView, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { OverdueVisitAlerts } from "../src/components/OverdueVisitAlerts";
export default function FollowUpScreen() {
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
          Seguimiento de visitas
        </Text>
        <Text className="mt-2 text-base text-slate-600">
          Revisión de visitas anteriores. El trabajo de hoy puede continuar.
        </Text>
        <OverdueVisitAlerts />
      </ScrollView>
    </SafeAreaView>
  );
}
