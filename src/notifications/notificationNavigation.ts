import { router } from 'expo-router';
import type { InAppNotification } from '../api/client';

function pathFromActionUrl(actionUrl?: string | null): string | null {
    const raw = String(actionUrl || '').trim();
    if (!raw) return null;
    if (raw.startsWith('http')) {
        try {
            return new URL(raw).pathname || null;
        } catch {
            return null;
        }
    }
    return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Map web/workspace paths to mobile stack routes. */
export function resolveNotificationRoute(n: Pick<InAppNotification, 'module' | 'entityId' | 'actionUrl'>): string | null {
    const entityId = n.entityId ? String(n.entityId) : '';
    const fromUrl = pathFromActionUrl(n.actionUrl);

    if (fromUrl) {
        const leaveMatch = fromUrl.match(/\/leaves?\/([a-f0-9]{24})/i);
        if (leaveMatch) return `/leave/${leaveMatch[1]}`;
        const odMatch = fromUrl.match(/\/od\/([a-f0-9]{24})/i);
        if (odMatch) return `/od/${odMatch[1]}`;
        const loanMatch = fromUrl.match(/\/loans?\/([a-f0-9]{24})/i);
        if (loanMatch) return `/loan/${loanMatch[1]}`;
        if (fromUrl.includes('/ot-permissions')) return '/(tabs)/ot-permissions';
        if (fromUrl.includes('/leaves')) return '/(tabs)/leaves';
        if (fromUrl.includes('/loans')) return '/(tabs)/loans';
        if (fromUrl.includes('/payslips')) return '/(tabs)/payslips';
    }

    if (!entityId) return null;
    switch (n.module) {
        case 'leave':
            return `/leave/${entityId}`;
        case 'od':
            return `/od/${entityId}`;
        case 'loan':
        case 'salary_advance':
            return `/loan/${entityId}`;
        case 'ot_permission':
            return '/(tabs)/ot-permissions';
        default:
            return null;
    }
}

export function openNotificationTarget(n: Pick<InAppNotification, 'module' | 'entityId' | 'actionUrl'>): void {
    const route = resolveNotificationRoute(n);
    if (route) {
        router.push(route as never);
        return;
    }
    router.push('/notifications');
}
