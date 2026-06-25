import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { criticalReadinessMet, getBackgroundReadinessSteps } from '../background/backgroundReadiness';

export function BackgroundReadinessBanner() {
    const router = useRouter();
    const [ready, setReady] = useState(true);
    const [checking, setChecking] = useState(true);

    const refresh = useCallback(async () => {
        setChecking(true);
        try {
            const steps = await getBackgroundReadinessSteps();
            setReady(criticalReadinessMet(steps));
        } catch {
            setReady(false);
        } finally {
            setChecking(false);
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

    if (checking || ready) return null;

    return (
        <TouchableOpacity
            onPress={() => router.push('/background-setup')}
            activeOpacity={0.9}
            className="mb-4 flex-row items-center rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3"
        >
            <AlertTriangle size={20} color="#B45309" strokeWidth={2.5} />
            <View className="ml-3 flex-1">
                <Text className="text-xs font-black uppercase tracking-wider text-amber-900">Background setup needed</Text>
                <Text className="mt-0.5 text-xs leading-4 text-amber-800">
                    Enable notifications and always-on location so OD tracking works when the app is closed.
                </Text>
            </View>
            <ChevronRight size={18} color="#B45309" strokeWidth={2.5} />
        </TouchableOpacity>
    );
}
