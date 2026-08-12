import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from '../api/client';
import { markOdTrackingActive, markOdTrackingInactive } from '../notifications/pushRegistration';
import { canRecordOdLocationTrail, type OdTrailUser } from './odTrailEligibility';
import {
    clearActiveOdTrailId,
    clearOdTrailQueue,
    enqueueOdTrailPoints,
    getActiveOdTrailIdFromQueue,
    getPendingOdTrailCount,
    setActiveOdTrailId,
    syncPendingOdTrailPoints,
} from './odTrailQueue';

export const OD_LOCATION_TRAIL_TASK = 'OD_LOCATION_TRAIL_TASK';

export async function getActiveOdTrailId(): Promise<string | null> {
    return getActiveOdTrailIdFromQueue();
}

let lastLat: number | null = null;
let lastLng: number | null = null;
let lastSend = 0;
function resetTrailThrottle() {
    lastLat = null;
    lastLng = null;
    lastSend = 0;
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

/** Upload any buffered points (call before stopping task or switching OD). */
export async function flushPendingOdTrailPoints(): Promise<void> {
    await syncPendingOdTrailPoints();
}

async function getActiveOdId(): Promise<string | null> {
    return getActiveOdTrailIdFromQueue();
}

function shouldStoreLocationSample(lat: number, lng: number) {
    const now = Date.now();
    let push = lastLat == null;
    const previousLat = lastLat;
    const previousLng = lastLng;
    if (!push && previousLat != null && previousLng != null) {
        const dist = haversineM(previousLat, previousLng, lat, lng);
        if (dist >= 35 || now - lastSend >= 50000) push = true;
    }
    if (!push) return false;
    lastLat = lat;
    lastLng = lng;
    lastSend = now;
    return true;
}

TaskManager.defineTask(OD_LOCATION_TRAIL_TASK, async ({ data, error }) => {
    if (error) return;
    if (!data || typeof data !== 'object') return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    if (!locations?.length) return;

    const odId = await getActiveOdId();
    if (!odId) return;

    const points = [];
    for (const loc of locations) {
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!shouldStoreLocationSample(lat, lng)) continue;
        points.push({
            latitude: lat,
            longitude: lng,
            capturedAt: new Date().toISOString(),
            accuracy: loc.coords.accuracy ?? undefined,
            source: 'mobile' as const,
        });
    }
    await enqueueOdTrailPoints(odId, points);
    await syncPendingOdTrailPoints();
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

    await setActiveOdTrailId(odId);

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
        await markOdTrackingActive(odId);
    } catch {
        return false;
    }
    return true;
}

export async function stopOdLocationTrailBackground(): Promise<void> {
    await markOdTrackingInactive();
    const odId = await getActiveOdId();
    if (odId) {
        await flushPendingOdTrailPoints();
        if ((await getPendingOdTrailCount(odId)) === 0) {
            await clearOdTrailQueue(odId);
            await clearActiveOdTrailId();
        }
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

/**
 * After the OS kills the app (e.g. swiped from recents), restart background location if an active OD trail
 * is still persisted. Push notifications do not need this — they are delivered by FCM/APNs independently.
 */
export async function ensureOdLocationTrailResumed(user: OdTrailUser): Promise<boolean> {
    const odId = await getActiveOdTrailId();
    if (!odId || !user) return false;

    try {
        if (await Location.hasStartedLocationUpdatesAsync(OD_LOCATION_TRAIL_TASK)) {
            await markOdTrackingActive(odId);
            return true;
        }
    } catch {
        /* fall through to restart */
    }

    try {
        const res = await api.getOD(odId);
        const body = res.data as { success?: boolean; data?: Record<string, unknown> };
        const od = body.success ? body.data : null;
        if (!od || !canRecordOdLocationTrail(od, user)) {
            await stopOdLocationTrailBackground();
            return false;
        }
    } catch {
        /* offline — still attempt restart from persisted od id */
    }

    const restarted = await startOdLocationTrailBackground(odId);
    return restarted;
}
