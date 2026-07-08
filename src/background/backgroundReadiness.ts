import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { isExpoGoAndroid } from '../notifications/pushRegistration';

export type ReadinessStepId = 'notifications' | 'foreground_location' | 'background_location' | 'battery';

export type ReadinessStep = {
    id: ReadinessStepId;
    title: string;
    description: string;
    ready: boolean;
    required: boolean;
    androidOnly?: boolean;
};

function androidPackageName(): string {
    return Constants.expoConfig?.android?.package || 'com.lihrms.mobile';
}

async function getNotificationsModule() {
    if (isExpoGoAndroid()) return null;
    try {
        return await import('expo-notifications');
    } catch {
        return null;
    }
}

async function notificationsReady(): Promise<boolean> {
    if (!Device.isDevice) return false;
    if (isExpoGoAndroid()) return false;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;
    const current = await Notifications.getPermissionsAsync();
    return current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function foregroundLocationReady(): Promise<boolean> {
    const current = await Location.getForegroundPermissionsAsync();
    return current.status === 'granted';
}

async function backgroundLocationReady(): Promise<boolean> {
    const current = await Location.getBackgroundPermissionsAsync();
    return current.status === 'granted';
}

export async function getBackgroundReadinessSteps(): Promise<ReadinessStep[]> {
    const [notif, fgLoc, bgLoc] = await Promise.all([
        notificationsReady(),
        foregroundLocationReady(),
        backgroundLocationReady(),
    ]);

    const steps: ReadinessStep[] = [
        {
            id: 'notifications',
            title: 'Push notifications',
            description: 'Receive HRMS alerts when the app is closed or not in recent apps.',
            ready: notif,
            required: true,
        },
        {
            id: 'foreground_location',
            title: 'Location while using app',
            description: 'Required to capture OD IN / OD OUT GPS evidence.',
            ready: fgLoc,
            required: true,
        },
        {
            id: 'background_location',
            title: Platform.OS === 'ios' ? 'Location: Always' : 'Location: Allow all the time',
            description:
                'Records your on-duty route when the screen is off, you switch apps, or HRMS is swiped from recents.',
            ready: bgLoc,
            required: true,
        },
    ];

    if (Platform.OS === 'android') {
        steps.push({
            id: 'battery',
            title: 'Unrestricted battery',
            description:
                'On Samsung, Xiaomi, Oppo, Vivo, etc., disable battery restrictions so OD tracking and alerts are not killed.',
            ready: false,
            required: false,
            androidOnly: true,
        });
    }

    return steps;
}

export function criticalReadinessMet(steps: ReadinessStep[]): boolean {
    return steps.filter((s) => s.required).every((s) => s.ready);
}

export async function runReadinessAction(stepId: ReadinessStepId): Promise<void> {
    switch (stepId) {
        case 'notifications': {
            const Notifications = await getNotificationsModule();
            if (!Notifications) return;
            await Notifications.requestPermissionsAsync({
                ios: { allowAlert: true, allowBadge: true, allowSound: true },
            });
            return;
        }
        case 'foreground_location': {
            await Location.requestForegroundPermissionsAsync();
            return;
        }
        case 'background_location': {
            const fg = await Location.requestForegroundPermissionsAsync();
            if (fg.status !== 'granted') return;
            await Location.requestBackgroundPermissionsAsync();
            if (Platform.OS === 'ios') {
                await Linking.openSettings();
            }
            return;
        }
        case 'battery': {
            if (Platform.OS !== 'android') return;
            try {
                const IntentLauncher = await import('expo-intent-launcher');
                await IntentLauncher.startActivityAsync(
                    IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    { data: `package:${androidPackageName()}` }
                );
            } catch {
                try {
                    const IntentLauncher = await import('expo-intent-launcher');
                    await IntentLauncher.startActivityAsync(
                        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
                        { data: `package:${androidPackageName()}` }
                    );
                } catch {
                    await Linking.openSettings();
                }
            }
            return;
        }
        default:
            return;
    }
}

export async function openAppSystemSettings(): Promise<void> {
    await Linking.openSettings();
}
