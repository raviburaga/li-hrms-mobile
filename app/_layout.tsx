import '../src/styles/global.css';
import { Stack, router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/store/useAuthStore';
import { useAuthPersistHydrated } from '../src/hooks/useAuthPersistHydrated';
import { NotificationProvider } from '../src/notifications/NotificationProvider';
import { useMobileSessionTracker } from '../src/hooks/useMobileSessionTracker';
import '../src/odTrail/odLocationTrailBackground';

function isPublicUnauthenticatedRoute(segments: readonly string[]): boolean {
    const first = segments[0];
    if (first == null || first === '') return true;
    if (first === 'login' || first === 'index') return true;
    if (first === '(tabs)' && segments[1] === 'login') return true;
    return false;
}

function navigateToSignIn(): void {
    try {
        router.replace('/login');
    } catch (e) {
        if (__DEV__) console.warn('[AuthStackGuard] replace /login', e);
    }
}

/** After logout or when session is missing, keep users off protected stack routes and open sign-in. */
function AuthStackGuard() {
    const hydrated = useAuthPersistHydrated();
    const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const segments = useSegments();
    const segmentKey = segments.join('/');
    const unauthKickRef = useRef(false);

    useEffect(() => {
        if (isLoggingOut) unauthKickRef.current = false;
    }, [isLoggingOut]);

    useEffect(() => {
        if (!hydrated) return;
        if (isLoggingOut || isAuthenticated) {
            unauthKickRef.current = false;
            return;
        }
        if (isPublicUnauthenticatedRoute(segments)) {
            unauthKickRef.current = false;
            return;
        }
        if (unauthKickRef.current) return;
        unauthKickRef.current = true;
        const id = requestAnimationFrame(() => {
            navigateToSignIn();
        });
        return () => cancelAnimationFrame(id);
    }, [hydrated, isLoggingOut, isAuthenticated, segmentKey]);

    return null;
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
    useMobileSessionTracker();

    const [loaded] = useFonts({
        // Add custom fonts here if needed
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    if (!loaded) {
        return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
    }

    return (
        <SafeAreaProvider>
            <NotificationProvider>
                <AuthStackGuard />
                <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="apply-leave" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="apply-od" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="apply-loan" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="leave/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="od/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="loan/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="payslip/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="apply-ot" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="apply-permission" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="background-setup" options={{ animation: 'slide_from_right' }} />
                </Stack>
            </NotificationProvider>
        </SafeAreaProvider>
    );
}
