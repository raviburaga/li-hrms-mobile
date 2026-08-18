import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Modal,
    Alert,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Plus, ChevronRight, Briefcase, Funnel, Search, X } from 'lucide-react-native';
import { MotiView } from 'moti';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, ApiEnvelope } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import { formatDateRangeIST } from '../../src/utils/dateIST';
import { canActionLeaves, canApplyLeaves, canViewLeavesModule, canViewTeamLeaves, isManagementRole, permissionDebugSummary } from '../../src/lib/permissions';
import { canCurrentUserActOnLeaveLikeItem } from '../../src/utils/workflowPermissions';
import { SkeletonCard } from '../../src/components/Skeleton';
import {
    buildPayPeriodOptions,
    getDefaultLeaveODDateRange,
    matchPayPeriodValue,
    type PayPeriodRange,
} from '../../src/utils/payPeriodRange';

type OrgNode = string | { _id?: string; name?: string; code?: string };
type Row = {
    _id: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    purpose?: string;
    leaveType?: string;
    odType?: string;
    emp_no?: string;
    employeeId?: {
        emp_no?: string;
        employee_name?: string;
        first_name?: string;
        last_name?: string;
        designation?: OrgNode;
        designation_id?: OrgNode;
        department?: OrgNode & { division?: OrgNode };
        department_id?: OrgNode;
        division?: OrgNode;
        division_id?: OrgNode;
    };
    designation?: OrgNode;
    designation_id?: OrgNode;
    department?: OrgNode;
    department_id?: OrgNode;
    division?: OrgNode;
    division_id?: OrgNode;
};

const FILTERS = ['all', 'pending', 'approved', 'rejected'] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string): { wrap: string; text: string } {
    const s = (status || '').toLowerCase();
    if (s === 'draft') return { wrap: 'bg-violet-100', text: 'text-violet-900' };
    if (s.includes('approv')) return { wrap: 'bg-emerald-100', text: 'text-emerald-800' };
    if (s.includes('reject')) return { wrap: 'bg-rose-100', text: 'text-rose-800' };
    if (s.includes('pending') || s.includes('progress')) return { wrap: 'bg-amber-100', text: 'text-amber-900' };
    return { wrap: 'bg-neutral-100', text: 'text-neutral-700' };
}

function statusLabelShort(status: string, segment: 'leave' | 'od'): string {
    const s = (status || '').toLowerCase();
    if (segment === 'od' && s === 'draft') return 'Draft · OD OUT pending';
    return (status || '—').replace(/_/g, ' ');
}

function nodeName(v: unknown): string {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '—');
    return '—';
}

function employeeDisplay(row: Row): {
    empNo: string;
    name: string;
    designation: string;
    division: string;
    department: string;
} {
    const emp = row.employeeId;
    const name = String(emp?.employee_name || [emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || '—');
    const department =
        nodeName(emp?.department) !== '—' ? nodeName(emp?.department) : nodeName(emp?.department_id || row.department || row.department_id);
    const division =
        nodeName((emp?.department as { division?: unknown } | undefined)?.division) !== '—'
            ? nodeName((emp?.department as { division?: unknown } | undefined)?.division)
            : nodeName(emp?.division || emp?.division_id || row.division || row.division_id);
    return {
        empNo: String(emp?.emp_no || row.emp_no || '—'),
        name,
        designation: nodeName(emp?.designation || emp?.designation_id || row.designation || row.designation_id),
        division,
        department,
    };
}

export default function LeavesScreen() {
    const router = useRouter();
    const { user, employee, setEmployee } = useAuthStore();
    const [segment, setSegment] = useState<'leave' | 'od'>('leave');
    const [scopeMode, setScopeMode] = useState<'my' | 'team'>(() => (isManagementRole(useAuthStore.getState().user) ? 'team' : 'my'));
    const [filter, setFilter] = useState<Filter>('all');
    const [searchText, setSearchText] = useState('');
    const [payCycleStartDay, setPayCycleStartDay] = useState(1);
    const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<PayPeriodRange>(() => getDefaultLeaveODDateRange(1));
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [leaveRows, setLeaveRows] = useState<Row[]>([]);
    const [odRows, setOdRows] = useState<Row[]>([]);
    const [pendingLeaveRows, setPendingLeaveRows] = useState<Row[]>([]);
    const [pendingOdRows, setPendingOdRows] = useState<Row[]>([]);
    const [leaveAllowHigherAuthority, setLeaveAllowHigherAuthority] = useState(false);
    const [odAllowHigherAuthority, setODAllowHigherAuthority] = useState(false);
    const [actionOpen, setActionOpen] = useState(false);
    const hasTeamView = canViewTeamLeaves(user);
    const hasActionPermission = canActionLeaves(user);
    const canViewModule = canViewLeavesModule(user);
    const canApply = canApplyLeaves(user);
    const showEmployeeMeta = isManagementRole(user);

    useEffect(() => {
        if (hasTeamView) setScopeMode('team');
    }, [hasTeamView]);

    useEffect(() => {
        let cancelled = false;
        const readSettingNumber = (body: ApiEnvelope<{ key?: string; value?: unknown }>): number | null => {
            const value = body.data?.value;
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };
        const loadPayCycle = async () => {
            try {
                const [startRes, endRes] = await Promise.all([
                    api.getSetting('payroll_cycle_start_day'),
                    api.getSetting('payroll_cycle_end_day'),
                ]);
                if (cancelled) return;
                const start = readSettingNumber(startRes.data as ApiEnvelope<{ key?: string; value?: unknown }>) || 1;
                const end = readSettingNumber(endRes.data as ApiEnvelope<{ key?: string; value?: unknown }>);
                setPayCycleStartDay(start);
                setPayCycleEndDay(end);
                setDateRange(getDefaultLeaveODDateRange(start));
            } catch {
                if (!cancelled) setDateRange(getDefaultLeaveODDateRange(1));
            }
        };
        void loadPayCycle();
        return () => {
            cancelled = true;
        };
    }, []);

    const payPeriodOptions = useMemo(
        () =>
            buildPayPeriodOptions({
                payrollCycleStartDay: payCycleStartDay,
                payrollCycleEndDay: payCycleEndDay,
                getDefaultRange: () => getDefaultLeaveODDateRange(payCycleStartDay),
            }),
        [payCycleEndDay, payCycleStartDay]
    );
    const payPeriodSelectValue = useMemo(
        () => matchPayPeriodValue(dateRange, payPeriodOptions, () => getDefaultLeaveODDateRange(payCycleStartDay)),
        [dateRange, payCycleStartDay, payPeriodOptions]
    );

    const ensureEmployee = useCallback(async () => {
        if (!employee && user?.emp_no) {
            try {
                const er = await api.getEmployee(user.emp_no);
                const body = er.data as ApiEnvelope;
                if (body.success && body.data) setEmployee(body.data as never);
            } catch {
                /* ignore */
            }
        }
    }, [employee, user?.emp_no, setEmployee]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            await ensureEmployee();
            const q: { status?: string; fromDate?: string; toDate?: string } = {
                fromDate: dateRange.from,
                toDate: dateRange.to,
            };
            if (filter === 'approved') q.status = 'approved';
            else if (filter === 'rejected') q.status = 'rejected';
            const [lr, or, lpr, opr] = await Promise.all([
                scopeMode === 'team' && hasTeamView ? api.getLeaves(q) : api.getMyLeaves(q),
                scopeMode === 'team' && hasTeamView ? api.getODs(q) : api.getMyODs(q),
                hasTeamView ? api.getPendingLeaveApprovals({ limit: 200, fromDate: dateRange.from, toDate: dateRange.to }) : Promise.resolve({ data: { success: false } }),
                hasTeamView ? api.getPendingODApprovals({ limit: 200, fromDate: dateRange.from, toDate: dateRange.to }) : Promise.resolve({ data: { success: false } }),
            ]);
            try {
                const [leaveSettingsRes, odSettingsRes] = await Promise.all([
                    api.getLeaveSettings('leave'),
                    api.getLeaveSettings('od'),
                ]);
                const leaveSettingsBody = leaveSettingsRes.data as ApiEnvelope<Record<string, unknown>>;
                const odSettingsBody = odSettingsRes.data as ApiEnvelope<Record<string, unknown>>;
                const leaveWorkflow = (leaveSettingsBody.data as { workflow?: { allowHigherAuthorityToApproveLowerLevels?: boolean } } | undefined)?.workflow;
                const odWorkflow = (odSettingsBody.data as { workflow?: { allowHigherAuthorityToApproveLowerLevels?: boolean } } | undefined)?.workflow;
                setLeaveAllowHigherAuthority(!!leaveWorkflow?.allowHigherAuthorityToApproveLowerLevels);
                setODAllowHigherAuthority(!!odWorkflow?.allowHigherAuthorityToApproveLowerLevels);
            } catch {
                setLeaveAllowHigherAuthority(false);
                setODAllowHigherAuthority(false);
            }
            const lb = lr.data as ApiEnvelope<Row[]>;
            const ob = or.data as ApiEnvelope<Row[]>;
            const lpb = lpr.data as ApiEnvelope<Row[]>;
            const opb = opr.data as ApiEnvelope<Row[]>;
            let l = Array.isArray(lb.data) ? lb.data : [];
            let o = Array.isArray(ob.data) ? ob.data : [];
            if (filter === 'pending') {
                const pend = (s: string) => {
                    const x = (s || '').toLowerCase().replace(/\s+/g, '_');
                    return x === 'pending' || x === 'in_progress';
                };
                l = l.filter((r) => pend(String(r.status)));
                o = o.filter((r) => pend(String(r.status)));
            }
            const qText = searchText.trim().toLowerCase();
            const fromTs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
            const toTs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : null;
            const matchRow = (r: Row, type: 'leave' | 'od') => {
                const meta = employeeDisplay(r);
                const hay = [
                    String(r.leaveType || ''),
                    String(r.odType || ''),
                    String(r.purpose || ''),
                    String(r.status || ''),
                    meta.empNo,
                    meta.name,
                    meta.designation,
                    meta.division,
                    meta.department,
                    type,
                ].join(' ').toLowerCase();
                if (qText && !hay.includes(qText)) return false;
                const start = r.fromDate ? new Date(r.fromDate).getTime() : null;
                const end = r.toDate ? new Date(r.toDate).getTime() : start;
                if (fromTs != null && end != null && end < fromTs) return false;
                if (toTs != null && start != null && start > toTs) return false;
                return true;
            };
            l = l.filter((r) => matchRow(r, 'leave'));
            o = o.filter((r) => matchRow(r, 'od'));
            setLeaveRows(l);
            setOdRows(o);
            setPendingLeaveRows(Array.isArray(lpb.data) ? lpb.data : []);
            setPendingOdRows(Array.isArray(opb.data) ? opb.data : []);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [dateRange.from, dateRange.to, filter, ensureEmployee, scopeMode, hasTeamView, searchText]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const onRefresh = () => {
        setRefreshing(true);
        load();
    };

    const rows = segment === 'leave' ? leaveRows : odRows;
    const pendingLeave = leaveRows.filter((r) => String(r.status).toLowerCase().includes('pending')).length;
    const pendingOd = odRows.filter((r) => String(r.status).toLowerCase().includes('pending')).length;
    const teamPendingLeave = pendingLeaveRows.length;
    const teamPendingOd = pendingOdRows.length;

    const actionOnRow = async (rowId: string, action: 'approve' | 'reject') => {
        if (!hasActionPermission) return;
        try {
            if (segment === 'leave') {
                const res = await api.processLeaveAction(rowId, action);
                const body = res.data as ApiEnvelope;
                if (!body.success) throw new Error(body.message || body.error || 'Request failed');
            } else {
                const res = await api.processODAction(rowId, action);
                const body = res.data as ApiEnvelope;
                if (!body.success) throw new Error(body.message || body.error || 'Request failed');
            }
            await load();
        } catch (e) {
            Alert.alert('Action failed', e instanceof Error ? e.message : 'Could not process action');
        }
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                {!canViewModule ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-neutral-700 text-center font-semibold">You do not have access to Leaves module.</Text>
                    </View>
                ) : (
                <ScrollView
                    className="flex-1 px-6 pt-6"
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
                >
                    <View className="flex-row justify-between items-start mb-6">
                        <View className="flex-1 pr-3">
                            <View className="flex-row items-center mb-1">
                                <View className="w-8 h-1 bg-primary rounded-full mr-2" />
                                <Text className="text-neutral-400 font-bold tracking-widest text-[10px] uppercase">Leave & OD</Text>
                            </View>
                            <Text className="text-neutral-900 text-3xl font-black tracking-tight">
                                Time<Text className="text-primary">.</Text>Off
                            </Text>
                            <Text className="text-neutral-500 text-sm font-medium mt-1">Apply, track status, view approval steps.</Text>
                            {__DEV__ ? (
                                <Text className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                                    {permissionDebugSummary(user)}
                                </Text>
                            ) : null}
                        </View>
                        <TouchableOpacity
                            onPress={() => setActionOpen(true)}
                            className={`w-14 h-14 bg-primary rounded-2xl items-center justify-center shadow-lg shadow-primary/30 ${!canApply ? 'opacity-40' : ''}`}
                            disabled={!canApply}
                        >
                            <Plus size={28} color="white" strokeWidth={3} />
                        </TouchableOpacity>
                    </View>

                    <View className="flex-row gap-3 mb-4">
                        <View className="flex-1 bg-white rounded-[24px] p-4 border-2 border-neutral-50 shadow-sm">
                            <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest mb-1">Leaves pending</Text>
                            <Text className="text-neutral-900 text-2xl font-black">{scopeMode === 'team' ? teamPendingLeave : pendingLeave}</Text>
                        </View>
                        <View className="flex-1 bg-white rounded-[24px] p-4 border-2 border-neutral-50 shadow-sm">
                            <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest mb-1">OD pending</Text>
                            <Text className="text-neutral-900 text-2xl font-black">{scopeMode === 'team' ? teamPendingOd : pendingOd}</Text>
                        </View>
                    </View>

                    {hasTeamView ? (
                        <View className="flex-row bg-white rounded-2xl border-2 border-neutral-100 p-1 mb-4">
                            {(['my', 'team'] as const).map((m) => (
                                <TouchableOpacity
                                    key={m}
                                    onPress={() => setScopeMode(m)}
                                    className={`flex-1 py-3 rounded-xl items-center ${scopeMode === m ? 'bg-neutral-900' : ''}`}
                                >
                                    <Text className={`font-black text-xs uppercase tracking-widest ${scopeMode === m ? 'text-white' : 'text-neutral-500'}`}>
                                        {m === 'my' ? 'My requests' : 'Team inbox'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}

                    <View className="flex-row bg-white rounded-2xl border-2 border-neutral-100 p-1 mb-4">
                        {(['leave', 'od'] as const).map((s) => (
                            <TouchableOpacity
                                key={s}
                                onPress={() => setSegment(s)}
                                className={`flex-1 py-3 rounded-xl items-center ${segment === s ? 'bg-neutral-900' : ''}`}
                            >
                                {s === 'leave' ? (
                                    <Text className={`font-black text-xs uppercase tracking-widest ${segment === s ? 'text-white' : 'text-neutral-500'}`}>
                                        Leaves
                                    </Text>
                                ) : (
                                    <View className="flex-row items-center gap-1">
                                        <Briefcase size={14} color={segment === s ? '#fff' : '#64748B'} />
                                        <Text className={`font-black text-xs uppercase tracking-widest ${segment === s ? 'text-white' : 'text-neutral-500'}`}>
                                            On duty
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View className="mb-3 flex-row items-center gap-2">
                        <View className="flex-1 flex-row items-center rounded-2xl border-2 border-neutral-100 bg-white px-3">
                            <Search size={16} color="#64748B" />
                            <TextInput
                                value={searchText}
                                onChangeText={setSearchText}
                                placeholder="Search employee, type, purpose"
                                placeholderTextColor="#94A3B8"
                                className="ml-2 h-11 flex-1 text-sm text-neutral-800"
                            />
                            {searchText ? (
                                <TouchableOpacity onPress={() => setSearchText('')} className="p-1">
                                    <X size={14} color="#94A3B8" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        <TouchableOpacity
                            onPress={() => setFiltersOpen((v) => !v)}
                            className={`h-11 w-11 items-center justify-center rounded-2xl border-2 ${
                                filtersOpen ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-100 bg-white'
                            }`}
                        >
                            <Funnel size={16} color={filtersOpen ? '#047857' : '#475569'} />
                        </TouchableOpacity>
                    </View>

                    {filtersOpen ? (
                        <View className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white p-3">
                            <Text className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-500">Pay period</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-3">
                                <View className="flex-row gap-2 px-1">
                                    {payPeriodOptions.map((option) => (
                                        <TouchableOpacity
                                            key={option.value}
                                            onPress={() => setDateRange(option.range)}
                                            className={`rounded-full border px-3 py-2 ${
                                                payPeriodSelectValue === option.value ? 'border-emerald-400 bg-emerald-50' : 'border-neutral-200 bg-neutral-50'
                                            }`}
                                        >
                                            <Text
                                                className={`text-[10px] font-black uppercase ${
                                                    payPeriodSelectValue === option.value ? 'text-emerald-800' : 'text-neutral-600'
                                                }`}
                                            >
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                            <View className="flex-row gap-2">
                                <View className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                                    <Text className="pt-2 text-[9px] font-black uppercase tracking-wider text-neutral-500">From date</Text>
                                    <TextInput
                                        value={dateRange.from}
                                        onChangeText={(from) => setDateRange((prev) => ({ ...prev, from }))}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                        className="h-9 text-xs text-neutral-800"
                                    />
                                </View>
                                <View className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                                    <Text className="pt-2 text-[9px] font-black uppercase tracking-wider text-neutral-500">To date</Text>
                                    <TextInput
                                        value={dateRange.to}
                                        onChangeText={(to) => setDateRange((prev) => ({ ...prev, to }))}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                        className="h-9 text-xs text-neutral-800"
                                    />
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    setDateRange(getDefaultLeaveODDateRange(payCycleStartDay));
                                    setSearchText('');
                                    setFilter('all');
                                }}
                                className="mt-3 self-start rounded-lg bg-neutral-100 px-3 py-1.5"
                            >
                                <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-700">Clear all</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 -mx-1">
                        <View className="flex-row gap-2 px-1">
                            {FILTERS.map((f) => (
                                <TouchableOpacity
                                    key={f}
                                    onPress={() => setFilter(f)}
                                    className={`px-4 py-2 rounded-full border-2 ${filter === f ? 'bg-emerald-50 border-primary' : 'bg-white border-neutral-100'}`}
                                >
                                    <Text className={`font-bold text-xs capitalize ${filter === f ? 'text-emerald-900' : 'text-neutral-600'}`}>
                                        {f}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    {loading && !refreshing ? (
                        <View className="pb-28">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </View>
                    ) : rows.length === 0 ? (
                        <MotiView
                            from={{ opacity: 0, translateY: 12 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            className="bg-white rounded-[32px] p-10 items-center border-2 border-neutral-50 mb-24"
                        >
                            <View className="bg-emerald-50 w-20 h-20 rounded-[28px] items-center justify-center mb-6 border border-emerald-100">
                                <Calendar size={40} color="#10B981" strokeWidth={2.5} />
                            </View>
                            <Text className="text-neutral-900 font-black text-xl mb-2">No records</Text>
                            <Text className="text-neutral-500 text-center font-medium leading-6">
                                {filter === 'all'
                                    ? `You have no ${segment === 'leave' ? 'leave' : 'on-duty'} applications in this filter.`
                                    : `No ${filter} ${segment === 'leave' ? 'leaves' : 'ODs'} right now.`}
                            </Text>
                        </MotiView>
                    ) : (
                        <View className="gap-3 pb-28">
                            {rows.map((r, idx) => {
                                const st = String(r.status ?? '');
                                const badge = statusBadge(st);
                                const title =
                                    segment === 'leave'
                                        ? String(r.leaveType ?? 'Leave')
                                        : String(r.odType ?? 'On duty');
                                const meta = employeeDisplay(r);
                                return (
                                    <MotiView
                                        key={r._id}
                                        from={{ opacity: 0, translateY: 10 }}
                                        animate={{ opacity: 1, translateY: 0 }}
                                        transition={{ delay: idx * 40 }}
                                    >
                                        <TouchableOpacity
                                            onPress={() =>
                                                segment === 'leave'
                                                    ? router.push(`/leave/${r._id}`)
                                                    : router.push(`/od/${r._id}`)
                                            }
                                            activeOpacity={0.9}
                                            className="bg-white rounded-[28px] p-5 border-2 border-neutral-50 shadow-sm"
                                        >
                                            <View className="flex-row items-center">
                                                <View className="flex-1 min-w-0">
                                                    <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                                                        <Text className="text-neutral-900 font-black text-base flex-shrink">{title}</Text>
                                                        <View className={`px-2 py-0.5 rounded-full ${badge.wrap}`}>
                                                            <Text className={`text-[10px] font-black uppercase ${badge.text}`}>
                                                                {statusLabelShort(st, segment)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <Text className="text-neutral-500 text-sm font-bold">
                                                        {formatDateRangeIST(r.fromDate, r.toDate)}
                                                    </Text>
                                                    <Text className="text-neutral-400 text-[9px] font-bold uppercase tracking-wider mt-0.5">
                                                        IST
                                                    </Text>
                                                    {r.purpose ? (
                                                        <Text className="text-neutral-400 text-xs mt-2" numberOfLines={2}>
                                                            {r.purpose}
                                                        </Text>
                                                    ) : null}
                                                    {showEmployeeMeta ? (
                                                        <View className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                                            <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                                                {meta.empNo} · {meta.name}
                                                            </Text>
                                                            <Text className="mt-1 text-[10px] text-neutral-600">
                                                                {meta.designation} · {meta.division} · {meta.department}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                                <ChevronRight size={22} color="#94A3B8" strokeWidth={2.5} />
                                            </View>
                                            {scopeMode === 'team' &&
                                            hasActionPermission &&
                                            !['approved', 'rejected', 'cancelled'].includes(String(r.status || '').toLowerCase()) &&
                                            canCurrentUserActOnLeaveLikeItem({
                                                item: r as unknown as { status?: string; workflow?: { [k: string]: unknown }; odType?: string },
                                                user,
                                                isOD: segment === 'od',
                                                allowHigherAuthority: segment === 'od' ? odAllowHigherAuthority : leaveAllowHigherAuthority,
                                            }) ? (
                                                <View className="mt-4 flex-row gap-2">
                                                    <TouchableOpacity
                                                        onPress={() =>
                                                            Alert.alert('Approve request', 'Proceed with approval?', [
                                                                { text: 'No', style: 'cancel' },
                                                                { text: 'Approve', onPress: () => { void actionOnRow(r._id, 'approve'); } },
                                                            ])
                                                        }
                                                        className="flex-1 items-center rounded-xl bg-emerald-600 py-2.5"
                                                    >
                                                        <Text className="text-[10px] font-black uppercase tracking-widest text-white">Approve</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() =>
                                                            Alert.alert('Reject request', 'Proceed with rejection?', [
                                                                { text: 'No', style: 'cancel' },
                                                                { text: 'Reject', style: 'destructive', onPress: () => { void actionOnRow(r._id, 'reject'); } },
                                                            ])
                                                        }
                                                        className="flex-1 items-center rounded-xl bg-rose-600 py-2.5"
                                                    >
                                                        <Text className="text-[10px] font-black uppercase tracking-widest text-white">Reject</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : null}
                                        </TouchableOpacity>
                                    </MotiView>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
                )}

                <Modal visible={actionOpen} animationType="fade" transparent>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setActionOpen(false)}
                        className="flex-1 bg-black/50 justify-end"
                    >
                        <View className="bg-white rounded-t-[32px] p-6 pb-10 border-t-2 border-neutral-100">
                            <Text className="text-neutral-900 font-black text-lg mb-4">New request</Text>
                            {!canApply ? (
                                <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                    <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                        You only have read access for Leave/OD.
                                    </Text>
                                </View>
                            ) : null}
                            <TouchableOpacity
                                onPress={() => {
                                    setActionOpen(false);
                                    router.push('/apply-leave');
                                }}
                                className="py-4 rounded-2xl bg-emerald-500 mb-3 items-center"
                                disabled={!canApply}
                            >
                                <Text className="text-white font-black uppercase tracking-widest text-xs">Apply leave</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setActionOpen(false);
                                    router.push('/apply-od');
                                }}
                                className="py-4 rounded-2xl bg-neutral-900 mb-3 items-center"
                                disabled={!canApply}
                            >
                                <Text className="text-white font-black uppercase tracking-widest text-xs">Apply on duty (OD)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setActionOpen(false)} className="py-3 items-center">
                                <Text className="text-neutral-500 font-bold">Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        </View>
    );
}
