import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { api } from '../api/client';
import { publishOdTrailPointsSocket } from './odTrailSocket';

type QueuedPoint = {
    pointId: string;
    odId: string;
    latitude: number;
    longitude: number;
    capturedAt: string;
    accuracy?: number;
    heading?: number;
    speed?: number;
    source?: 'web' | 'mobile' | 'unknown';
};

type QueueRow = QueuedPoint & { retryCount: number; nextRetryAt: string | null };

type QueuedOutSubmission = {
    outSubmissionId: string;
    odId: string;
    localPhotoPath?: string | null; // copied into app storage
    originalPhotoUri?: string | null;
    photoMime?: string | null;
    photoName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    capturedAt?: string | null;
    notes?: string | null;
    owner?: string | null;
};

type OutQueueRow = QueuedOutSubmission & { retryCount: number; nextRetryAt: string | null };

const DB_NAME = 'od-trail.sqlite';
const ACTIVE_OD_KEY = '@lihrms/od_trail_active_od_id';
const MAX_BATCH = 40;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let syncInFlight: Promise<{ success: boolean; remaining: number }> | null = null;

function makePointId(odId: string, point: Omit<QueuedPoint, 'pointId' | 'odId'>): string {
    const seed = `${odId}:${point.capturedAt}:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `mobile-${(hash >>> 0).toString(16)}`;
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!databasePromise) {
        databasePromise = SQLite.openDatabaseAsync(DB_NAME).then(async (database) => {
            await database.execAsync(`
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS od_trail_queue (
                    point_id TEXT PRIMARY KEY NOT NULL,
                    od_id TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    captured_at TEXT NOT NULL,
                    accuracy REAL,
                    heading REAL,
                    speed REAL,
                    source TEXT,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_od_trail_queue_ready
                    ON od_trail_queue (od_id, next_retry_at, captured_at);
                CREATE TABLE IF NOT EXISTS od_out_queue (
                    out_submission_id TEXT PRIMARY KEY NOT NULL,
                    od_id TEXT NOT NULL,
                    local_photo_path TEXT,
                    original_photo_uri TEXT,
                    photo_mime TEXT,
                    photo_name TEXT,
                    latitude REAL,
                    longitude REAL,
                    captured_at TEXT,
                    notes TEXT,
                    owner TEXT,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_od_out_queue_ready
                    ON od_out_queue (od_id, next_retry_at, captured_at);
            `);
            return database;
        });
    }
    return databasePromise;
}

export async function enqueueOdTrailPoints(
    odId: string,
    points: Array<Omit<QueuedPoint, 'pointId' | 'odId'>>
): Promise<void> {
    if (!odId || points.length === 0) return;
    await setActiveOdTrailId(odId);
    const database = await getDatabase();
    for (const point of points) {
        const pointId = makePointId(odId, point);
        await database.runAsync(
            `INSERT OR IGNORE INTO od_trail_queue
                (point_id, od_id, latitude, longitude, captured_at, accuracy, heading, speed, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            pointId,
            odId,
            point.latitude,
            point.longitude,
            point.capturedAt,
            point.accuracy ?? null,
            point.heading ?? null,
            point.speed ?? null,
            point.source ?? 'mobile'
        );
    }
}

async function pendingRows(): Promise<QueueRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<QueueRow>(
        `SELECT point_id AS pointId, od_id AS odId, latitude, longitude,
                captured_at AS capturedAt, accuracy, heading, speed, source,
                retry_count AS retryCount, next_retry_at AS nextRetryAt
         FROM od_trail_queue
         WHERE next_retry_at IS NULL OR next_retry_at <= ?
         ORDER BY captured_at ASC
         LIMIT 400`,
        new Date().toISOString()
    );
}

async function markRetry(rows: QueueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const database = await getDatabase();
    const retryAt = new Date(Date.now() + Math.min(15 * 60_000, 2 ** Math.min(rows[0].retryCount, 6) * 1000)).toISOString();
    for (const row of rows) {
        await database.runAsync(
            'UPDATE od_trail_queue SET retry_count = retry_count + 1, next_retry_at = ? WHERE point_id = ?',
            retryAt,
            row.pointId
        );
    }
}

async function removeRows(rows: QueueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const database = await getDatabase();
    for (const row of rows) {
        await database.runAsync('DELETE FROM od_trail_queue WHERE point_id = ?', row.pointId);
    }
}

export async function getPendingOdTrailCount(odId?: string): Promise<number> {
    const database = await getDatabase();
    if (odId) {
        const result = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM od_trail_queue WHERE od_id = ?',
            odId
        );
        return Number(result?.count || 0);
    }
    const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM od_trail_queue');
    return Number(result?.count || 0);
}

async function syncQueue(): Promise<{ success: boolean; remaining: number }> {
    const rows = await pendingRows();
    if (rows.length === 0) return { success: true, remaining: 0 };

    const grouped = new Map<string, QueueRow[]>();
    for (const row of rows) {
        const group = grouped.get(row.odId) || [];
        group.push(row);
        grouped.set(row.odId, group);
    }

    let hadFailure = false;
    for (const [odId, odRows] of grouped) {
        for (let offset = 0; offset < odRows.length; offset += MAX_BATCH) {
            const batch = odRows.slice(offset, offset + MAX_BATCH);
            const points = batch.map(({ pointId, latitude, longitude, capturedAt, accuracy, heading, speed, source }) => ({
                pointId,
                latitude,
                longitude,
                capturedAt,
                accuracy,
                heading,
                speed,
                source: source === 'web' || source === 'mobile' ? source : undefined,
            }));
            try {
                const socketAccepted = await publishOdTrailPointsSocket(odId, points);
                if (!socketAccepted) {
                    const response = await api.appendODLocationTrail(odId, { points, client: 'mobile' });
                    const body = response.data as { success?: boolean };
                    if (!body.success) throw new Error('Trail upload rejected');
                }
                await removeRows(batch);
            } catch {
                hadFailure = true;
                await markRetry(batch);
            }
        }
    }

    const remaining = await getPendingOdTrailCount();
    return { success: !hadFailure && remaining === 0, remaining };
}

export function syncPendingOdTrailPoints(): Promise<{ success: boolean; remaining: number }> {
    if (!syncInFlight) {
        syncInFlight = syncQueue().catch(async () => ({
            success: false,
            remaining: await getPendingOdTrailCount().catch(() => 0),
        }));
        void syncInFlight.finally(() => {
            syncInFlight = null;
        });
    }
    return syncInFlight;
}

export async function clearOdTrailQueue(odId: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM od_trail_queue WHERE od_id = ?', odId);
}

function makeOutSubmissionId(odId: string, capturedAt?: string, lat?: number | null, lng?: number | null) {
    const seed = `${odId}:${capturedAt || ''}:${lat ?? ''}:${lng ?? ''}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `mobile-out-${(hash >>> 0).toString(16)}`;
}

export async function enqueueOdOutSubmission(odId: string, submission: {
    outSubmissionId?: string;
    photoUri?: string | null;
    photoMime?: string | null;
    photoName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    capturedAt?: string | null;
    notes?: string | null;
    owner?: string | null;
}): Promise<string> {
    if (!odId) throw new Error('odId required');
    const database = await getDatabase();
    const outId = submission.outSubmissionId || makeOutSubmissionId(odId, submission.capturedAt, submission.latitude ?? null, submission.longitude ?? null);

    let localPath: string | null = null;
    if (submission.photoUri) {
        try {
            const ext = submission.photoName && submission.photoName.includes('.') ? submission.photoName.split('.').pop() : 'jpg';
            const dest = `${FileSystem.documentDirectory}od_out_${outId}.${ext}`;
            // copy to app storage so it survives cache cleanup
            await FileSystem.copyAsync({ from: submission.photoUri, to: dest });
            localPath = dest;
        } catch (err) {
            // fallback: keep original uri
            localPath = null;
        }
    }

    await database.runAsync(
        `INSERT OR IGNORE INTO od_out_queue
            (out_submission_id, od_id, local_photo_path, original_photo_uri, photo_mime, photo_name, latitude, longitude, captured_at, notes, owner)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        outId,
        odId,
        localPath,
        submission.photoUri || null,
        submission.photoMime || null,
        submission.photoName || null,
        submission.latitude ?? null,
        submission.longitude ?? null,
        submission.capturedAt || new Date().toISOString(),
        submission.notes || null,
        submission.owner || null
    );

    // Ensure this od is active
    await setActiveOdTrailId(odId);
    return outId;
}

async function pendingOutRows(): Promise<OutQueueRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<OutQueueRow>(
        `SELECT out_submission_id AS outSubmissionId, od_id AS odId, local_photo_path AS localPhotoPath, original_photo_uri AS originalPhotoUri, photo_mime AS photoMime, photo_name AS photoName, latitude, longitude, captured_at AS capturedAt, notes, owner, retry_count AS retryCount, next_retry_at AS nextRetryAt
         FROM od_out_queue
         WHERE next_retry_at IS NULL OR next_retry_at <= ?
         ORDER BY captured_at ASC
         LIMIT 200`,
        new Date().toISOString()
    );
}

async function markOutRetry(rows: OutQueueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const database = await getDatabase();
    const retryAt = new Date(Date.now() + Math.min(15 * 60_000, 2 ** Math.min(rows[0].retryCount, 6) * 1000)).toISOString();
    for (const row of rows) {
        await database.runAsync('UPDATE od_out_queue SET retry_count = retry_count + 1, next_retry_at = ? WHERE out_submission_id = ?', retryAt, row.outSubmissionId);
    }
}

async function removeOutRows(rows: OutQueueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const database = await getDatabase();
    for (const row of rows) {
        await database.runAsync('DELETE FROM od_out_queue WHERE out_submission_id = ?', row.outSubmissionId);
        // Attempt to delete local file if present
        if (row.localPhotoPath) {
            try {
                await FileSystem.deleteAsync(row.localPhotoPath, { idempotent: true });
            } catch {
                // ignore
            }
        }
    }
}

export async function getPendingOdOutCount(odId?: string): Promise<number> {
    const database = await getDatabase();
    if (odId) {
        const result = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM od_out_queue WHERE od_id = ?',
            odId
        );
        return Number(result?.count || 0);
    }
    const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM od_out_queue');
    return Number(result?.count || 0);
}

async function syncOutQueue(): Promise<{ success: boolean; remaining: number }> {
    const rows = await pendingOutRows();
    if (rows.length === 0) return { success: true, remaining: 0 };

    let hadFailure = false;
    for (const row of rows) {
        try {
            let uploadUrl: string | undefined;
            // Try upload photo if present
            const uriToUpload = row.localPhotoPath || row.originalPhotoUri;
            if (uriToUpload) {
                const uploadRes = await api.uploadEvidence({ uri: uriToUpload, mimeType: row.photoMime || undefined, fileName: row.photoName || undefined });
                const envelope = uploadRes.data as any;
                uploadUrl = envelope?.url || envelope?.data?.url || envelope?.data?.key || envelope?.key || undefined;
            }

            const endEvidence: any = {};
            if (uploadUrl) {
                endEvidence.photoEvidence = { url: uploadUrl };
            }
            if (row.latitude != null && row.longitude != null) {
                endEvidence.geoLocation = { latitude: row.latitude, longitude: row.longitude, capturedAt: row.capturedAt ? new Date(row.capturedAt) : new Date() };
            }
            if (Object.keys(endEvidence).length === 0) {
                // Nothing to send, just remove
                await removeOutRows([row]);
                continue;
            }

            const resp = await api.updateOD(row.odId, { endEvidence, outSubmissionId: row.outSubmissionId });
            const success = resp?.data?.success === true;
            if (success) {
                await removeOutRows([row]);
            } else {
                hadFailure = true;
                await markOutRetry([row]);
            }
        } catch (err) {
            hadFailure = true;
            await markOutRetry([row]);
        }
    }

    const remaining = await getPendingOdOutCount();
    return { success: !hadFailure && remaining === 0, remaining };
}

export function syncPendingOdOutSubmissions(): Promise<{ success: boolean; remaining: number }> {
    // Reuse same in-flight pattern if needed
    return syncOutQueue().catch(async () => ({ success: false, remaining: await getPendingOdOutCount().catch(() => 0) }));
}

export async function setActiveOdTrailId(odId: string): Promise<void> {
    await AsyncStorage.setItem(ACTIVE_OD_KEY, odId);
}

export async function clearActiveOdTrailId(): Promise<void> {
    await AsyncStorage.removeItem(ACTIVE_OD_KEY);
}

export async function getActiveOdTrailIdFromQueue(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_OD_KEY);
}
