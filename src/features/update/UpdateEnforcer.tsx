import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';
import { CheckCircle2, Download, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { CONFIG, RELEASE_NOTES } from '../../constants/Config';

const UPDATE_PROMPT_FIRST_SEEN_KEY = 'app:update_prompt_first_seen_at';
const SHOW_WHATS_NEW_AFTER_INSTALL_KEY = 'app:show_whats_new_after_install';
const UPDATE_ENFORCE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

type UpdateState = {
    visible: boolean;
    forced: boolean;
};

async function getFirstSeenAt(): Promise<number | null> {
    const raw = await AsyncStorage.getItem(UPDATE_PROMPT_FIRST_SEEN_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

export function UpdateEnforcer() {
    const [state, setState] = useState<UpdateState>({ visible: false, forced: false });
    const [installing, setInstalling] = useState(false);
    const [whatsNewVisible, setWhatsNewVisible] = useState(false);
    const [notesReady, setNotesReady] = useState(false);

    const checkPendingWhatsNew = useCallback(async () => {
        try {
            const pending = await AsyncStorage.getItem(SHOW_WHATS_NEW_AFTER_INSTALL_KEY);
            if (pending === '1') {
                setWhatsNewVisible(true);
            }
        } catch {
            setWhatsNewVisible(false);
        } finally {
            setNotesReady(true);
        }
    }, []);

    useEffect(() => {
        checkPendingWhatsNew();
    }, [checkPendingWhatsNew]);

    const checkForUpdate = useCallback(async () => {
        try {
            if (__DEV__) return;
            const result = await Updates.checkForUpdateAsync();
            if (!result.isAvailable) return;

            const now = Date.now();
            const existingFirstSeen = await getFirstSeenAt();
            const firstSeenAt = existingFirstSeen ?? now;

            if (!existingFirstSeen) {
                await AsyncStorage.setItem(UPDATE_PROMPT_FIRST_SEEN_KEY, String(now));
            }

            const forced = now - firstSeenAt >= UPDATE_ENFORCE_AFTER_MS;
            setState({ visible: true, forced });
        } catch {
            // Keep dashboard usable if update service is temporarily unreachable.
            setState((prev) => ({ ...prev, visible: false }));
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!notesReady) return;
            if (whatsNewVisible) return;
            checkForUpdate();
        }, [checkForUpdate, notesReady, whatsNewVisible])
    );

    const installUpdate = useCallback(async () => {
        try {
            setInstalling(true);
            await Updates.fetchUpdateAsync();
            await AsyncStorage.setItem(SHOW_WHATS_NEW_AFTER_INSTALL_KEY, '1');
            await AsyncStorage.removeItem(UPDATE_PROMPT_FIRST_SEEN_KEY);
            await Updates.reloadAsync();
        } catch {
            setInstalling(false);
        }
    }, []);

    const onLater = useCallback(() => {
        if (state.forced) return;
        setState((prev) => ({ ...prev, visible: false }));
    }, [state.forced]);

    const helperText = useMemo(() => {
        if (state.forced) {
            return 'This update is now required to continue using the app. Please install to proceed.';
        }
        return 'A better experience is ready. Install now to get the latest features and performance improvements.';
    }, [state.forced]);

    const closeWhatsNew = useCallback(async () => {
        setWhatsNewVisible(false);
        try {
            await AsyncStorage.removeItem(SHOW_WHATS_NEW_AFTER_INSTALL_KEY);
        } catch {
            // no-op
        }
    }, []);

    return (
        <>
            <Modal visible={state.visible} transparent animationType="fade" onRequestClose={onLater}>
                <View className="flex-1 items-center justify-center bg-black/45 px-6">
                    <View className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-100 bg-white">
                        <LinearGradient colors={['#ECFDF5', '#FFFFFF']} className="px-6 pb-5 pt-6">
                            <View className="mb-4 flex-row items-center">
                                <View className="mr-3 rounded-2xl bg-emerald-100 p-3">
                                    <Download size={20} color="#059669" strokeWidth={2.6} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-lg font-black text-neutral-900">New update available</Text>
                                    <Text className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                                        {CONFIG.APP_NAME}
                                    </Text>
                                </View>
                            </View>
                            <Text className="text-sm leading-5 text-neutral-600">{helperText}</Text>
                        </LinearGradient>

                        <View className="px-6 pb-6">
                            <View className="mb-5 mt-1 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                                <Text className="text-xs font-semibold text-neutral-600">
                                    {state.forced
                                        ? 'Your update deadline has passed. Please install now.'
                                        : 'You can install now or continue and update later.'}
                                </Text>
                            </View>

                            <View className="flex-row items-center justify-end gap-3">
                                {!state.forced && (
                                    <Pressable
                                        onPress={onLater}
                                        disabled={installing}
                                        className="rounded-xl border border-neutral-200 px-4 py-3"
                                    >
                                        <Text className="text-sm font-bold text-neutral-600">Later</Text>
                                    </Pressable>
                                )}
                                <Pressable
                                    onPress={installUpdate}
                                    disabled={installing}
                                    className="min-w-[130px] items-center rounded-xl bg-emerald-600 px-4 py-3"
                                >
                                    {installing ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text className="text-sm font-bold text-white">Install now</Text>
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={whatsNewVisible}
                transparent
                animationType="fade"
                onRequestClose={closeWhatsNew}
            >
                <View className="flex-1 items-center justify-center bg-black/45 px-6">
                    <View className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-100 bg-white">
                        <LinearGradient colors={['#F0FDF4', '#FFFFFF']} className="px-6 pb-5 pt-6">
                            <View className="flex-row items-center">
                                <View className="mr-3 rounded-2xl bg-emerald-100 p-3">
                                    <Sparkles size={20} color="#059669" strokeWidth={2.5} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-lg font-black text-neutral-900">What&apos;s new</Text>
                                    <Text className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                                        {CONFIG.APP_NAME}
                                    </Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View className="px-6 pb-6">
                            <View className="mb-5 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-4">
                                {RELEASE_NOTES.map((note, index) => (
                                    <View
                                        key={`${index}-${note}`}
                                        className={`flex-row items-start ${index > 0 ? 'mt-3' : ''}`}
                                    >
                                        <CheckCircle2
                                            size={16}
                                            color="#059669"
                                            strokeWidth={2.5}
                                            style={{ marginTop: 1, marginRight: 8 }}
                                        />
                                        <Text className="flex-1 text-sm leading-5 text-neutral-700">{note}</Text>
                                    </View>
                                ))}
                            </View>

                            <Pressable
                                onPress={closeWhatsNew}
                                className="items-center rounded-xl bg-emerald-600 px-4 py-3"
                            >
                                <Text className="text-sm font-bold text-white">Got it</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}
