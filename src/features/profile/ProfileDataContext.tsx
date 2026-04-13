import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthStore, type Employee } from '../../store/useAuthStore';
import { api } from '../../api/client';
import {
    collectReportingManagers,
    divisionHodForEmployee,
    orgRecordFromApiResponse,
    resolveId,
    type EmployeeProfileLike,
} from '../../utils/profileHierarchy';

type OrgHierarchyState = {
    division: Record<string, unknown> | null;
    department: Record<string, unknown> | null;
};

type ProfileDataContextValue = {
    loading: boolean;
    refresh: () => Promise<void>;
    orgHierarchy: OrgHierarchyState;
    hierarchyPeople: {
        reporting: ReturnType<typeof collectReportingManagers>;
        hod: ReturnType<typeof divisionHodForEmployee>;
        divManager: { name: string; email?: string } | null;
    };
};

const ProfileDataContext = createContext<ProfileDataContextValue | null>(null);

export function ProfileDataProvider({ children }: { children: ReactNode }) {
    const { user, employee, token, isAuthenticated, setEmployee, updateUser } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [orgHierarchy, setOrgHierarchy] = useState<OrgHierarchyState>({ division: null, department: null });

    const loadOrgHierarchyForEmployee = useCallback(async (emp: Employee) => {
        const divId = resolveId(emp.division_id) || resolveId(emp.division);
        const depId = resolveId(emp.department_id) || resolveId(emp.department);
        if (!divId && !depId) {
            setOrgHierarchy({ division: null, department: null });
            return;
        }
        try {
            const [divRes, depRes] = await Promise.all([
                divId ? api.getDivision(divId) : Promise.resolve({ data: { success: false } }),
                depId ? api.getDepartment(depId) : Promise.resolve({ data: { success: false } }),
            ]);
            setOrgHierarchy({
                division: orgRecordFromApiResponse(divRes.data),
                department: orgRecordFromApiResponse(depRes.data),
            });
        } catch {
            setOrgHierarchy({ division: null, department: null });
        }
    }, []);

    const fetchProfileData = useCallback(async () => {
        if (!isAuthenticated || !token) {
            setLoading(false);
            setOrgHierarchy({ division: null, department: null });
            setEmployee(null);
            return;
        }
        try {
            const meRes = await api.getMe();
            if (meRes.data.success && meRes.data.data && typeof meRes.data.data === 'object') {
                const data = meRes.data.data as { user?: Record<string, unknown> };
                const userData = data.user;
                if (userData && typeof userData === 'object') {
                    const u = userData as {
                        id?: string;
                        _id?: string;
                        name?: string;
                        email?: string;
                        role?: string;
                        profilePhoto?: string | null;
                        emp_no?: string;
                        employeeId?: string;
                        phone?: string;
                        phone_number?: string;
                        featureControl?: string[];
                        scope?: 'global' | 'restricted';
                        dataScope?: 'all' | 'department' | 'division' | 'own';
                        departments?: Array<string | { _id?: string; name?: string }>;
                        allowedDivisions?: Array<string | { _id?: string; name?: string }>;
                    };
                    const uid = u.id ?? u._id;
                    const phone = u.phone ?? u.phone_number;
                    updateUser({
                        ...(uid != null ? { id: String(uid) } : {}),
                        name: u.name || '',
                        email: u.email || '',
                        role: u.role || '',
                        profilePhoto: u.profilePhoto ?? null,
                        emp_no: u.emp_no,
                        employeeRef: u.employeeId != null ? String(u.employeeId) : undefined,
                        phone,
                        featureControl: Array.isArray(u.featureControl) ? u.featureControl : undefined,
                        scope: u.scope,
                        dataScope: u.dataScope,
                        departments: Array.isArray(u.departments) ? u.departments : undefined,
                        allowedDivisions: Array.isArray(u.allowedDivisions) ? u.allowedDivisions : undefined,
                    });

                    const empIdentifier = String(u.emp_no ?? u.employeeId ?? '').trim();
                    if (empIdentifier) {
                        const empRes = await api.getEmployee(empIdentifier);
                        if (empRes.data.success && empRes.data.data) {
                            setEmployee(empRes.data.data as Employee);
                            await loadOrgHierarchyForEmployee(empRes.data.data as Employee);
                        } else {
                            setOrgHierarchy({ division: null, department: null });
                        }
                    } else {
                        setOrgHierarchy({ division: null, department: null });
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, token, updateUser, setEmployee, loadOrgHierarchyForEmployee]);

    useEffect(() => {
        fetchProfileData();
    }, [fetchProfileData]);

    const hierarchyPeople = useMemo(() => {
        const emp = employee as EmployeeProfileLike | null;
        if (!emp) {
            return {
                reporting: [] as ReturnType<typeof collectReportingManagers>,
                hod: null as ReturnType<typeof divisionHodForEmployee>,
                divManager: null as { name: string; email?: string } | null,
            };
        }
        const reporting = collectReportingManagers(emp);
        const divisionIdStr = resolveId(emp.division_id) || resolveId(emp.division);
        const hod = divisionHodForEmployee(
            orgHierarchy.department as Parameters<typeof divisionHodForEmployee>[0],
            divisionIdStr
        );
        const mgrRaw = orgHierarchy.division?.manager as { name?: string; email?: string } | undefined;
        const divManager =
            mgrRaw?.name && typeof mgrRaw.name === 'string' ? { name: mgrRaw.name, email: mgrRaw.email } : null;
        return { reporting, hod, divManager };
    }, [employee, orgHierarchy]);

    const value = useMemo<ProfileDataContextValue>(
        () => ({
            loading,
            refresh: fetchProfileData,
            orgHierarchy,
            hierarchyPeople,
        }),
        [loading, fetchProfileData, orgHierarchy, hierarchyPeople]
    );

    return <ProfileDataContext.Provider value={value}>{children}</ProfileDataContext.Provider>;
}

export function useProfileData() {
    const ctx = useContext(ProfileDataContext);
    if (!ctx) {
        throw new Error('useProfileData must be used within ProfileDataProvider');
    }
    return ctx;
}
