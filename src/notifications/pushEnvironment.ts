import Constants, { ExecutionEnvironment } from 'expo-constants';

/** True when running inside the Expo Go store client (no remote push on SDK 53+). */
export function isExpoGo(): boolean {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function isNativePushAvailable(): boolean {
    return !isExpoGo();
}

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
let notificationsLoadPromise: Promise<NotificationsModule | null> | null = null;
let handlerConfigured = false;

export async function loadNotificationsModule(): Promise<NotificationsModule | null> {
    if (!isNativePushAvailable()) return null;
    if (notificationsModule) return notificationsModule;
    if (!notificationsLoadPromise) {
        notificationsLoadPromise = import('expo-notifications')
            .then((mod) => {
                notificationsModule = mod;
                if (!handlerConfigured) {
                    mod.setNotificationHandler({
                        handleNotification: async (notification) => {
                            const data = notification.request.content.data as { type?: string } | undefined;
                            const isOdTracking = data?.type === 'od_tracking';
                            return {
                                shouldShowAlert: !isOdTracking,
                                shouldShowBanner: !isOdTracking,
                                shouldShowList: true,
                                shouldPlaySound: !isOdTracking,
                                shouldSetBadge: !isOdTracking,
                            };
                        },
                    });
                    handlerConfigured = true;
                }
                return mod;
            })
            .catch((err) => {
                if (__DEV__) {
                    console.warn('[Push] expo-notifications unavailable:', err);
                }
                return null;
            });
    }
    return notificationsLoadPromise;
}
