import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants/Config';
import { useAuthStore } from '../store/useAuthStore';

const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;
let joinedUserId: string | null = null;

export function getAppSocket(): Socket | null {
    const token = useAuthStore.getState().token;
    const userId = useAuthStore.getState().user?.id;
    if (!token) return null;

    if (!socket) {
        socket = io(SOCKET_BASE_URL, {
            transports: ['websocket', 'polling'],
            auth: { token: `Bearer ${token}` },
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 30,
            reconnectionDelay: 1500,
        });

        socket.on('connect', () => {
            const uid = useAuthStore.getState().user?.id;
            if (uid && joinedUserId !== uid) {
                socket?.emit('join_user_room', uid);
                joinedUserId = uid;
            }
        });

        socket.on('disconnect', () => {
            joinedUserId = null;
        });
    }

    socket.auth = { token: `Bearer ${token}` };
    if (!socket.connected) {
        socket.connect();
    } else if (userId && joinedUserId !== userId) {
        socket.emit('join_user_room', userId);
        joinedUserId = userId;
    }

    return socket;
}

export function disconnectAppSocket(): void {
    joinedUserId = null;
    if (!socket) return;
    try {
        socket.removeAllListeners();
        socket.disconnect();
    } catch {
        /* ignore */
    }
    socket = null;
}
