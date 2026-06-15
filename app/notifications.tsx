import { useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    FlatList,
    Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { api, ApiEnvelope, type InAppNotification } from '../src/api/client';
import { useNotificationStore } from '../src/notifications/notificationStore';
import { openNotificationTarget } from '../src/notifications/notificationNavigation';
import { syncBadgeCount } from '../src/notifications/pushRegistration';

function formatNotificationTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata',
        });
    } catch {
        return iso;
    }
}

export default function NotificationsScreen() {
    const router = useRouter();
    const items = useNotificationStore((s) => s.items);
    const loading = useNotificationStore((s) => s.loading);
    const refreshList = useNotificationStore((s) => s.refreshList);
    const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
    const markReadLocal = useNotificationStore((s) => s.markReadLocal);
    const markAllReadLocal = useNotificationStore((s) => s.markAllReadLocal);
    const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

    const load = useCallback(async () => {
        await Promise.all([refreshList(), refreshUnreadCount()]);
    }, [refreshList, refreshUnreadCount]);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load])
    );

    const onPressItem = async (n: InAppNotification) => {
        if (!n.isRead) {
            try {
                const res = await api.markNotificationRead(n._id);
                const body = res.data as ApiEnvelope;
                if (res.status === 200 && body.success) {
                    markReadLocal(n._id);
                    await refreshUnreadCount();
                    void syncBadgeCount(useNotificationStore.getState().unreadCount);
                }
            } catch {
                /* ignore */
            }
        }
        openNotificationTarget(n);
    };

    const onMarkAll = () => {
        const unread = items.filter((x) => !x.isRead);
        if (unread.length === 0) return;
        Alert.alert('Mark all read', `Mark ${unread.length} notification(s) as read?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Mark all',
                onPress: async () => {
                    try {
                        const res = await api.markAllNotificationsRead();
                        const body = res.data as ApiEnvelope;
                        if (res.status === 200 && body.success) {
                            markAllReadLocal();
                            setUnreadCount(0);
                            await syncBadgeCount(0);
                        } else {
                            Alert.alert('Failed', body.message || body.error || 'Could not update');
                        }
                    } catch {
                        Alert.alert('Error', 'Network error');
                    }
                },
            },
        ]);
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pb-4 pt-2">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-3 h-12 w-12 items-center justify-center rounded-2xl border-2 border-neutral-100 bg-white"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="min-w-0 flex-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">In-app</Text>
                        <Text className="text-xl font-black text-neutral-900">Notifications</Text>
                    </View>
                    <TouchableOpacity
                        onPress={onMarkAll}
                        disabled={items.every((x) => x.isRead)}
                        className="rounded-2xl border-2 border-emerald-100 bg-emerald-50 px-3 py-2"
                        style={{ opacity: items.every((x) => x.isRead) ? 0.4 : 1 }}
                    >
                        <Text className="text-[10px] font-black uppercase tracking-tight text-emerald-800">Read all</Text>
                    </TouchableOpacity>
                </View>

                {loading && items.length === 0 ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#10B981" />
                    </View>
                ) : (
                    <FlatList
                        className="flex-1 px-6"
                        data={items}
                        keyExtractor={(it) => it._id}
                        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#10B981" />}
                        ListEmptyComponent={
                            <View className="items-center py-16">
                                <Text className="text-center text-sm font-bold text-neutral-500">No notifications yet.</Text>
                                <Text className="mt-2 px-6 text-center text-xs text-neutral-400">
                                    Leave, OD, loan, and OT updates appear here — same as the web HRMS inbox.
                                </Text>
                            </View>
                        }
                        renderItem={({ item: n }) => (
                            <TouchableOpacity
                                onPress={() => void onPressItem(n)}
                                activeOpacity={0.85}
                                className={`mb-3 rounded-2xl border-2 p-4 ${
                                    n.isRead ? 'border-neutral-100 bg-white' : 'border-emerald-100 bg-emerald-50/40'
                                }`}
                            >
                                <View className="mb-2 flex-row flex-wrap items-center justify-between gap-2">
                                    <Text className="min-w-0 flex-1 text-sm font-black text-neutral-900" numberOfLines={2}>
                                        {n.title}
                                    </Text>
                                    {!n.isRead ? (
                                        <View className="rounded-full bg-emerald-500 px-2 py-0.5">
                                            <Text className="text-[9px] font-black uppercase text-white">New</Text>
                                        </View>
                                    ) : null}
                                </View>
                                <Text className="text-xs font-medium leading-5 text-neutral-600">{n.message}</Text>
                                <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2">
                                    <Text className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{n.module}</Text>
                                    <Text className="text-[10px] text-neutral-400">{formatNotificationTime(n.createdAt)}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={{ paddingBottom: 32 }}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}
