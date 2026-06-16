import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Modal,
    Alert,
    Platform,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Timer, ShieldCheck, AlertCircle, ChevronRight, QrCode, Plus } from 'lucide-react-native';
import { useAuthStore } from '../../src/store/useAuthStore';
import { api, ApiEnvelope } from '../../src/api/client';
import {
    canViewOtPermissionsModule,
    canApplyOtFromApi,
    canApplyPermissionFromApi,
    canApproveOtPermissionFromApi,
} from '../../src/lib/permissions';
import { formatDateTimeIST, formatDateOnlyIST } from '../../src/utils/dateIST';
import {
    buildPayPeriodOptions,
    getDefaultLeaveODDateRange,
    matchPayPeriodValue,
    type PayPeriodRange,
} from '../../src/utils/payPeriodRange';

type MainTab = 'ot' | 'permissions' | 'pending';

function rowEmpName(row: Record<string, unknown>): string {
    const emp = row.employeeId as { employee_name?: string } | undefined;
    return (emp?.employee_name as string) || String(row.employeeNumber || '—');
}

function isTerminalOtStatus(status?: string): boolean {
    const s = String(status || '').toLowerCase();
    return ['approved', 'rejected', 'manager_rejected'].includes(s);
}

function isTerminalPermissionStatus(status?: string): boolean {
    const s = String(status || '').toLowerCase();
    return ['approved', 'rejected', 'checked_in', 'checked_out'].includes(s);
}

function canPerformAction(item: Record<string, unknown>, user: { id?: string; role?: string } | null): boolean {
    if (!item || !user) return false;
    const hasWorkflow = !!(item.workflow && Array.isArray((item.workflow as { approvalChain?: unknown[] }).approvalChain));
    if (hasWorkflow) {
        if ((item.workflow as { isCompleted?: boolean }).isCompleted) return false;
    } else {
        const st = String(item.status || '');
        if (st === 'approved' || st === 'rejected') return false;
    }
    if (String(user.role || '').toLowerCase() === 'super_admin') return true;
    const chain = (item.workflow as { approvalChain?: Array<{ isCurrent?: boolean; role?: string }> } | undefined)
        ?.approvalChain;
    if (chain?.length) {
        const currentStep = chain.find((step) => step.isCurrent);
        if (currentStep) {
            const currentRole = String(user.role || '').toLowerCase();
            const stepRole = String(currentStep.role || '').toLowerCase();
            if (currentRole === stepRole) return true;
            if (stepRole === 'reporting_manager' && ['manager', 'hod', 'super_admin'].includes(currentRole)) return true;
            return false;
        }
    }
    const isOT = 'otHours' in item || 'otInTime' in item;
    const isPermission = 'permissionHours' in item || 'permissionStartTime' in item;
    if (!canApproveOtPermissionFromApi(user as never)) return false;
    return !!(isOT || isPermission);
}

function permissionTypeLabel(t?: string): string {
    if (t === 'late_in') return 'Late in';
    if (t === 'early_out') return 'Early out';
    return 'Mid shift';
}

export default function OtPermissionsScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [mainTab, setMainTab] = useState<MainTab>(() => {
        const role = String(useAuthStore.getState().user?.role || '').toLowerCase();
        return role && role !== 'employee' ? 'pending' : 'ot';
    });
    const [otRows, setOtRows] = useState<Record<string, unknown>[]>([]);
    const [permRows, setPermRows] = useState<Record<string, unknown>[]>([]);
    const [payCycleStartDay, setPayCycleStartDay] = useState(1);
    const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<PayPeriodRange>(() => getDefaultLeaveODDateRange(1));
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [detail, setDetail] = useState<{ kind: 'ot' | 'permission'; row: Record<string, unknown> } | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    const [qrPayload, setQrPayload] = useState('');
    const [qrCaption, setQrCaption] = useState('');
    const [qrBusy, setQrBusy] = useState(false);

    const canView = canViewOtPermissionsModule(user);
    const canApplyOt = canApplyOtFromApi(user);
    const canApplyPerm = canApplyPermissionFromApi(user);
    const canApprove = canApproveOtPermissionFromApi(user);

    useEffect(() => {
        if (canApprove) setMainTab('pending');
    }, [canApprove]);

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

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const periodFilters = { startDate: dateRange.from, endDate: dateRange.to };
            if (mainTab === 'ot') {
                const res = await api.getOTRequests(periodFilters);
                const body = res.data as ApiEnvelope<unknown[]>;
                if (res.status === 200 && body.success && Array.isArray(body.data)) {
                    setOtRows(body.data as Record<string, unknown>[]);
                } else {
                    setOtRows([]);
                }
            } else if (mainTab === 'permissions') {
                const res = await api.getPermissions(periodFilters);
                const body = res.data as ApiEnvelope<unknown[]>;
                if (res.status === 200 && body.success && Array.isArray(body.data)) {
                    setPermRows(body.data as Record<string, unknown>[]);
                } else {
                    setPermRows([]);
                }
            } else {
                const [otRes, pRes] = await Promise.all([
                    api.getOTRequests({ ...periodFilters, status: 'pending' }),
                    api.getPermissions({ ...periodFilters, status: 'pending' }),
                ]);
                const otb = otRes.data as ApiEnvelope<unknown[]>;
                const pb = pRes.data as ApiEnvelope<unknown[]>;
                setOtRows(otRes.status === 200 && otb.success && Array.isArray(otb.data) ? (otb.data as Record<string, unknown>[]) : []);
                setPermRows(pRes.status === 200 && pb.success && Array.isArray(pb.data) ? (pb.data as Record<string, unknown>[]) : []);
            }
        } catch {
            setOtRows([]);
            setPermRows([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [dateRange.from, dateRange.to, mainTab]);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load])
    );

    const pendingOTs = useMemo(
        () => otRows.filter((r) => !isTerminalOtStatus(String(r.status)) && canPerformAction(r, user)),
        [otRows, user]
    );
    const pendingPerms = useMemo(
        () => permRows.filter((r) => !isTerminalPermissionStatus(String(r.status)) && canPerformAction(r, user)),
        [permRows, user]
    );
    const pendingCount = pendingOTs.length + pendingPerms.length;

    const openQr = (value: string, caption: string) => {
        if (!value) {
            Alert.alert('QR', 'No QR payload available yet.');
            return;
        }
        setQrPayload(value);
        setQrCaption(caption);
        setQrOpen(true);
    };

    const fetchMidShiftOutpass = async (id: string) => {
        setQrBusy(true);
        try {
            const res = await api.getPermissionQR(id);
            const body = res.data as ApiEnvelope & {
                data?: { qrCode?: string };
            };
            if (res.status === 200 && body.success && body.data?.qrCode) {
                openQr(String(body.data.qrCode), 'Outpass (approved permission)');
            } else {
                Alert.alert('QR', body.message || body.error || 'Could not load QR');
            }
        } catch {
            Alert.alert('QR', 'Network error');
        } finally {
            setQrBusy(false);
        }
    };

    const generateGate = async (type: 'OUT' | 'IN', perm: Record<string, unknown>) => {
        const id = String(perm._id || '');
        if (!id) return;
        setQrBusy(true);
        try {
            const res = type === 'OUT' ? await api.generateGateOutQR(id) : await api.generateGateInQR(id);
            const body = res.data as { success?: boolean; qrSecret?: string; message?: string };
            if (res.status === 200 && body.success && body.qrSecret) {
                openQr(body.qrSecret, type === 'OUT' ? 'Gate out — scan at security' : 'Gate in — scan at security');
                void load();
                setDetail((d) =>
                    d && d.kind === 'permission' && String(d.row._id) === id
                        ? { ...d, row: { ...d.row, qrCode: body.qrSecret } }
                        : d
                );
            } else {
                Alert.alert('Gate QR', body.message || 'Could not generate');
            }
        } catch {
            Alert.alert('Gate QR', 'Network error');
        } finally {
            setQrBusy(false);
        }
    };

    const onApprove = async (kind: 'ot' | 'permission', id: string) => {
        Alert.alert('Approve', `Approve this ${kind === 'ot' ? 'OT' : 'permission'} request?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Approve',
                onPress: async () => {
                    try {
                        const res =
                            kind === 'ot' ? await api.approveOT(id) : await api.approvePermission(id);
                        const body = res.data as ApiEnvelope;
                        if (res.status === 200 && body.success) {
                            Alert.alert('Done', 'Approved.');
                            setDetail(null);
                            void load();
                        } else {
                            Alert.alert('Failed', body.message || body.error || 'Request failed');
                        }
                    } catch {
                        Alert.alert('Error', 'Network error');
                    }
                },
            },
        ]);
    };

    const runReject = async (kind: 'ot' | 'permission', id: string, reason: string) => {
        try {
            const res = kind === 'ot' ? await api.rejectOT(id, reason) : await api.rejectPermission(id, reason);
            const body = res.data as ApiEnvelope;
            if (res.status === 200 && body.success) {
                Alert.alert('Done', 'Rejected.');
                setDetail(null);
                void load();
            } else {
                Alert.alert('Failed', body.message || body.error || 'Request failed');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        }
    };

    const onReject = (kind: 'ot' | 'permission', id: string) => {
        if (Platform.OS === 'ios') {
            Alert.prompt('Reject', 'Reason (optional)', (text) => void runReject(kind, id, text?.trim() || 'Rejected'));
        } else {
            Alert.alert('Reject', 'Send rejection with a default reason?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => void runReject(kind, id, 'Rejected from mobile') },
            ]);
        }
    };

    const renderPermissionQrActions = (perm: Record<string, unknown>) => {
        const id = String(perm._id || '');
        const status = String(perm.status || '');
        const pType = String(perm.permissionType || 'mid_shift');
        const qrCode = perm.qrCode ? String(perm.qrCode) : '';
        const gateOut = !!(perm as { gateOutTime?: string }).gateOutTime;
        const gateIn = !!(perm as { gateInTime?: string }).gateInTime;

        if (!['approved', 'checked_out', 'checked_in'].includes(status)) {
            return null;
        }

        const showScanningQr = qrCode && (qrCode.startsWith('OUT:') || qrCode.startsWith('IN:'));

        return (
            <View className="mt-4 border-t border-neutral-100 pt-4">
                <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Gate & QR</Text>
                {showScanningQr ? (
                    <TouchableOpacity
                        onPress={() => openQr(qrCode, qrCode.startsWith('OUT:') ? 'Gate out' : 'Gate in')}
                        className="mb-2 flex-row items-center justify-center rounded-2xl border-2 border-emerald-200 bg-emerald-50 py-3"
                    >
                        <QrCode size={20} color="#047857" />
                        <Text className="ml-2 font-black text-emerald-800">Show active gate QR</Text>
                    </TouchableOpacity>
                ) : null}

                {pType === 'mid_shift' && status === 'approved' ? (
                    <TouchableOpacity
                        onPress={() => void fetchMidShiftOutpass(id)}
                        disabled={qrBusy}
                        className="mb-2 rounded-2xl border-2 border-neutral-200 bg-white py-3"
                    >
                        <Text className="text-center text-xs font-black text-neutral-800">Load outpass QR (mid-shift)</Text>
                    </TouchableOpacity>
                ) : null}

                {pType === 'early_out' && status === 'approved' && !gateOut ? (
                    <TouchableOpacity
                        onPress={() => void generateGate('OUT', perm)}
                        disabled={qrBusy}
                        className="mb-2 rounded-2xl bg-amber-500 py-3"
                    >
                        <Text className="text-center text-xs font-black text-white">Generate gate OUT QR</Text>
                    </TouchableOpacity>
                ) : null}

                {pType === 'late_in' && status === 'approved' && !gateIn ? (
                    <TouchableOpacity
                        onPress={() => void generateGate('IN', perm)}
                        disabled={qrBusy}
                        className="mb-2 rounded-2xl bg-indigo-600 py-3"
                    >
                        <Text className="text-center text-xs font-black text-white">Generate gate IN QR</Text>
                    </TouchableOpacity>
                ) : null}

                {pType === 'mid_shift' && status === 'approved' && !gateOut ? (
                    <TouchableOpacity
                        onPress={() => void generateGate('OUT', perm)}
                        disabled={qrBusy}
                        className="mb-2 rounded-2xl bg-amber-500 py-3"
                    >
                        <Text className="text-center text-xs font-black text-white">Generate gate OUT QR</Text>
                    </TouchableOpacity>
                ) : null}

                {pType === 'mid_shift' && status === 'approved' && gateOut && !gateIn ? (
                    <TouchableOpacity
                        onPress={() => void generateGate('IN', perm)}
                        disabled={qrBusy}
                        className="rounded-2xl bg-indigo-600 py-3"
                    >
                        <Text className="text-center text-xs font-black text-white">Generate gate IN QR</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        );
    };

    if (!canView) {
        return (
            <View className="flex-1 items-center justify-center bg-white px-8">
                <StatusBar style="dark" />
                <ShieldCheck size={40} color="#CBD5E1" />
                <Text className="mt-4 text-center text-base font-black text-neutral-800">OT & permissions</Text>
                <Text className="mt-2 text-center text-sm text-neutral-500">This module is not enabled for your account.</Text>
            </View>
        );
    }

    const tabBtn = (key: MainTab, label: string, Icon: typeof Timer, count?: number) => (
        <TouchableOpacity
            key={key}
            onPress={() => {
                setMainTab(key);
            }}
            className={`mr-2 flex-1 flex-row items-center justify-center rounded-2xl border-2 px-2 py-3 ${
                mainTab === key ? 'border-emerald-500 bg-emerald-50' : 'border-neutral-100 bg-white'
            }`}
        >
            <Icon size={16} color={mainTab === key ? '#047857' : '#94A3B8'} />
            <Text
                className={`ml-1 text-center text-[9px] font-black uppercase tracking-tight ${
                    mainTab === key ? 'text-emerald-900' : 'text-neutral-500'
                }`}
                numberOfLines={1}
            >
                {label}
                {typeof count === 'number' && count > 0 ? ` (${count})` : ''}
            </Text>
        </TouchableOpacity>
    );

    const listOt = mainTab === 'pending' ? pendingOTs : otRows;
    const listPerm = mainTab === 'pending' ? pendingPerms : permRows;

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="px-6 pb-3 pt-4">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Workspace</Text>
                    <Text className="text-2xl font-black text-neutral-900">OT & permissions</Text>
                    <View className="mt-4 flex-row">
                        {tabBtn('ot', 'OT', Timer)}
                        {tabBtn('permissions', 'Perms', ShieldCheck)}
                        {tabBtn('pending', 'Action', AlertCircle, pendingCount)}
                    </View>
                    <View className="mt-3 flex-row gap-2">
                        {canApplyOt ? (
                            <TouchableOpacity
                                onPress={() => router.push('/apply-ot')}
                                className="flex-1 flex-row items-center justify-center rounded-2xl border-2 border-emerald-200 bg-white py-3"
                            >
                                <Plus size={18} color="#059669" />
                                <Text className="ml-1 text-[10px] font-black uppercase text-emerald-800">Apply OT</Text>
                            </TouchableOpacity>
                        ) : null}
                        {canApplyPerm ? (
                            <TouchableOpacity
                                onPress={() => router.push('/apply-permission')}
                                className="flex-1 flex-row items-center justify-center rounded-2xl border-2 border-indigo-200 bg-white py-3"
                            >
                                <Plus size={18} color="#4F46E5" />
                                <Text className="ml-1 text-[10px] font-black uppercase text-indigo-800">Apply perm</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <View className="mt-3 rounded-2xl border-2 border-neutral-100 bg-white p-3">
                        <Text className="mb-2 text-[9px] font-black uppercase tracking-widest text-neutral-400">Pay period</Text>
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
                                    className="h-9 text-xs font-bold text-neutral-800"
                                />
                            </View>
                            <View className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                                <Text className="pt-2 text-[9px] font-black uppercase tracking-wider text-neutral-500">To date</Text>
                                <TextInput
                                    value={dateRange.to}
                                    onChangeText={(to) => setDateRange((prev) => ({ ...prev, to }))}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#94A3B8"
                                    className="h-9 text-xs font-bold text-neutral-800"
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {loading && !refreshing ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#10B981" />
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1 px-6"
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#10B981" />
                        }
                    >
                        {mainTab !== 'permissions' ? (
                            <>
                                <Text className="mb-2 text-xs font-black uppercase tracking-widest text-neutral-400">
                                    {mainTab === 'pending' ? 'Pending OT' : 'Overtime requests'}
                                </Text>
                                {listOt.length === 0 ? (
                                    <Text className="mb-6 text-sm text-neutral-500">No OT records.</Text>
                                ) : (
                                    listOt.map((row) => (
                                        <TouchableOpacity
                                            key={String(row._id)}
                                            onPress={() => setDetail({ kind: 'ot', row })}
                                            activeOpacity={0.85}
                                            className="mb-3 flex-row items-center rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm"
                                        >
                                            <View className="min-w-0 flex-1">
                                                <Text className="text-sm font-black text-neutral-900" numberOfLines={1}>
                                                    {rowEmpName(row)}
                                                </Text>
                                                <Text className="text-[10px] text-neutral-500">
                                                    {formatDateOnlyIST(row.date as string)} · {String(row.status || '').toUpperCase()}
                                                </Text>
                                                <Text className="text-[10px] text-neutral-400">
                                                    OT hrs: {String(row.otHours ?? '—')}
                                                </Text>
                                            </View>
                                            <ChevronRight size={18} color="#CBD5E1" />
                                        </TouchableOpacity>
                                    ))
                                )}
                            </>
                        ) : null}

                        {mainTab !== 'ot' ? (
                            <>
                                <Text className="mb-2 mt-2 text-xs font-black uppercase tracking-widest text-neutral-400">
                                    {mainTab === 'pending' ? 'Pending permissions' : 'Permission requests'}
                                </Text>
                                {listPerm.length === 0 ? (
                                    <Text className="mb-24 text-sm text-neutral-500">No permission records.</Text>
                                ) : (
                                    listPerm.map((row) => (
                                        <TouchableOpacity
                                            key={String(row._id)}
                                            onPress={() => setDetail({ kind: 'permission', row })}
                                            activeOpacity={0.85}
                                            className="mb-3 flex-row items-center rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm"
                                        >
                                            <View className="min-w-0 flex-1">
                                                <Text className="text-sm font-black text-neutral-900" numberOfLines={1}>
                                                    {rowEmpName(row)}
                                                </Text>
                                                <Text className="text-[10px] text-neutral-500">
                                                    {formatDateOnlyIST(row.date as string)} ·{' '}
                                                    {permissionTypeLabel(String(row.permissionType))}
                                                </Text>
                                                <Text className="text-[10px] text-neutral-400" numberOfLines={1}>
                                                    {String(row.status || '').toUpperCase()}
                                                </Text>
                                            </View>
                                            <ChevronRight size={18} color="#CBD5E1" />
                                        </TouchableOpacity>
                                    ))
                                )}
                            </>
                        ) : null}

                        <View className="h-24" />
                    </ScrollView>
                )}
            </SafeAreaView>

            <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
                <View className="flex-1 justify-end bg-black/40">
                    <View className="max-h-[88%] rounded-t-3xl border border-neutral-100 bg-white px-5 pb-8 pt-4">
                        <View className="mb-3 h-1 w-10 self-center rounded-full bg-neutral-200" />
                        <Text className="text-lg font-black text-neutral-900">
                            {detail?.kind === 'ot' ? 'OT detail' : 'Permission detail'}
                        </Text>
                        {detail ? (
                            <ScrollView className="mt-2" showsVerticalScrollIndicator={false}>
                                <Text className="text-sm font-bold text-neutral-800">{rowEmpName(detail.row)}</Text>
                                <Text className="mt-1 text-xs text-neutral-500">Status: {String(detail.row.status)}</Text>
                                {detail.kind === 'ot' ? (
                                    <>
                                        <Text className="mt-2 text-xs text-neutral-600">
                                            Date: {formatDateOnlyIST(detail.row.date as string)}
                                        </Text>
                                        <Text className="mt-1 text-xs text-neutral-600">
                                            Hours: {String(detail.row.otHours ?? '—')}
                                        </Text>
                                        <Text className="mt-1 text-xs text-neutral-600">
                                            Window: {formatDateTimeIST(detail.row.otInTime)} → {formatDateTimeIST(detail.row.otOutTime)}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Text className="mt-2 text-xs text-neutral-600">
                                            Type: {permissionTypeLabel(String(detail.row.permissionType))}
                                        </Text>
                                        <Text className="mt-1 text-xs text-neutral-600">
                                            Date: {formatDateOnlyIST(detail.row.date as string)}
                                        </Text>
                                        <Text className="mt-1 text-xs text-neutral-600" numberOfLines={4}>
                                            Purpose: {String(detail.row.purpose || '—')}
                                        </Text>
                                        {renderPermissionQrActions(detail.row)}
                                    </>
                                )}

                                {canApprove && detail && canPerformAction(detail.row, user) ? (
                                    <View className="mt-6 flex-row gap-2">
                                        <TouchableOpacity
                                            onPress={() => onApprove(detail.kind, String(detail.row._id))}
                                            className="flex-1 rounded-2xl bg-emerald-600 py-3"
                                        >
                                            <Text className="text-center text-xs font-black text-white">Approve</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => onReject(detail.kind, String(detail.row._id))}
                                            className="flex-1 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3"
                                        >
                                            <Text className="text-center text-xs font-black text-rose-700">Reject</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : null}

                                <TouchableOpacity onPress={() => setDetail(null)} className="mt-4 py-2">
                                    <Text className="text-center text-sm font-bold text-neutral-400">Close</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        ) : null}
                    </View>
                </View>
            </Modal>

            <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
                <View className="flex-1 items-center justify-center bg-black/70 px-6">
                    <Text className="mb-3 text-center text-sm font-black text-white">{qrCaption}</Text>
                    <View className="rounded-3xl bg-white p-6">
                        {qrPayload ? <QRCode value={qrPayload} size={220} /> : null}
                    </View>
                    <TouchableOpacity onPress={() => setQrOpen(false)} className="mt-8 rounded-full bg-white px-8 py-3">
                        <Text className="font-black text-neutral-900">Close</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View>
    );
}
