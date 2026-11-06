import { ScrollView, Text, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import manual from "../src/content/userManual.json";
export default function ManualScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="p-5 pb-12">
        <Pressable
          className="min-h-[44px] justify-center"
          onPress={() => router.back()}
        >
          <Text className="text-base font-bold text-primary-700">← Volver</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-slate-900">Manual de uso</Text>
        <Text className="mt-2 text-sm text-slate-600">{manual.edition}</Text>
        <Text className="mt-4 text-base text-slate-700">{manual.intro}</Text>
        {manual.sections.map((section) => (
          <View
            key={section.title}
            className="mt-5 rounded-xl border border-slate-300 bg-white p-4"
          >
            <Text className="text-xl font-bold text-slate-900">
              {section.title}
            </Text>
            {section.steps.map((step, i) => (
              <Text key={step} className="mt-3 text-base text-slate-700">
                {i + 1}. {step}
              </Text>
            ))}
          </View>
        ))}
        <View className="mt-5 rounded-xl border border-primary-200 bg-white p-4">
          <Text className="text-xl font-bold text-slate-900">
            Flujo operativo
          </Text>
          {manual.flow.map((step, i) => (
            <Text key={step} className="mt-3 text-base text-slate-700">
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
