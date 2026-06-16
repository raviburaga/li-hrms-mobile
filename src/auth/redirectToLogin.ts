import { router } from 'expo-router';

/** Reset to in-tab sign-in after 401 / session expired (same route as manual sign-out). */
export async function redirectToLogin(): Promise<void> {
    try {
        router.replace('/(tabs)/login');
    } catch (e) {
        if (__DEV__) console.warn('[redirectToLogin] replace /(tabs)/login', e);
    }
}
