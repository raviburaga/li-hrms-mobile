import { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Receipt, ChevronRight, Search, RefreshCw } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, ApiEnvelope } from '../../src/api/client';
import {
    canViewPayslipsModule,
    canViewScopedPayslips,
    isSelfPayslipView,
    isManagementRole,
    permissionDebugSummary,
} from '../../src/lib/permissions';
import { useAuthStore } from '../../src/store/useAuthStore';
import { SkeletonCard } from '../../src/components/Skeleton';
import { defaultPayslipListMonth, formatInr } from '../../src/lib/payslipFormat';

const SELF_PAGE_SIZE = 6;

type OrgNode = string | { _id?: string; name?: string };
type PayslipRow = {
    _id: string;
    emp_no?: string;
    month?: string;
    monthName?: string;
    year?: number;
    status?: string;
    netSalary?: number;
    isReleased?: boolean;
    earnings?: { grossSalary?: number };
    deductions?: { totalDeductions?: number };
    employeeId?: {
        emp_no?: string;
        employee_name?: string;
        designation_id?: OrgNode;
        department_id?: OrgNode & { division?: OrgNode };
    };
};

function nodeName(v: unknown): string {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '—');
    return '—';
}

function statusBadge(status: string): { wrap: string; text: string } {
    const s = (status || '').toLowerCase();
    if (s === 'processed' || s === 'approved') return { wrap: 'bg-emerald-100', text: 'text-emerald-800' };
    if (s === 'calculated') return { wrap: 'bg-amber-100', text: 'text-amber-900' };
    return { wrap: 'bg-neutral-100', text: 'text-neutral-700' };
}

function employeeLine(row: PayslipRow): { empNo: string; name: string; dept: string } {
    const emp = row.employeeId;
    return {
        empNo: String(emp?.emp_no || row.emp_no || '—'),
        name: String(emp?.employee_name || '—'),
        dept: nodeName(emp?.department_id),
    };
}

function rowAmounts(row: PayslipRow) {
    const earnings = Number(row.earnings?.grossSalary ?? 0);
    const deductions = Number(row.deductions?.totalDeductions ?? 0);
    const net = Number(row.netSalary ?? earnings - deductions);
    return { earnings, deductions, net };
}

export default function PayslipsScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isSelfView = isSelfPayslipView(user);
    const isScopedView = canViewScopedPayslips(user);
    const canViewModule = canViewPayslipsModule(user);
    const showEmployeeMeta = isManagementRole(user) && isScopedView;

    const [selectedMonth, setSelectedMonth] = useState(() => (isSelfView ? '' : defaultPayslipListMonth()));
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [rows, setRows] = useState<PayslipRow[]>([]);
    const [selfPage, setSelfPage] = useState(1);
    const [selfHasMore, setSelfHasMore] = useState(false);
    const [selfTotal, setSelfTotal] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchRows = useCallback(
        async (opts?: { page?: number; append?: boolean; refresh?: boolean }) => {
            const page = opts?.page ?? 1;
            const append = opts?.append ?? false;
            const refresh = opts?.refresh ?? false;

            if (!isSelfView && !selectedMonth.trim()) {
                setRows([]);
                setLoading(false);
                setRefreshing(false);
                return;
            }

            if (append) setLoadingMore(true);
            else if (!refresh) setLoading(true);
            setLoadError(null);

            try {
                const res = await api.getPayrollRecords({
                    month: selectedMonth.trim() || undefined,
                    page: isSelfView ? page : undefined,
                    limit: isSelfView ? SELF_PAGE_SIZE : undefined,
                });
                const body = res.data as ApiEnvelope<PayslipRow[]> & {
                    total?: number;
                    hasMore?: boolean;
                };
                if (!body.success) {
                    setLoadError(body.message || body.error || 'Could not load payslips');
                    if (!append) setRows([]);
                    return;
                }
                const list = Array.isArray(body.data) ? body.data : [];
                if (isSelfView && append) {
                    setRows((prev) => [...prev, ...list]);
                } else {
                    setRows(list);
                }
                if (isSelfView) {
                    setSelfHasMore(Boolean(body.hasMore));
                    setSelfTotal(body.total ?? list.length);
                    setSelfPage(page);
                }
            } catch (e) {
                setLoadError(e instanceof Error ? e.message : 'Could not load payslips');
                if (!append) setRows([]);
            } finally {
                setLoading(false);
                setLoadingMore(false);
                setRefreshing(false);
            }
        },
        [isSelfView, selectedMonth]
    );

    useFocusEffect(
        useCallback(() => {
            if (isSelfView) {
                fetchRows({ page: 1, append: false });
            } else if (selectedMonth.trim()) {
                fetchRows({ page: 1, append: false });
            } else {
                setLoading(false);
            }
        }, [fetchRows, isSelfView, selectedMonth])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchRows({ page: 1, append: false, refresh: true });
    };

    const onLoadMore = () => {
        if (!isSelfView || !selfHasMore || loadingMore) return;
        fetchRows({ page: selfPage + 1, append: true });
    };

    const filteredRows = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        if (!q || isSelfView) return rows;
        return rows.filter((row) => {
            const meta = employeeLine(row);
            const hay = [
                meta.empNo,
                meta.name,
                meta.dept,
                row.monthName,
                String(row.year ?? ''),
                row.month,
                row.status,
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [rows, searchText, isSelfView]);

    const headerTitle = isSelfView ? 'My payslips' : 'Employee payslips';
    const headerSubtitle = isSelfView
        ? 'View your released payslips — newest first'
        : 'Select a pay period to view scoped employee payslips';

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                {!canViewModule ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-center font-semibold text-neutral-700">
                            You do not have access to Payslips.
                        </Text>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1 px-6 pt-6"
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
                        }
                    >
                        <View className="mb-6">
                            <View className="mb-1 flex-row items-center">
                                <View className="mr-2 h-1 w-8 rounded-full bg-primary" />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                                    Payroll
                                </Text>
                            </View>
                            <Text className="text-3xl font-black tracking-tight text-neutral-900">
                                Payslip<Text className="text-primary">.</Text>s
                            </Text>
                            <Text className="mt-1 text-sm font-medium text-neutral-500">{headerSubtitle}</Text>
                            {__DEV__ ? (
                                <Text className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                                    {permissionDebugSummary(user)}
                                </Text>
                            ) : null}
                        </View>

                        <View className="mb-4 flex-row flex-wrap gap-2">
                            <View className="min-w-[44%] flex-1 rounded-2xl border border-neutral-100 bg-white p-4">
                                <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                    {isSelfView ? 'Loaded' : 'Found'}
                                </Text>
                                <Text className="mt-1 text-xl font-black text-neutral-900">{filteredRows.length}</Text>
                            </View>
                            {isSelfView ? (
                                <View className="min-w-[44%] flex-1 rounded-2xl border border-neutral-100 bg-white p-4">
                                    <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                        Total available
                                    </Text>
                                    <Text className="mt-1 text-xl font-black text-neutral-900">{selfTotal}</Text>
                                </View>
                            ) : null}
                        </View>

                        <View className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white p-4">
                            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                {isSelfView ? 'Filter by month (optional)' : 'Pay period *'}
                            </Text>
                            <TextInput
                                value={selectedMonth}
                                onChangeText={setSelectedMonth}
                                placeholder="YYYY-MM"
                                autoCapitalize="none"
                                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-sm text-neutral-900"
                            />
                            {!isSelfView ? (
                                <TouchableOpacity
                                    onPress={() => fetchRows({ page: 1, append: false })}
                                    disabled={!selectedMonth.trim() || loading}
                                    className="mt-3 flex-row items-center justify-center rounded-xl bg-primary py-3 opacity-100 disabled:opacity-50"
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <>
                                            <RefreshCw size={16} color="#fff" strokeWidth={2.5} />
                                            <Text className="ml-2 text-xs font-black uppercase tracking-widest text-white">
                                                Load payslips
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {!isSelfView ? (
                            <View className="mb-4 flex-row items-center rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3">
                                <Search size={18} color="#94A3B8" />
                                <TextInput
                                    value={searchText}
                                    onChangeText={setSearchText}
                                    placeholder="Search emp ID or name…"
                                    className="ml-2 flex-1 text-sm text-neutral-900"
                                />
                            </View>
                        ) : null}

                        {loadError ? (
                            <View className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                <Text className="text-sm font-semibold text-rose-800">{loadError}</Text>
                            </View>
                        ) : null}

                        {loading ? (
                            <>
                                <SkeletonCard />
                                <SkeletonCard />
                            </>
                        ) : filteredRows.length === 0 ? (
                            <View className="mb-24 items-center rounded-3xl border border-neutral-100 bg-white px-6 py-12">
                                <Receipt size={40} color="#CBD5E1" strokeWidth={1.5} />
                                <Text className="mt-4 text-center text-sm font-semibold text-neutral-700">
                                    {isSelfView
                                        ? 'No released payslips yet. They appear here after HR releases them.'
                                        : selectedMonth.trim()
                                          ? 'No payslips match your filters.'
                                          : 'Select a pay period to begin.'}
                                </Text>
                            </View>
                        ) : (
                            <>
                                {filteredRows.map((row) => {
                                    const badge = statusBadge(String(row.status || ''));
                                    const meta = employeeLine(row);
                                    const amounts = rowAmounts(row);
                                    return (
                                        <TouchableOpacity
                                            key={row._id}
                                            onPress={() => router.push(`/payslip/${row._id}`)}
                                            activeOpacity={0.85}
                                            className="mb-3 rounded-3xl border-2 border-neutral-100 bg-white p-4"
                                        >
                                            {showEmployeeMeta ? (
                                                <View className="mb-3 border-b border-neutral-100 pb-3">
                                                    <Text className="text-sm font-black text-neutral-900">{meta.name}</Text>
                                                    <Text className="mt-0.5 text-[11px] text-neutral-500">
                                                        {meta.empNo} · {meta.dept}
                                                    </Text>
                                                </View>
                                            ) : null}
                                            <View className="flex-row items-start justify-between">
                                                <View className="flex-1 pr-2">
                                                    <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                        Pay period
                                                    </Text>
                                                    <Text className="text-base font-black text-neutral-900">
                                                        {row.monthName} {row.year}
                                                    </Text>
                                                </View>
                                                <View className={`rounded-full px-3 py-1 ${badge.wrap}`}>
                                                    <Text className={`text-[10px] font-black uppercase ${badge.text}`}>
                                                        {row.status || '—'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View className="mt-3 flex-row flex-wrap gap-2">
                                                <View className="min-w-[30%] flex-1 rounded-xl bg-emerald-50 px-3 py-2">
                                                    <Text className="text-[9px] font-bold uppercase text-emerald-700">
                                                        Earnings
                                                    </Text>
                                                    <Text className="text-xs font-black text-emerald-900">
                                                        {formatInr(amounts.earnings)}
                                                    </Text>
                                                </View>
                                                <View className="min-w-[30%] flex-1 rounded-xl bg-rose-50 px-3 py-2">
                                                    <Text className="text-[9px] font-bold uppercase text-rose-700">
                                                        Deductions
                                                    </Text>
                                                    <Text className="text-xs font-black text-rose-900">
                                                        {formatInr(amounts.deductions)}
                                                    </Text>
                                                </View>
                                                <View className="min-w-[30%] flex-1 rounded-xl bg-neutral-900 px-3 py-2">
                                                    <Text className="text-[9px] font-bold uppercase text-neutral-300">
                                                        Net pay
                                                    </Text>
                                                    <Text className="text-xs font-black text-white">
                                                        {formatInr(amounts.net)}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View className="mt-3 flex-row items-center justify-end">
                                                <Text className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                                    View payslip
                                                </Text>
                                                <ChevronRight size={16} color="#10B981" strokeWidth={2.5} />
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}

                                {isSelfView && selfHasMore ? (
                                    <TouchableOpacity
                                        onPress={onLoadMore}
                                        disabled={loadingMore}
                                        className="mb-24 items-center rounded-2xl border-2 border-neutral-100 bg-white py-4"
                                    >
                                        {loadingMore ? (
                                            <ActivityIndicator color="#10B981" />
                                        ) : (
                                            <Text className="text-xs font-black uppercase tracking-widest text-primary">
                                                Load older payslips
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    <View className="mb-24" />
                                )}
                            </>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        </View>
    );
}
