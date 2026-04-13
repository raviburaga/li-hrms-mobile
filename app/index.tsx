import { View, Text, TouchableOpacity } from 'react-native';
import { router, Redirect } from 'expo-router';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useAuthStore } from '../src/store/useAuthStore';
import { useAuthPersistHydrated } from '../src/hooks/useAuthPersistHydrated';
import { SkeletonBlock } from '../src/components/Skeleton';

const screenFill = { flex: 1 as const, backgroundColor: '#FAFAF9' as const };

export default function HomeScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const hydrated = useAuthPersistHydrated();

    if (!hydrated) {
        return (
            <View style={screenFill} className="flex-1 justify-center px-10">
                <SkeletonBlock height={14} width="40%" />
                <SkeletonBlock height={40} width="72%" style={{ marginTop: 16 }} />
                <SkeletonBlock height={18} width="88%" style={{ marginTop: 12 }} />
                <SkeletonBlock height={56} style={{ marginTop: 40 }} radius={20} />
            </View>
        );
    }

    if (isAuthenticated) {
        return <Redirect href="/(tabs)" />;
    }

    return (
        <View style={screenFill} className="flex-1">
            <StatusBar style="dark" />
            <LinearGradient
                colors={['#FAFAF9', '#F5F5F4', '#ECFDF5']}
                locations={[0, 0.5, 1]}
                className="absolute inset-0"
            />
            {/* Soft decorative blobs */}
            <View
                pointerEvents="none"
                className="absolute -right-24 top-32 h-72 w-72 rounded-full bg-emerald-100/40"
                style={{ transform: [{ scale: 1.2 }] }}
            />
            <View
                pointerEvents="none"
                className="absolute -left-20 bottom-40 h-56 w-56 rounded-full bg-stone-200/35"
            />

            <SafeAreaView className="flex-1 justify-between px-8 pb-8 pt-4">
                <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }}>
                    <View className="mb-8 mt-4 flex-row items-center gap-2">
                        <View className="rounded-full bg-white/80 px-3 py-1.5 shadow-sm shadow-stone-200/50">
                            <Text className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Li HRMS</Text>
                        </View>
                        <View className="flex-row items-center gap-1 rounded-full bg-emerald-50/90 px-2.5 py-1">
                            <Sparkles size={12} color="#059669" strokeWidth={2.2} />
                            <Text className="text-[10px] font-semibold text-emerald-800">Mobile</Text>
                        </View>
                    </View>

                    <Text className="text-[42px] font-semibold leading-[48px] tracking-tight text-stone-800">
                        Your workplace,{'\n'}
                        <Text className="text-emerald-700">gently organized.</Text>
                    </Text>
                    <Text className="mt-5 max-w-[320px] text-[16px] leading-6 text-stone-500">
                        Sign in to access leaves, attendance, finance, and your profile — same HRMS you use on the web.
                    </Text>
                </MotiView>

                <MotiView
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 550, delay: 120 }}
                >
                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/login')}
                        activeOpacity={0.92}
                        className="overflow-hidden rounded-[22px]"
                        style={{
                            shadowColor: '#059669',
                            shadowOffset: { width: 0, height: 12 },
                            shadowOpacity: 0.2,
                            shadowRadius: 20,
                            elevation: 6,
                        }}
                    >
                        <LinearGradient
                            colors={['#34D399', '#10B981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            className="h-[58px] flex-row items-center justify-center px-6"
                        >
                            <Text className="text-[16px] font-semibold tracking-wide text-white">Sign in</Text>
                            <View className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-white/20">
                                <ChevronRight size={20} color="white" strokeWidth={2.5} />
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    <Text className="mt-6 text-center text-[11px] font-medium leading-4 text-stone-400">
                        Secure access · Your organization&apos;s HRMS
                    </Text>
                </MotiView>
            </SafeAreaView>
        </View>
    );
}
