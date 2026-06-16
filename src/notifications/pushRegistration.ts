import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '../api/client';

let lastRegisteredToken: string | null = null;
let notificationHandlerConfigured = false;

export function isExpoGoAndroid(): boolean {
    return Platform.OS === 'android' && Constants.appOwnership === 'expo';
}

async function getNotifications() {
    if (isExpoGoAndroid()) return null;
    try {
        return await import('expo-notifications');
    } catch (error) {
        if (__DEV__) console.warn('[Push] expo-notifications unavailable in this runtime', error);
        return null;
    }
}

async function configureNotificationHandler(): Promise<void> {
    if (notificationHandlerConfigured) return;
    const Notifications = await getNotifications();
    if (!Notifications) return;
    Notifications.setNotificationHandler({
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
    notificationHandlerConfigured = true;
}

export async function ensureNotificationChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await configureNotificationHandler();
    await Notifications.setNotificationChannelAsync('hrms-default', {
        name: 'HRMS alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
    });
    await Notifications.setNotificationChannelAsync('od-tracking-silent', {
        name: 'On-duty route tracking',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        vibrationPattern: null,
        bypassDnd: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
}

export async function requestNotificationPermissions(): Promise<boolean> {
    if (isExpoGoAndroid()) return false;
    if (!Device.isDevice) return false;
    await ensureNotificationChannels();
    const Notifications = await getNotifications();
    if (!Notifications) return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerExpoPushToken(): Promise<string | null> {
    if (isExpoGoAndroid()) {
        if (__DEV__) console.warn('[Push] Expo Go on Android does not support remote push notifications. Use a development build to test push.');
        return null;
    }
    if (!Device.isDevice) return null;
    const granted = await requestNotificationPermissions();
    if (!granted) return null;
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) {
        if (__DEV__) console.warn('[Push] Missing EAS projectId — cannot register Expo push token');
        return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;
    if (!token || token === lastRegisteredToken) return token;

    const res = await api.subscribeExpoPush({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
        deviceName: Device.modelName || Device.deviceName || undefined,
    });
    const body = res.data as { success?: boolean };
    if (res.status === 200 && body.success) {
        lastRegisteredToken = token;
    }
    return token;
}

export async function unregisterExpoPushToken(): Promise<void> {
    if (!lastRegisteredToken) return;
    try {
        await api.unsubscribeExpoPush({ token: lastRegisteredToken });
    } catch {
        /* ignore */
    }
    lastRegisteredToken = null;
}

export const OD_TRACKING_NOTIFICATION_ID = 'hrms-od-location-trail';

export async function presentOdTrackingNotification(odLabel?: string): Promise<void> {
    if (isExpoGoAndroid()) return;
    await ensureNotificationChannels();
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
        identifier: OD_TRACKING_NOTIFICATION_ID,
        content: {
            title: 'On-duty route tracking',
            body: odLabel
                ? `Recording location for ${odLabel} until you submit OD OUT.`
                : 'Recording your location until you submit OD OUT.',
            sticky: true,
            autoDismiss: false,
            sound: null,
            priority: Notifications.AndroidNotificationPriority.LOW,
            ...(Platform.OS === 'android' ? { channelId: 'od-tracking-silent' } : {}),
            data: { type: 'od_tracking' },
        },
        trigger: null,
    });
}

export async function dismissOdTrackingNotification(): Promise<void> {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    try {
        await Notifications.dismissNotificationAsync(OD_TRACKING_NOTIFICATION_ID);
    } catch {
        /* ignore */
    }
    try {
        await Notifications.cancelScheduledNotificationAsync(OD_TRACKING_NOTIFICATION_ID);
    } catch {
        /* ignore */
    }
}

export async function markOdTrackingActive(odId?: string): Promise<void> {
    await presentOdTrackingNotification(odId ? `OD ${odId.slice(-6)}` : undefined);
}

export async function markOdTrackingInactive(): Promise<void> {
    await dismissOdTrackingNotification();
}

export async function presentLocalAppNotification(input: {
    title: string;
    message: string;
    data?: Record<string, unknown>;
}): Promise<void> {
    if (isExpoGoAndroid()) return;
    await ensureNotificationChannels();
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await Notifications.scheduleNotificationAsync({
        content: {
            title: input.title,
            body: input.message,
            data: input.data,
            ...(Platform.OS === 'android' ? { channelId: 'hrms-default' } : {}),
        },
        trigger: null,
    });
}

export async function syncBadgeCount(count: number): Promise<void> {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    try {
        await Notifications.setBadgeCountAsync(Math.max(0, count));
    } catch {
        /* ignore */
    }
}
