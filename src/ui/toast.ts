import { Alert, Platform, ToastAndroid } from 'react-native';

type ToastType = 'info' | 'success' | 'error';

/** Lightweight cross-platform toast helper without extra dependency. */
export function showAppToast(message: string, type: ToastType = 'info'): void {
    if (!message) return;

    if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.SHORT);
        return;
    }

    const title = type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info';
    Alert.alert(title, message);
}
