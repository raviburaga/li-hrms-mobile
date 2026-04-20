import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants/Config';
import { useAuthStore } from '../store/useAuthStore';

type TrailPoint = {
    latitude: number;
    longitude: number;
    capturedAt?: string;
    address?: string;
    accuracy?: number;
    heading?: number;
    speed?: number;
    source?: 'web' | 'mobile' | 'unknown';
};

let socket: Socket | null = null;

const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

function getSocket(): Socket | null {
    const token = useAuthStore.getState().token;
    if (!token) return null;
    if (!socket) {
        socket = io(SOCKET_BASE_URL, {
            transports: ['websocket', 'polling'],
            auth: { token: `Bearer ${token}` },
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 1000,
        });
        socket.on('connect', () => {
            console.log('[OD Trail] Socket connected');
        });
        socket.on('disconnect', (reason) => {
            console.log('[OD Trail] Socket disconnected:', reason);
        });
        socket.on('connect_error', (error) => {
            console.error('[OD Trail] Socket connection error:', error.message);
        });
        return socket;
    }
    if (!socket.connected) {
        socket.auth = { token: `Bearer ${token}` };
        socket.connect();
    }
    return socket;
}

export async function publishOdTrailPointsSocket(odId: string, points: TrailPoint[]): Promise<boolean> {
    if (!odId || !Array.isArray(points) || points.length === 0) return false;
    const s = getSocket();
    if (!s) return false;
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[OD Trail] Socket publish timeout, falling back to HTTP');
            resolve(false);
        }, 10000); // 10 second timeout

        s.emit('od_trail:publish', { odId, points, client: 'mobile' }, (ack?: { success?: boolean }) => {
            clearTimeout(timeout);
            resolve(Boolean(ack?.success));
        });
    });
}

