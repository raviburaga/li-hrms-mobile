import type { User } from '../store/useAuthStore';

export type AppRole = 'super_admin' | 'sub_admin' | 'hr' | 'hod' | 'manager' | 'employee';

function normRole(role?: string | null): AppRole | 'unknown' {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'super_admin' || r === 'sub_admin' || r === 'hr' || r === 'hod' || r === 'manager' || r === 'employee') {
        return r;
    }
    return 'unknown';
}

export function isManagementRole(user: User | null | undefined): boolean {
    const role = normRole(user?.role);
    return role === 'super_admin' || role === 'sub_admin' || role === 'hr' || role === 'hod' || role === 'manager';
}

function hasAnyRole(user: User | null | undefined, roles: AppRole[]): boolean {
    const role = normRole(user?.role);
    return role !== 'unknown' && roles.includes(role);
}

/** Match web: allow read when featureControl empty (legacy); accept module, :read, or :write. */
function canViewFeature(user: User | null | undefined, featureCode: string): boolean {
    if (!user) return false;
    const fc = user.featureControl;
    if (!fc || fc.length === 0) return true;
    return moduleCodesToCheck(featureCode).some(
        (code) =>
            fc.includes(code) ||
            fc.includes(`${code}:read`) ||
            fc.includes(`${code}:write`) ||
            fc.includes(`${code}:verify`) ||
            fc.includes(`${code}:terminate`) ||
            fc.includes(`${code}:release`)
    );
}

function canManageFeature(user: User | null | undefined, featureCode: string): boolean {
    if (!user) return false;
    const fc = user.featureControl;
    if (!fc || fc.length === 0) return true;
    return moduleCodesToCheck(featureCode).some((code) => fc.includes(code) || fc.includes(`${code}:write`));
}

const MODULE_CODE_ALIASES: Record<string, string[]> = {
    LOANS: ['LOANS_SALARY_ADVANCE', 'LOAN'],
    LOANS_SALARY_ADVANCE: ['LOANS', 'LOAN'],
};

function moduleCodesToCheck(moduleCode: string): string[] {
    return [moduleCode, ...(MODULE_CODE_ALIASES[moduleCode] || [])];
}

export function canViewMobileModule(user: User | null | undefined, moduleCode: string): boolean {
    return canViewFeature(user, moduleCode);
}

export function canViewDashboardModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'DASHBOARD');
}

export function canViewAttendanceModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'ATTENDANCE');
}

export function canViewLiveAttendanceModule(user: User | null | undefined): boolean {
    if (!user) return false;
    if (normRole(user.role) === 'super_admin') return true;
    return canViewFeature(user, 'LIVE_ATTENDANCE');
}

export function canViewProfileModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'PROFILE');
}

export function canViewTeamLeaves(user: User | null | undefined): boolean {
    return isManagementRole(user) && canViewFeature(user, 'LEAVE_OD');
}

export function canActionLeaves(user: User | null | undefined): boolean {
    return hasAnyRole(user, ['super_admin', 'sub_admin', 'hr', 'hod', 'manager']) && canManageFeature(user, 'LEAVE_OD');
}

export function canViewWorkspaceDashboard(user: User | null | undefined): boolean {
    return isManagementRole(user);
}

export function canViewTeamLoans(user: User | null | undefined): boolean {
    return isManagementRole(user) && canViewFeature(user, 'LOANS');
}

export function canActionLoans(user: User | null | undefined): boolean {
    return hasAnyRole(user, ['super_admin', 'sub_admin', 'hr', 'hod', 'manager']) && canManageFeature(user, 'LOANS');
}

export function canViewLeavesModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'LEAVE_OD');
}

/** Match web workspace roles for loans module visibility. */
export function canViewLoansModule(user: User | null | undefined): boolean {
    if (!user) return false;
    if (normRole(user.role) === 'super_admin') return canViewFeature(user, 'LOANS');
    return (
        hasAnyRole(user, ['sub_admin', 'hr', 'manager', 'employee']) && canViewFeature(user, 'LOANS')
    );
}

/** OT & Permissions workspace (same feature flag as web `OT_PERMISSIONS`). */
export function canViewOtPermissionsModule(user: User | null | undefined): boolean {
    if (!user) return false;
    if (normRole(user.role) === 'super_admin') return true;
    return canViewFeature(user, 'OT_PERMISSIONS');
}

/** POST /api/ot is limited to manager+ on the backend. */
export function canApplyOtFromApi(user: User | null | undefined): boolean {
    return (
        hasAnyRole(user, ['manager', 'super_admin', 'sub_admin', 'hr', 'hod']) && canManageFeature(user, 'OT_PERMISSIONS')
    );
}

export function canApplyPermissionFromApi(user: User | null | undefined): boolean {
    return canManageFeature(user, 'OT_PERMISSIONS');
}

/** Approve/reject OT and permissions (backend: manager, hod, hr, sub_admin, super_admin). */
export function canApproveOtPermissionFromApi(user: User | null | undefined): boolean {
    return (
        hasAnyRole(user, ['manager', 'super_admin', 'sub_admin', 'hr', 'hod']) && canManageFeature(user, 'OT_PERMISSIONS')
    );
}

/** Match web: any role with EMPLOYEES:read (not management-only). */
export function canViewEmployeesModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'EMPLOYEES');
}

export function canApplyLeaves(user: User | null | undefined): boolean {
    return canManageFeature(user, 'LEAVE_OD');
}

/** OD photo from gallery / saved files (not camera). Requires LEAVE_OD:file on the user. */
export function canOdUploadFromDevice(user: User | null | undefined): boolean {
    if (!user) return false;
    if (normRole(user.role) === 'super_admin') return true;
    const fc = user.featureControl;
    if (!fc || fc.length === 0) return false;
    return fc.includes('LEAVE_OD:file');
}

export function canApplyLoans(user: User | null | undefined): boolean {
    return canManageFeature(user, 'LOANS');
}

/** PAYSLIPS module — employees see own released payslips; scoped roles see team list on web/mobile. */
export function canViewPayslipsModule(user: User | null | undefined): boolean {
    return canViewFeature(user, 'PAYSLIPS');
}

/** PAYSLIPS:write or admin — view payslips for employees within data scope */
export function canViewScopedPayslips(user: User | null | undefined): boolean {
    if (!user) return false;
    if (hasAnyRole(user, ['super_admin', 'sub_admin', 'hr'])) return true;
    return canManageFeature(user, 'PAYSLIPS');
}

export function isSelfPayslipView(user: User | null | undefined): boolean {
    return canViewPayslipsModule(user) && !canViewScopedPayslips(user);
}

export function permissionDebugSummary(user: User | null | undefined): string {
    const role = String(user?.role || 'unknown');
    const leaves = `${canViewLeavesModule(user) ? 'R' : '-'}${canApplyLeaves(user) ? 'W' : '-'}`;
    const loans = `${canViewLoansModule(user) ? 'R' : '-'}${canApplyLoans(user) ? 'W' : '-'}`;
    const payslips = `${canViewPayslipsModule(user) ? 'R' : '-'}${canViewScopedPayslips(user) ? 'S' : ''}`;
    return `role:${role} leaves:${leaves} loans:${loans} payslips:${payslips}`;
}
