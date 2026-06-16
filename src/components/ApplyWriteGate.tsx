import type { ReactNode } from 'react';
import { ModuleAccessDenied } from './ModuleAccessDenied';

export function ApplyWriteGate({
    allowed,
    moduleLabel,
    children,
}: {
    allowed: boolean;
    moduleLabel: string;
    children: ReactNode;
}) {
    if (!allowed) {
        return <ModuleAccessDenied moduleLabel={moduleLabel} showBack />;
    }
    return <>{children}</>;
}
