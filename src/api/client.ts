import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { redirectToLogin } from '../auth/redirectToLogin';
import { API_BASE_URL } from '../constants/Config';
import { showAppToast } from '../ui/toast';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status as number | undefined;

        if (status === 401) {
            showAppToast('Your session expired. Please sign in again.', 'error');
            void (async () => {
                await useAuthStore.getState().logout();
                redirectToLogin();
            })();
            // Resolve expected auth errors so screens can handle gracefully without unhandled promise noise.
            return Promise.resolve(error.response);
        }
        if (status === 403) {
            showAppToast('You do not have permission for this action.', 'error');
            // Resolve expected permission errors so calling screens can show inline fallback states.
            return Promise.resolve(error.response);
        }

        return Promise.reject(error);
    }
);

/** Resolve 4xx with a response body (no throw) so screens can handle { success: false } without Metro axios errors. */
const okThrough4xx: import('axios').AxiosRequestConfig = {
    validateStatus: (status) => status >= 200 && status < 500,
};

/** Backend envelope used across HRMS APIs */
export type ApiEnvelope<T = unknown> = {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    url?: string;
    key?: string;
    filename?: string;
};

export type LiveAttendanceFilterOption = { id: string; name: string };
export type LiveAttendanceEmployee = {
    id: string;
    empNo: string;
    name: string;
    department?: string;
    designation?: string;
    division?: string;
    shift?: string;
    inTime?: string | null;
    outTime?: string | null;
    hoursWorked?: number;
    isLate?: boolean;
    lateMinutes?: number;
    isEarlyOut?: boolean;
    earlyOutMinutes?: number;
};
/** In-app notifications (same shape as web `InAppNotification`) */
export type InAppNotification = {
    _id: string;
    title: string;
    message: string;
    module: string;
    eventType: string;
    createdAt: string;
    isRead: boolean;
};

export type NotificationsListEnvelope = ApiEnvelope<InAppNotification[]> & {
    total?: number;
    page?: number;
    totalPages?: number;
};

export type NotificationsUnreadEnvelope = ApiEnvelope & {
    unreadCount?: number;
};

export type LiveAttendanceReportData = {
    date: string;
    summary: {
        currentlyWorking: number;
        completedShift: number;
        totalPresent: number;
        totalActiveEmployees: number;
        absentEmployees: number;
    };
    currentlyWorking: LiveAttendanceEmployee[];
    completedShift: LiveAttendanceEmployee[];
};

export const api = {
    login: (data: { email: string; password: string }) => apiClient.post<ApiEnvelope>('/auth/login', data),
    getMe: () => apiClient.get<ApiEnvelope>('/auth/me'),

    updateProfile: (data: Record<string, unknown>) => apiClient.put<ApiEnvelope>('/users/profile', data),

    getEmployee: (empNo: string) => apiClient.get<ApiEnvelope>(`/employees/${empNo}`),
    getEmployees: (params?: {
        is_active?: boolean;
        page?: number;
        limit?: number;
        search?: string;
        division_id?: string;
        department_id?: string;
        designation_id?: string;
        employee_group_id?: string;
        includeLeft?: boolean;
    }) => {
        const q = new URLSearchParams();
        if (params?.is_active != null) q.set('is_active', String(params.is_active));
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.search) q.set('search', params.search);
        if (params?.division_id) q.set('division_id', params.division_id);
        if (params?.department_id) q.set('department_id', params.department_id);
        if (params?.designation_id) q.set('designation_id', params.designation_id);
        if (params?.employee_group_id) q.set('employee_group_id', params.employee_group_id);
        if (params?.includeLeft != null) q.set('includeLeft', String(params.includeLeft));
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/employees${qs ? `?${qs}` : ''}`);
    },
    getSetting: (key: string) => apiClient.get<ApiEnvelope<{ key: string; value: unknown }>>(`/settings/${key}`),
    getEmployeeGroups: (isActive?: boolean) => {
        const q = new URLSearchParams();
        if (isActive != null) q.set('isActive', String(isActive));
        return apiClient.get<ApiEnvelope>(`/employee-groups${q.toString() ? `?${q.toString()}` : ''}`);
    },
    getDivisions: (isActive?: boolean) =>
        apiClient.get<ApiEnvelope>(`/divisions${isActive != null ? `?isActive=${String(isActive)}` : ''}`),
    getDepartments: (isActive?: boolean) =>
        apiClient.get<ApiEnvelope>(`/departments${isActive != null ? `?isActive=${String(isActive)}` : ''}`),
    getAllDesignations: (isActive?: boolean) =>
        apiClient.get<ApiEnvelope>(`/departments/designations${isActive != null ? `?isActive=${String(isActive)}` : ''}`),
    getDesignations: (departmentId: string, isActive?: boolean) =>
        apiClient.get<ApiEnvelope>(
            `/departments/${departmentId}/designations${isActive != null ? `?isActive=${String(isActive)}` : ''}`
        ),
    getResolvedDepartmentSettings: (deptId: string, type?: 'leaves' | 'loans' | 'salary_advance' | 'permissions' | 'ot' | 'overtime' | 'all', divisionId?: string) => {
        const q = new URLSearchParams();
        if (type) q.set('type', type);
        if (divisionId) q.set('divisionId', divisionId);
        return apiClient.get<ApiEnvelope>(`/departments/${deptId}/settings/resolved${q.toString() ? `?${q.toString()}` : ''}`);
    },

    getAttendanceCalendar: (employeeNumber: string, year?: number, month?: number) => {
        const params = new URLSearchParams();
        params.set('employeeNumber', employeeNumber);
        if (year != null) params.set('year', String(year));
        if (month != null) params.set('month', String(month));
        return apiClient.get<ApiEnvelope & { year?: number; month?: number }>(
            `/attendance/calendar?${params.toString()}`
        );
    },

    getAttendanceDetail: (employeeNumber: string, date: string) => {
        const params = new URLSearchParams();
        params.set('employeeNumber', employeeNumber);
        params.set('date', date);
        return apiClient.get<ApiEnvelope>(`/attendance/detail?${params.toString()}`, okThrough4xx);
    },

    getAttendanceList: (
        employeeNumber: string,
        startDate: string,
        endDate: string,
        page = 1,
        limit = 31
    ) => {
        const params = new URLSearchParams();
        params.set('employeeNumber', employeeNumber);
        params.set('startDate', startDate);
        params.set('endDate', endDate);
        params.set('page', String(page));
        params.set('limit', String(limit));
        return apiClient.get<ApiEnvelope & { pagination?: Record<string, unknown> }>(
            `/attendance/list?${params.toString()}`,
            okThrough4xx
        );
    },

    getDashboardStats: () =>
        apiClient.get<ApiEnvelope>('/dashboard/stats', { validateStatus: () => true }),

    getDivision: (id: string) => apiClient.get<ApiEnvelope>(`/divisions/${id}`),

    getDepartment: (id: string) => apiClient.get<ApiEnvelope>(`/departments/${id}`),

    changePassword: (currentPassword: string, newPassword: string) =>
        apiClient.put<ApiEnvelope<{ message?: string }>>('/auth/change-password', {
            currentPassword,
            newPassword,
        }),

    // Leave / OD settings (types + policy)
    getLeaveSettings: (type: 'leave' | 'od' | 'ccl') =>
        apiClient.get<ApiEnvelope>(`/leaves/settings/${type}`),

    getMyLeaves: (filters?: { status?: string; fromDate?: string; toDate?: string }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves/my${qs ? `?${qs}` : ''}`);
    },
    getLeaves: (filters?: {
        status?: string;
        fromDate?: string;
        toDate?: string;
        page?: number;
        limit?: number;
        search?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves${qs ? `?${qs}` : ''}`);
    },
    getPendingLeaveApprovals: (filters?: {
        page?: number;
        limit?: number;
        search?: string;
        fromDate?: string;
        toDate?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves/pending-approvals${qs ? `?${qs}` : ''}`);
    },
    processLeaveAction: (id: string, action: 'approve' | 'reject', comments?: string) =>
        apiClient.put<ApiEnvelope>(`/leaves/${id}/action`, { action, comments }),

    getMyODs: (filters?: { status?: string; fromDate?: string; toDate?: string }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves/od/my${qs ? `?${qs}` : ''}`);
    },
    getODs: (filters?: {
        status?: string;
        fromDate?: string;
        toDate?: string;
        page?: number;
        limit?: number;
        search?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves/od${qs ? `?${qs}` : ''}`);
    },
    getPendingODApprovals: (filters?: {
        page?: number;
        limit?: number;
        search?: string;
        fromDate?: string;
        toDate?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/leaves/od/pending-approvals${qs ? `?${qs}` : ''}`);
    },
    processODAction: (id: string, action: 'approve' | 'reject', comments?: string) =>
        apiClient.put<ApiEnvelope>(`/leaves/od/${id}/action`, { action, comments }),

    getLeave: (id: string) => apiClient.get<ApiEnvelope>(`/leaves/${id}`),

    getOD: (id: string) => apiClient.get<ApiEnvelope>(`/leaves/od/${id}`),

    applyLeave: (body: Record<string, unknown>) =>
        apiClient.post<ApiEnvelope>('/leaves', body),

    applyOD: (body: Record<string, unknown>) =>
        apiClient.post<ApiEnvelope>('/leaves/od', body),

    updateOD: (id: string, body: Record<string, unknown>) =>
        apiClient.put<ApiEnvelope>(`/leaves/od/${id}`, body),

    appendODLocationTrail: (
        id: string,
        body: {
            points: Array<{
                latitude: number;
                longitude: number;
                capturedAt?: string;
                address?: string;
                accuracy?: number;
                heading?: number;
                speed?: number;
                source?: 'web' | 'mobile';
            }>;
            client?: 'web' | 'mobile';
        }
    ) => apiClient.post<ApiEnvelope>(`/leaves/od/${encodeURIComponent(id)}/location-trail`, body, okThrough4xx),

    cancelLeave: (id: string, reason?: string) =>
        apiClient.put<ApiEnvelope>(`/leaves/${id}/cancel`, { reason }),

    cancelOD: (id: string, reason?: string) =>
        apiClient.put<ApiEnvelope>(`/leaves/od/${id}/cancel`, { reason }),

    getApprovedRecordsForDate: (employeeId: string, employeeNumber: string, date: string) => {
        const q = new URLSearchParams();
        if (employeeId) q.set('employeeId', employeeId);
        if (employeeNumber) q.set('employeeNumber', employeeNumber);
        q.set('date', date);
        return apiClient.get<ApiEnvelope>(`/leaves/approved-records?${q.toString()}`);
    },

    getLeaveApplyPeriodContext: (params: { fromDate: string; employeeId?: string; leaveType?: string }) => {
        const q = new URLSearchParams();
        q.set('fromDate', params.fromDate);
        if (params.employeeId) q.set('employeeId', params.employeeId);
        if (params.leaveType) q.set('leaveType', params.leaveType);
        return apiClient.get<ApiEnvelope>(`/leaves/apply-period-context?${q.toString()}`);
    },

    checkODHoliday: (employeeId: string | undefined, empNo: string | undefined, date: string) => {
        const q = new URLSearchParams();
        if (employeeId) q.set('employeeId', employeeId);
        if (empNo) q.set('empNo', empNo);
        q.set('date', date);
        return apiClient.get<ApiEnvelope>(`/leaves/od/check-holiday?${q.toString()}`);
    },

    getMyLoans: (filters?: { status?: string; requestType?: 'loan' | 'salary_advance' }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.requestType) q.set('requestType', filters.requestType);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/loans/my${qs ? `?${qs}` : ''}`);
    },
    getLoans: (filters?: {
        status?: string;
        requestType?: 'loan' | 'salary_advance';
        page?: number;
        limit?: number;
        search?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.status) q.set('status', filters.status);
        if (filters?.requestType) q.set('requestType', filters.requestType);
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/loans${qs ? `?${qs}` : ''}`);
    },
    getPendingLoanApprovals: (filters?: {
        page?: number;
        limit?: number;
        search?: string;
        fromDate?: string;
        toDate?: string;
        department?: string;
        division?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.page != null) q.set('page', String(filters.page));
        if (filters?.limit != null) q.set('limit', String(filters.limit));
        if (filters?.search) q.set('search', filters.search);
        if (filters?.fromDate) q.set('fromDate', filters.fromDate);
        if (filters?.toDate) q.set('toDate', filters.toDate);
        if (filters?.department) q.set('department', filters.department);
        if (filters?.division) q.set('division', filters.division);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/loans/pending-approvals${qs ? `?${qs}` : ''}`);
    },
    processLoanAction: (
        id: string,
        action: 'approve' | 'reject' | 'forward',
        comments?: string,
        approvalAmount?: number,
        approvalInterestRate?: number
    ) =>
        apiClient.put<ApiEnvelope>(`/loans/${id}/action`, { action, comments, approvalAmount, approvalInterestRate }),

    getLoan: (id: string) => apiClient.get<ApiEnvelope>(`/loans/${id}`),

    applyLoan: (body: Record<string, unknown>) => apiClient.post<ApiEnvelope>('/loans', body),

    cancelLoan: (id: string, reason?: string) =>
        apiClient.put<ApiEnvelope>(`/loans/${id}/cancel`, { reason }),

    getLoanEligibility: (empNo?: string) => {
        const q = new URLSearchParams();
        if (empNo) q.set('empNo', empNo);
        return apiClient.get<ApiEnvelope>(`/loans/calculate-eligibility${q.toString() ? `?${q.toString()}` : ''}`, okThrough4xx);
    },
    getLoanSettings: (type: 'loan' | 'salary_advance') =>
        apiClient.get<ApiEnvelope>(`/loans/settings/${type}`),

    getGuarantorCandidates: (search?: string, limit = 60) => {
        const q = new URLSearchParams();
        if (search) q.set('search', search);
        q.set('limit', String(limit));
        return apiClient.get<ApiEnvelope>(`/loans/guarantor-candidates?${q.toString()}`);
    },
    getGuarantorRequests: () => apiClient.get<ApiEnvelope>('/loans/guarantor-requests'),
    processGuarantorAction: (loanId: string, action: 'accepted' | 'rejected', remarks?: string) =>
        apiClient.put<ApiEnvelope>(`/loans/${loanId}/guarantor-action`, { action, remarks }),
    getLoanTransactions: (id: string) => apiClient.get<ApiEnvelope>(`/loans/${id}/transactions`),

    getLiveAttendanceFilterOptions: () =>
        apiClient.get<ApiEnvelope<{ divisions: LiveAttendanceFilterOption[]; departments: LiveAttendanceFilterOption[]; shifts: LiveAttendanceFilterOption[] }>>(
            '/attendance/reports/live/filters'
        ),
    getLiveAttendanceReport: (params?: { date?: string; division?: string; department?: string; shift?: string }) => {
        const q = new URLSearchParams();
        if (params?.date) q.set('date', params.date);
        if (params?.division) q.set('division', params.division);
        if (params?.department) q.set('department', params.department);
        if (params?.shift) q.set('shift', params.shift);
        return apiClient.get<ApiEnvelope<LiveAttendanceReportData>>(`/attendance/reports/live${q.toString() ? `?${q.toString()}` : ''}`);
    },

    getShifts: (isActive?: boolean) => {
        const q = isActive != null ? `?isActive=${String(isActive)}` : '';
        return apiClient.get<ApiEnvelope>(`/shifts${q}`);
    },

    getOTRequests: (filters?: {
        employeeId?: string;
        employeeNumber?: string;
        date?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.employeeId) q.set('employeeId', filters.employeeId);
        if (filters?.employeeNumber) q.set('employeeNumber', filters.employeeNumber);
        if (filters?.date) q.set('date', filters.date);
        if (filters?.status) q.set('status', filters.status);
        if (filters?.startDate) q.set('startDate', filters.startDate);
        if (filters?.endDate) q.set('endDate', filters.endDate);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/ot${qs ? `?${qs}` : ''}`);
    },

    createOT: (body: Record<string, unknown>) => apiClient.post<ApiEnvelope>('/ot', body),

    approveOT: (id: string) => apiClient.put<ApiEnvelope>(`/ot/${id}/approve`),

    rejectOT: (id: string, reason?: string) => apiClient.put<ApiEnvelope>(`/ot/${id}/reject`, { reason }),

    checkConfusedShift: (employeeNumber: string, date: string) =>
        apiClient.get<ApiEnvelope>(
            `/ot/check-confused/${encodeURIComponent(employeeNumber)}/${encodeURIComponent(date)}`
        ),

    getAvailableShiftsForAttendance: (employeeNumber: string, date: string) =>
        apiClient.get<ApiEnvelope>(
            `/attendance/${encodeURIComponent(employeeNumber)}/${encodeURIComponent(date)}/available-shifts`
        ),

    getPermissions: (filters?: {
        employeeId?: string;
        employeeNumber?: string;
        date?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
    }) => {
        const q = new URLSearchParams();
        if (filters?.employeeId) q.set('employeeId', filters.employeeId);
        if (filters?.employeeNumber) q.set('employeeNumber', filters.employeeNumber);
        if (filters?.date) q.set('date', filters.date);
        if (filters?.status) q.set('status', filters.status);
        if (filters?.startDate) q.set('startDate', filters.startDate);
        if (filters?.endDate) q.set('endDate', filters.endDate);
        const qs = q.toString();
        return apiClient.get<ApiEnvelope>(`/permissions${qs ? `?${qs}` : ''}`);
    },

    createPermission: (body: Record<string, unknown>) => apiClient.post<ApiEnvelope>('/permissions', body),

    approvePermission: (id: string) => apiClient.put<ApiEnvelope>(`/permissions/${id}/approve`),

    rejectPermission: (id: string, reason?: string) =>
        apiClient.put<ApiEnvelope>(`/permissions/${id}/reject`, { reason }),

    getPermissionQR: (id: string) => apiClient.get<ApiEnvelope>(`/permissions/${id}/qr`),

    generateGateOutQR: (permissionId: string) =>
        apiClient.post<ApiEnvelope & { qrSecret?: string }>(`/security/gate-pass/out/${permissionId}`),

    generateGateInQR: (permissionId: string) =>
        apiClient.post<ApiEnvelope & { qrSecret?: string }>(`/security/gate-pass/in/${permissionId}`),

    getOvertimeSettings: () => apiClient.get<ApiEnvelope>('/ot/settings'),

    getPermissionDeductionSettings: () =>
        apiClient.get<ApiEnvelope>('/permissions/settings/deduction'),

    getNotifications: (params?: { page?: number; limit?: number; isRead?: boolean; module?: string }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (typeof params?.isRead === 'boolean') q.set('isRead', String(params.isRead));
        if (params?.module) q.set('module', params.module);
        const qs = q.toString();
        return apiClient.get<NotificationsListEnvelope>(`/notifications${qs ? `?${qs}` : ''}`);
    },

    getNotificationUnreadCount: () => apiClient.get<NotificationsUnreadEnvelope>('/notifications/unread-count'),

    markNotificationRead: (id: string) => apiClient.patch<ApiEnvelope>(`/notifications/${id}/read`),

    markAllNotificationsRead: () => apiClient.patch<ApiEnvelope>('/notifications/read-all'),

    /**
     * Upload OD evidence (React Native FormData file part).
     */
    /** React Native: use fetch so multipart boundary is set correctly (avoid default JSON Content-Type). */
    uploadEvidence: async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
        const name = asset.fileName || 'evidence.jpg';
        const type = asset.mimeType || 'image/jpeg';
        const form = new FormData();
        form.append('file', {
            uri: asset.uri,
            name,
            type,
        } as unknown as Blob);
        const token = useAuthStore.getState().token;
        const res = await fetch(`${API_BASE_URL}/upload/evidence`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
        });
        const json = (await res.json()) as ApiEnvelope & { url?: string; key?: string };
        return { data: json };
    },
};

export default apiClient;
