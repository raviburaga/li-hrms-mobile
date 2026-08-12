import { getAppSocket } from '../lib/appSocket';

type TrailPoint = {
    pointId?: string;
    latitude: number;
    longitude: number;
    capturedAt?: string;
    address?: string;
    accuracy?: number;
    heading?: number;
    speed?: number;
    source?: 'web' | 'mobile' | 'unknown';
};

export async function publishOdTrailPointsSocket(odId: string, points: TrailPoint[]): Promise<boolean> {
    if (!odId || !Array.isArray(points) || points.length === 0) return false;
    const s = getAppSocket();
    if (!s) return false;
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[OD Trail] Socket publish timeout, falling back to HTTP');
            resolve(false);
        }, 10000);

        s.emit('od_trail:publish', { odId, points, client: 'mobile' }, (ack?: { success?: boolean }) => {
            clearTimeout(timeout);
            resolve(Boolean(ack?.success));
        });
    });
}
