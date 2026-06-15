import { create } from 'zustand';
import { api, type InAppNotification } from '../api/client';

type NotificationStore = {
    unreadCount: number;
    items: InAppNotification[];
    loading: boolean;
    setUnreadCount: (count: number) => void;
    prependNotification: (item: InAppNotification) => void;
    markReadLocal: (id: string) => void;
    markAllReadLocal: () => void;
    refreshUnreadCount: () => Promise<void>;
    refreshList: () => Promise<void>;
    reset: () => void;
};

export const useNotificationStore = create<NotificationStore>((set, get) => ({
    unreadCount: 0,
    items: [],
    loading: false,
    setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
    prependNotification: (item) =>
        set((state) => ({
            items: [item, ...state.items.filter((x) => x._id !== item._id)].slice(0, 50),
        })),
    markReadLocal: (id) =>
        set((state) => ({
            items: state.items.map((x) => (x._id === id ? { ...x, isRead: true } : x)),
            unreadCount: Math.max(0, state.unreadCount - (state.items.find((x) => x._id === id && !x.isRead) ? 1 : 0)),
        })),
    markAllReadLocal: () => set((state) => ({ items: state.items.map((x) => ({ ...x, isRead: true })), unreadCount: 0 })),
    refreshUnreadCount: async () => {
        try {
            const res = await api.getNotificationUnreadCount();
            const body = res.data as { success?: boolean; unreadCount?: number; data?: { unreadCount?: number } };
            if (res.status === 200 && body.success) {
                set({ unreadCount: Number(body.unreadCount ?? body.data?.unreadCount ?? 0) });
            }
        } catch {
            /* ignore */
        }
    },
    refreshList: async () => {
        set({ loading: true });
        try {
            const res = await api.getNotifications({ page: 1, limit: 50 });
            const body = res.data as { success?: boolean; data?: InAppNotification[] };
            if (res.status === 200 && body.success && Array.isArray(body.data)) {
                set({ items: body.data });
            }
        } finally {
            set({ loading: false });
        }
    },
    reset: () => set({ unreadCount: 0, items: [], loading: false }),
}));
