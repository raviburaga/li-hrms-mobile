import { apiClient, ApiEnvelope } from './client';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type StartSessionResponse = {
    sessionId: string;
};

export type EndSessionResponse = {
    durationSeconds: number;
};

export async function startMobileSession(): Promise<ApiEnvelope<StartSessionResponse>> {
    const deviceId = `${Platform.OS}-${Device.modelName || Device.designName || 'unknown'}`;
    const appVersion = Constants.expoConfig?.version || '1.0.0';

    try {
        const response = await apiClient.post<ApiEnvelope<StartSessionResponse>>(
            '/mobile-analytics/session/start',
            { deviceId, appVersion }
        );
        return response.data;
    } catch (error) {
        if (__DEV__) {
            console.warn('[Analytics] Failed to start session:', error);
        }
        return { success: false, error: String(error) };
    }
}

export async function endMobileSession(sessionId: string): Promise<ApiEnvelope<EndSessionResponse>> {
    try {
        const response = await apiClient.post<ApiEnvelope<EndSessionResponse>>(
            '/mobile-analytics/session/end',
            { sessionId }
        );
        return response.data;
    } catch (error) {
        if (__DEV__) {
            console.warn('[Analytics] Failed to end session:', error);
        }
        return { success: false, error: String(error) };
    }
}
