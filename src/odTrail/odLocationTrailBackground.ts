import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { publishOdTrailPointsSocket } from './odTrailSocket';

export const OD_LOCATION_TRAIL_TASK = 'OD_LOCATION_TRAIL_TASK';

const OD_TRAIL_OD_ID_KEY = '@lihrms/od_trail_active_od_id';

let lastLat: number | null = null;
let lastLng: number | null = null;
let lastSend = 0;
const buffer: Array<{ latitude: number; longitude: number; capturedAt: string; accuracy?: number }> = [];
let lastUploadAt = 0;

function resetTrailThrottle() {
    lastLat = null;
    lastLng = null;
    lastSend = 0;
    buffer.length = 0;
    lastUploadAt = 0;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function getTokenForTrail(): Promise<string | null> {
    const fromStore = useAuthStore.getState().token;
    if (fromStore) return fromStore;
    try {
        const raw = await AsyncStorage.getItem('auth-storage');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
        return parsed?.state?.token ?? null;
    } catch {
        return null;
    }
}

async function postTrailChunk(odId: string, chunk: typeof buffer) {
    if (chunk.length === 0) return;
    const token = await getTokenForTrail();
    if (!token) return;
    try {
        const pushedBySocket = await publishOdTrailPointsSocket(odId, chunk);
        if (!pushedBySocket) {
            await api.appendODLocationTrail(odId, { points: chunk, client: 'mobile' });
        }
        lastUploadAt = Date.now();
    } catch {
        /* network / 403 — drop chunk to avoid unbounded growth */
    }
}

/** Upload any buffered points (call before stopping task or switching OD). */
export async function flushPendingOdTrailPoints(): Promise<void> {
    const odId = await getActiveOdId();
    if (!odId || buffer.length === 0) return;
    const chunk = buffer.splice(0, buffer.length);
    await postTrailChunk(odId, chunk);
}

async function getActiveOdId(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(OD_TRAIL_OD_ID_KEY);
    } catch {
        return null;
    }
}

function pushLocationSample(lat: number, lng: number, accuracy?: number | null) {
    const now = Date.now();
    let push = lastLat == null;
    if (!push && lastLng != null) {
        const dist = haversineM(lastLat, lastLng, lat, lng);
        if (dist >= 35 || now - lastSend >= 50000) push = true;
    }
    if (!push) return;
    lastLat = lat;
    lastLng = lng;
    lastSend = now;
    buffer.push({
        latitude: lat,
        longitude: lng,
        capturedAt: new Date().toISOString(),
        accuracy: accuracy ?? undefined,
    });
}

TaskManager.defineTask(OD_LOCATION_TRAIL_TASK, async ({ data, error }) => {
    if (error) return;
    if (!data || typeof data !== 'object') return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    if (!locations?.length) return;

    const odId = await getActiveOdId();
    if (!odId) return;

    for (const loc of locations) {
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        pushLocationSample(lat, lng, loc.coords.accuracy);
    }

    // Live-ish uploads: flush smaller batches and also time-based.
    // Note: background tasks run only when OS delivers locations; this makes uploads more frequent when we do wake.
    const now = Date.now();
    const TIME_FLUSH_MS = 25_000;
    const BATCH_FLUSH = 6;
    if (buffer.length >= BATCH_FLUSH || (buffer.length > 0 && now - lastUploadAt >= TIME_FLUSH_MS)) {
        const chunk = buffer.splice(0, buffer.length);
        await postTrailChunk(odId, chunk);
    }
});

/**
 * Persist active OD id and start OS background location updates (requires “Always” / background permission).
 * @returns whether background updates are running; if false, caller should use foreground watchPosition only.
 */
export async function startOdLocationTrailBackground(odId: string): Promise<boolean> {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    await stopOdLocationTrailBackground();

    await AsyncStorage.setItem(OD_TRAIL_OD_ID_KEY, odId);

    try {
        await Location.startLocationUpdatesAsync(OD_LOCATION_TRAIL_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 35,
            timeInterval: 45000,
            activityType: Location.ActivityType.OtherNavigation,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
            foregroundService: {
                notificationTitle: 'On-duty route',
                notificationBody: 'Recording your location for this on-duty request until OD OUT is submitted.',
                notificationColor: '#059669',
            },
        });
    } catch {
        await AsyncStorage.removeItem(OD_TRAIL_OD_ID_KEY);
        return false;
    }
    return true;
}

export async function stopOdLocationTrailBackground(): Promise<void> {
    await flushPendingOdTrailPoints();
    try {
        await AsyncStorage.removeItem(OD_TRAIL_OD_ID_KEY);
    } catch {
        /* ignore */
    }
    resetTrailThrottle();
    try {
        if (await Location.hasStartedLocationUpdatesAsync(OD_LOCATION_TRAIL_TASK)) {
            await Location.stopLocationUpdatesAsync(OD_LOCATION_TRAIL_TASK);
        }
    } catch {
        /* ignore */
    }
}
