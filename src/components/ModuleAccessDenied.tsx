import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export function ModuleAccessDenied({
    moduleLabel,
    showBack = false,
}: {
    moduleLabel: string;
    showBack?: boolean;
}) {
    const router = useRouter();

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                {showBack ? (
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mx-6 mt-4 h-12 w-12 items-center justify-center rounded-2xl border-2 border-neutral-100 bg-white"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                ) : null}
                <View className="flex-1 items-center justify-center px-8">
                    <Text className="text-center text-base font-semibold text-neutral-700">
                        You do not have access to {moduleLabel}.
                    </Text>
                    <Text className="mt-2 text-center text-sm text-neutral-500">
                        Ask your administrator to enable this module in feature control.
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}
