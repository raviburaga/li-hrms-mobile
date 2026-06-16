import { useEffect, useRef, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getAppSocket, disconnectAppSocket } from '../lib/appSocket';
import { useAuthStore } from '../store/useAuthStore';
import { useAuthPersistHydrated } from '../hooks/useAuthPersistHydrated';
import { useNotificationStore } from './notificationStore';
import type { InAppNotification } from '../api/client';
import {
    markOdTrackingInactive,
    markOdTrackingActive,
    registerExpoPushToken,
    syncBadgeCount,
    unregisterExpoPushToken,
    presentLocalAppNotification,
} from './pushRegistration';
import { openNotificationTarget } from './notificationNavigation';
import { isNativePushAvailable, loadNotificationsModule } from './pushEnvironment';
import { showAppToast } from '../ui/toast';
import { getActiveOdTrailId } from '../odTrail/odLocationTrailBackground';

function asInAppNotification(payload: unknown): InAppNotification | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    if (!p._id || !p.title || !p.message) return null;
    return {
        _id: String(p._id),
        title: String(p.title),
        message: String(p.message),
        module: String(p.module || 'system'),
        eventType: String(p.eventType || ''),
        createdAt: String(p.createdAt || new Date().toISOString()),
        isRead: Boolean(p.isRead),
        entityId: p.entityId ? String(p.entityId) : undefined,
        actionUrl: p.actionUrl ? String(p.actionUrl) : undefined,
    };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const hydrated = useAuthPersistHydrated();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
    const userId = useAuthStore((s) => s.user?.id);

    const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
    const prependNotification = useNotificationStore((s) => s.prependNotification);
    const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
    const reset = useNotificationStore((s) => s.reset);

    const appState = useRef<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            appState.current = next;
            if (next === 'active' && isAuthenticated) {
                void refreshUnreadCount();
            }
        });
        return () => sub.remove();
    }, [isAuthenticated, refreshUnreadCount]);

    useEffect(() => {
        if (!hydrated || !isAuthenticated || isLoggingOut || !userId) {
            disconnectAppSocket();
            void unregisterExpoPushToken();
            void markOdTrackingInactive();
            reset();
            void syncBadgeCount(0);
            return;
        }

        void (async () => {
            await refreshUnreadCount();
            await registerExpoPushToken();
            const activeOdId = await getActiveOdTrailId();
            if (activeOdId) {
                await markOdTrackingActive(activeOdId);
            }
        })();

        const socket = getAppSocket();
        if (!socket) return undefined;

        const onInApp = (payload: unknown) => {
            const item = asInAppNotification(payload);
            if (!item) return;
            prependNotification(item);

            const inForeground = appState.current === 'active';
            if (inForeground) {
                showAppToast(`${item.title}: ${item.message}`, 'info');
            } else {
                void presentLocalAppNotification({
                    title: item.title,
                    message: item.message,
                    data: {
                        notificationId: item._id,
                        module: item.module,
                        entityId: item.entityId,
                        actionUrl: item.actionUrl,
                    },
                });
            }
        };

        const onUnread = (payload: { unreadCount?: number }) => {
            const count = Number(payload?.unreadCount ?? 0);
            setUnreadCount(count);
            void syncBadgeCount(count);
        };

        const onToast = (payload: { type?: string; title?: string; message?: string }) => {
            const msg = payload?.message || payload?.title;
            if (!msg) return;
            if (appState.current === 'active') {
                const kind = payload.type === 'error' ? 'error' : payload.type === 'success' ? 'success' : 'info';
                showAppToast(msg, kind);
            }
        };

        socket.on('in_app_notification', onInApp);
        socket.on('notification_unread_count', onUnread);
        socket.on('toast_notification', onToast);

        return () => {
            socket.off('in_app_notification', onInApp);
            socket.off('notification_unread_count', onUnread);
            socket.off('toast_notification', onToast);
        };
    }, [hydrated, isAuthenticated, isLoggingOut, userId, prependNotification, refreshUnreadCount, reset, setUnreadCount]);

    useEffect(() => {
        if (!isNativePushAvailable()) return undefined;

        let cancelled = false;
        let sub: { remove: () => void } | undefined;

        const openFromResponse = (response: import('expo-notifications').NotificationResponse | null) => {
            if (!response) return;
            const data = response.notification.request.content.data as {
                type?: string;
                notificationId?: string;
                module?: string;
                entityId?: string;
                actionUrl?: string;
                url?: string;
            };
            if (data?.type === 'od_tracking') return;
            openNotificationTarget({
                _id: data.notificationId || 'push',
                title: response.notification.request.content.title || 'Notification',
                message: response.notification.request.content.body || '',
                module: data.module || 'system',
                eventType: '',
                createdAt: new Date().toISOString(),
                isRead: false,
                entityId: data.entityId,
                actionUrl: data.actionUrl || data.url,
            });
        };

        void (async () => {
            const Notifications = await loadNotificationsModule();
            if (!Notifications || cancelled) return;
            sub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
            const last = await Notifications.getLastNotificationResponseAsync();
            openFromResponse(last);
        })();

        return () => {
            cancelled = true;
            sub?.remove();
        };
    }, []);

    return children;
}
