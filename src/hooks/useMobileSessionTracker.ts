import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { startMobileSession, endMobileSession } from '../api/analytics';

export function useMobileSessionTracker() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const sessionIdRef = useRef<string | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    // Helper to start the session tracking
    const handleStartSession = async () => {
        if (sessionIdRef.current) return; // session already active

        try {
            const res = await startMobileSession();
            if (res.success && res.data?.sessionId) {
                sessionIdRef.current = res.data.sessionId;
                if (__DEV__) {
                    console.log('[useMobileSessionTracker] Started session:', res.data.sessionId);
                }
            }
        } catch (err) {
            if (__DEV__) {
                console.error('[useMobileSessionTracker] Failed starting session:', err);
            }
        }
    };

    // Helper to end the session tracking
    const handleEndSession = async () => {
        const currentSessionId = sessionIdRef.current;
        if (!currentSessionId) return;

        sessionIdRef.current = null; // Clear immediately to prevent double calls

        try {
            const res = await endMobileSession(currentSessionId);
            if (__DEV__ && res.success) {
                console.log('[useMobileSessionTracker] Ended session:', currentSessionId);
            }
        } catch (err) {
            if (__DEV__) {
                console.error('[useMobileSessionTracker] Failed ending session:', err);
            }
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            // Start session immediately when authenticated
            void handleStartSession();
        } else {
            // If they log out, immediately end the active session
            void handleEndSession();
        }
    }, [isAuthenticated]);

    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (!isAuthenticated) return;

            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // App came to the foreground!
                void handleStartSession();
            } else if (
                appStateRef.current === 'active' &&
                nextAppState.match(/inactive|background/)
            ) {
                // App went to the background/closed!
                void handleEndSession();
            }

            appStateRef.current = nextAppState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
            // End session on unmount
            if (isAuthenticated) {
                void handleEndSession();
            }
        };
    }, [isAuthenticated]);
}
