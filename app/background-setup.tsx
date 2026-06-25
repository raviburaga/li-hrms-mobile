import { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    AppState,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Bell, MapPin, Navigation, Battery, CheckCircle2, Circle, Settings } from 'lucide-react-native';
import {
    criticalReadinessMet,
    getBackgroundReadinessSteps,
    openAppSystemSettings,
    runReadinessAction,
    type ReadinessStep,
    type ReadinessStepId,
} from '../src/background/backgroundReadiness';

function stepIcon(id: ReadinessStepId) {
    switch (id) {
        case 'notifications':
            return Bell;
        case 'foreground_location':
            return MapPin;
        case 'background_location':
            return Navigation;
        case 'battery':
            return Battery;
        default:
            return Settings;
    }
}

export default function BackgroundSetupScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<ReadinessStepId | null>(null);
    const [steps, setSteps] = useState<ReadinessStep[]>([]);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const next = await getBackgroundReadinessSteps();
            setSteps(next);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
        });
        return () => sub.remove();
    }, [refresh]);

    const allReady = criticalReadinessMet(steps);

    const onAction = async (step: ReadinessStep) => {
        if (step.ready && step.id !== 'battery') return;
        setActing(step.id);
        try {
            await runReadinessAction(step.id);
            await refresh();
        } finally {
            setActing(null);
        }
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pt-2 pb-4">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-3 h-12 w-12 items-center justify-center rounded-2xl border-2 border-neutral-100 bg-white"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Field setup</Text>
                        <Text className="text-xl font-black text-neutral-900">Background services</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                    <View className="mb-6 rounded-[28px] border-2 border-emerald-100 bg-emerald-50/80 px-5 py-4">
                        <Text className="text-sm font-bold leading-5 text-emerald-900">
                            Enable these so HRMS can send push alerts and record your on-duty GPS route even when the app is
                            closed or removed from recent apps.
                        </Text>
                        {allReady ? (
                            <View className="mt-3 flex-row items-center">
                                <CheckCircle2 size={18} color="#059669" strokeWidth={2.5} />
                                <Text className="ml-2 text-sm font-black text-emerald-800">Required permissions are enabled</Text>
                            </View>
                        ) : (
                            <Text className="mt-3 text-xs font-semibold text-amber-800">
                                Complete the steps below before going on duty.
                            </Text>
                        )}
                    </View>

                    {loading && steps.length === 0 ? (
                        <View className="items-center py-16">
                            <ActivityIndicator size="large" color="#10B981" />
                        </View>
                    ) : (
                        steps.map((step) => {
                            const Icon = stepIcon(step.id);
                            const done = step.ready;
                            const isBattery = step.id === 'battery';
                            const actionLabel = done && !isBattery ? 'Enabled' : isBattery ? 'Open battery settings' : 'Enable';
                            const disabled = (done && !isBattery) || acting === step.id;

                            return (
                                <View
                                    key={step.id}
                                    className="mb-4 rounded-[24px] border border-neutral-100 bg-white px-5 py-4 shadow-sm shadow-neutral-100"
                                >
                                    <View className="flex-row items-start">
                                        <View
                                            className={`h-11 w-11 items-center justify-center rounded-2xl ${done && !isBattery ? 'bg-emerald-100' : 'bg-neutral-50'}`}
                                        >
                                            <Icon size={20} color={done && !isBattery ? '#059669' : '#64748B'} strokeWidth={2.5} />
                                        </View>
                                        <View className="ml-4 flex-1">
                                            <View className="flex-row items-center">
                                                <Text className="flex-1 text-base font-black text-neutral-900">{step.title}</Text>
                                                {done && !isBattery ? (
                                                    <CheckCircle2 size={20} color="#10B981" strokeWidth={2.5} />
                                                ) : (
                                                    <Circle size={18} color="#CBD5E1" strokeWidth={2.5} />
                                                )}
                                            </View>
                                            <Text className="mt-1 text-xs leading-5 text-neutral-500">{step.description}</Text>
                                            {!step.required ? (
                                                <Text className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                    Recommended on {Platform.OS === 'android' ? 'Android' : 'this device'}
                                                </Text>
                                            ) : null}
                                            <TouchableOpacity
                                                onPress={() => void onAction(step)}
                                                disabled={disabled}
                                                className={`mt-3 items-center rounded-2xl px-4 py-3 ${disabled ? 'bg-neutral-100' : 'bg-primary'}`}
                                            >
                                                {acting === step.id ? (
                                                    <ActivityIndicator color={disabled ? '#64748B' : '#FFFFFF'} />
                                                ) : (
                                                    <Text
                                                        className={`text-xs font-black uppercase tracking-widest ${disabled ? 'text-neutral-500' : 'text-white'}`}
                                                    >
                                                        {actionLabel}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    )}

                    <TouchableOpacity
                        onPress={() => void openAppSystemSettings()}
                        className="mb-4 flex-row items-center justify-center rounded-2xl border-2 border-neutral-200 bg-white px-4 py-3"
                    >
                        <Settings size={18} color="#0F172A" strokeWidth={2.5} />
                        <Text className="ml-2 text-xs font-black text-neutral-800">Open app system settings</Text>
                    </TouchableOpacity>

                    <Text className="mb-12 text-center text-[11px] leading-5 text-neutral-400">
                        After enabling “Always” location on {Platform.OS === 'ios' ? 'iOS' : 'Android'}, return here and pull to
                        refresh or reopen this screen. On-duty tracking shows a persistent “On-duty route” notification while
                        GPS is recording.
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
