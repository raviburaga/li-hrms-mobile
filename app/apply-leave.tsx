import { useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Modal,
    Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { api, ApiEnvelope } from '../src/api/client';
import { useAuthStore } from '../src/store/useAuthStore';
import { DateField, formatYmd } from '../src/components/DateField';
import {
    buildCrossPayrollPeriodLeaveError,
    calcLeaveDayCount,
} from '../src/lib/leavePayrollPeriod';
import {
    computeCapTrackedEffectiveRemaining,
    resolvePooledMonthlyRemaining,
    fyBalanceForCapTrackedType,
    LeaveApplyPeriodContextData
} from '../src/lib/leaveApplyPeriodContext';
import {
    getApplyDateCheckBannerState,
} from '../src/lib/leaveApplyApprovedRecords';

type LeaveTypeOpt = { code: string; name: string; isActive?: boolean };

export default function ApplyLeaveScreen() {
    const router = useRouter();
    const { user, employee, setEmployee } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [types, setTypes] = useState<LeaveTypeOpt[]>([]);
    const [typeModal, setTypeModal] = useState(false);
    const [policyMin, setPolicyMin] = useState<Date>(() => new Date(Date.now() - 86400000 * 365));
    const [policyMax, setPolicyMax] = useState<Date>(() => new Date(Date.now() + 86400000 * 365));

    const [leaveType, setLeaveType] = useState('');
    const [fromDate, setFromDate] = useState(() => formatYmd(new Date()));
    const [toDate, setToDate] = useState(() => formatYmd(new Date()));
    const [purpose, setPurpose] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isHalfDay, setIsHalfDay] = useState(false);
    const [halfDayType, setHalfDayType] = useState<'first_half' | 'second_half'>('first_half');

    // Settings
    const [payCycleStartDay, setPayCycleStartDay] = useState(1);
    const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);

    // Context & Balance States
    const [clBalanceLoading, setClBalanceLoading] = useState(false);
    const [clBalanceForMonth, setClBalanceForMonth] = useState<number | null>(null);
    const [clMonthlyCap, setClMonthlyCap] = useState<number | null>(null);
    const [clAnnualBalance, setClAnnualBalance] = useState<number | null>(null);
    const [cclBalance, setCclBalance] = useState<number | null>(null);
    const [elBalance, setElBalance] = useState<number | null>(null);
    const [pendingDaysInCycle, setPendingDaysInCycle] = useState<number | null>(null);
    const [isCCLIncluded, setIsCCLIncluded] = useState(false);
    const [isELIncluded, setIsELIncluded] = useState(false);
    const [pooledLimit, setPooledLimit] = useState<number | null>(null);
    const [applyPeriodContext, setApplyPeriodContext] = useState<LeaveApplyPeriodContextData | null>(null);

    // Conflict Check States
    const [checkingApprovedRecords, setCheckingApprovedRecords] = useState(false);
    const [approvedRecordsInfo, setApprovedRecordsInfo] = useState<any | null>(null);

    const selectedLeaveTypeUpper = String(leaveType || '').toUpperCase();
    const isCapTrackedLeave = ['CL', 'CCL', 'EL'].includes(selectedLeaveTypeUpper);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                if (!employee && user?.emp_no) {
                    const er = await api.getEmployee(user.emp_no);
                    const body = er.data as ApiEnvelope;
                    if (body.success && body.data) setEmployee(body.data as never);
                }

                // Load leave settings
                const st = await api.getLeaveSettings('leave');
                const envelope = st.data as ApiEnvelope & {
                    data?: { types?: LeaveTypeOpt[]; settings?: Record<string, unknown> };
                };
                if (envelope.success && envelope.data?.types?.length) {
                    setTypes(envelope.data.types.filter((t) => t.isActive !== false));
                } else {
                    setTypes([
                        { code: 'CL', name: 'Casual Leave' },
                        { code: 'SL', name: 'Sick Leave' },
                        { code: 'EL', name: 'Earned Leave' },
                        { code: 'LWP', name: 'Leave Without Pay' },
                    ]);
                }
                const s = envelope.data?.settings;
                if (s) {
                    const today = new Date();
                    let minD = new Date(today.getTime() - 86400000 * 365);
                    let maxD = new Date(today.getTime() + 86400000 * 365);
                    const maxBack = Number(s.maxBackdatedDays ?? 30);
                    const maxAdv = Number(s.maxAdvanceDays ?? 90);
                    if (s.allowBackdated) {
                        minD = new Date(today.getTime() - 86400000 * maxBack);
                    }
                    if (s.allowFutureDated !== false) {
                        maxD = new Date(today.getTime() + 86400000 * maxAdv);
                    }
                    setPolicyMin(minD);
                    setPolicyMax(maxD);
                }

                // Load payroll cycle settings
                const [startRes, endRes] = await Promise.all([
                    api.getSetting('payroll_cycle_start_day'),
                    api.getSetting('payroll_cycle_end_day'),
                ]);
                if (startRes?.data?.success && startRes.data.data) {
                    const val = (startRes.data.data as any).value;
                    const startDay = parseInt(String(val), 10);
                    if (!isNaN(startDay) && startDay >= 1 && startDay <= 31) {
                        setPayCycleStartDay(startDay);
                    }
                }
                if (endRes?.data?.success && endRes.data.data) {
                    const val = (endRes.data.data as any).value;
                    const endDay = parseInt(String(val), 10);
                    if (!isNaN(endDay) && endDay >= 1 && endDay <= 31) {
                        setPayCycleEndDay(endDay);
                    }
                }
            } catch (err) {
                console.error('Initialization error:', err);
                Alert.alert('Error', 'Could not load leave settings');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [employee, user?.emp_no, setEmployee]);

    useEffect(() => {
        const emp = useAuthStore.getState().employee;
        const phone =
            (emp as { phone_number?: string } | null)?.phone_number || (user as { phone?: string } | null)?.phone || '';
        if (phone) setContactNumber(phone);
    }, [employee, user]);

    // Fetch leave apply period context (remaining balance, pool limits)
    useEffect(() => {
        if (!leaveType || !isCapTrackedLeave || !fromDate) {
            setApplyPeriodContext(null);
            setClBalanceForMonth(null);
            return;
        }

        const targetEmployeeId = employee?._id || user?.id || (user as any)?._id;
        if (!targetEmployeeId) return;

        let cancelled = false;
        const fetchContext = async () => {
            setClBalanceLoading(true);
            try {
                const res = await api.getLeaveApplyPeriodContext({
                    fromDate,
                    employeeId: String(targetEmployeeId),
                    leaveType: selectedLeaveTypeUpper,
                });
                if (cancelled) return;
                const envelope = res.data as ApiEnvelope;
                if (envelope.success && envelope.data) {
                    const d = envelope.data as LeaveApplyPeriodContextData;
                    setApplyPeriodContext(d);
                    if (!d.hasYearDoc || !d.hasSlot) {
                        setClBalanceForMonth(null);
                        setClMonthlyCap(null);
                        setPooledLimit(null);
                        setPendingDaysInCycle(null);
                        setCclBalance(null);
                        setElBalance(null);
                        setClAnnualBalance(null);
                        setIsCCLIncluded(false);
                        setIsELIncluded(false);
                        return;
                    }
                    const effectiveRemaining = computeCapTrackedEffectiveRemaining(d, selectedLeaveTypeUpper);
                    const pooledRem = resolvePooledMonthlyRemaining(d);
                    const ceiling = d.monthlyApplyCeiling != null
                        ? Number(d.monthlyApplyCeiling)
                        : pooledRem != null && d.monthlyApplyConsumed != null
                            ? Number(d.monthlyApplyConsumed) + pooledRem
                            : null;
                    setClMonthlyCap(ceiling);
                    setPooledLimit(ceiling);
                    setClBalanceForMonth(effectiveRemaining);
                    setPendingDaysInCycle(
                        d.monthlyApplyLocked != null ? Number(d.monthlyApplyLocked) : null
                    );
                    setCclBalance(d.balances?.ccl != null ? Number(d.balances.ccl) : null);
                    setElBalance(
                        d.includeELInMonthlyPool && d.balances?.el != null
                            ? Number(d.balances.el)
                            : null
                    );
                    setIsCCLIncluded(true);
                    setIsELIncluded(!!d.includeELInMonthlyPool);
                    setClAnnualBalance(
                        fyBalanceForCapTrackedType(d, selectedLeaveTypeUpper) ??
                        (d.balances?.cl != null ? Number(d.balances.cl) : null)
                    );
                } else {
                    setApplyPeriodContext(null);
                    setClBalanceForMonth(null);
                }
            } catch (err) {
                console.error('Failed to load leave apply period context:', err);
                if (!cancelled) {
                    setApplyPeriodContext(null);
                    setClBalanceForMonth(null);
                }
            } finally {
                if (!cancelled) setClBalanceLoading(false);
            }
        };

        fetchContext();
        return () => {
            cancelled = true;
        };
    }, [leaveType, fromDate, employee?._id, user?.id]);

    // Check approved records for conflict on single-day selections
    const isSingleDayApply = Boolean(fromDate) && (fromDate === toDate || !toDate);

    useEffect(() => {
        if (!fromDate || !isSingleDayApply) {
            setApprovedRecordsInfo(null);
            return;
        }

        const targetEmployeeId = employee?._id || user?.id || (user as any)?._id;
        const targetEmpNo = employee?.emp_no || user?.emp_no;
        if (!targetEmployeeId || !targetEmpNo) return;

        let cancelled = false;
        const checkApprovedRecords = async () => {
            setCheckingApprovedRecords(true);
            try {
                const res = await api.getApprovedRecordsForDate(
                    String(targetEmployeeId),
                    String(targetEmpNo),
                    fromDate
                );
                if (cancelled) return;
                const envelope = res.data as ApiEnvelope;
                if (envelope.success && envelope.data) {
                    setApprovedRecordsInfo(envelope.data);

                    // Auto-select opposite half if approved half-day exists (similar to web)
                    const data = envelope.data as any;
                    if (data.hasLeave && data.leaveInfo?.isHalfDay) {
                        const approvedHalf = data.leaveInfo.halfDayType;
                        if (approvedHalf === 'first_half') {
                            setIsHalfDay(true);
                            setHalfDayType('second_half');
                        } else if (approvedHalf === 'second_half') {
                            setIsHalfDay(true);
                            setHalfDayType('first_half');
                        }
                    } else if (data.hasOD && data.odInfo?.isHalfDay) {
                        const approvedHalf = data.odInfo.halfDayType;
                        if (approvedHalf === 'first_half') {
                            setIsHalfDay(true);
                            setHalfDayType('second_half');
                        } else if (approvedHalf === 'second_half') {
                            setIsHalfDay(true);
                            setHalfDayType('first_half');
                        }
                    }
                } else {
                    setApprovedRecordsInfo(null);
                }
            } catch (err) {
                console.error('Error checking approved records:', err);
                if (!cancelled) setApprovedRecordsInfo(null);
            } finally {
                if (!cancelled) setCheckingApprovedRecords(false);
            }
        };

        checkApprovedRecords();
        return () => {
            cancelled = true;
        };
    }, [fromDate, toDate, employee?._id, user?.id]);

    const applyDateCheckState = isSingleDayApply && approvedRecordsInfo ? getApplyDateCheckBannerState(approvedRecordsInfo, {
        applyType: 'leave',
        isHalfDay,
        halfDayType,
    }) : null;

    const applyDateBlocked = Boolean(applyDateCheckState?.blocked);

    const crossPeriodError = fromDate && toDate ? buildCrossPayrollPeriodLeaveError(
        fromDate,
        toDate,
        payCycleStartDay,
        payCycleEndDay
    ) : null;

    const requestedDays = calcLeaveDayCount(fromDate, toDate, isHalfDay);

    const hasInsufficientBalance = isCapTrackedLeave && clBalanceForMonth !== null && requestedDays > clBalanceForMonth;

    const validationError = (() => {
        if (!leaveType) return 'Select leave type';
        if (!fromDate || !toDate) return 'Select date range';
        if (fromDate > toDate) return 'From date cannot be after To date';
        if (crossPeriodError) return crossPeriodError;
        if (applyDateBlocked) return applyDateCheckState?.body || 'Date conflict detected';
        if (hasInsufficientBalance) {
            return `Insufficient balance. You have ${clBalanceForMonth} days remaining, but requested ${requestedDays} days.`;
        }
        return null;
    })();

    const selectedTypeLabel = types.find((t) => t.code === leaveType)?.name || leaveType || 'Select type';

    const onSubmit = async () => {
        if (validationError) {
            Alert.alert('Validation Error', validationError);
            return;
        }
        if (!leaveType || !fromDate || !toDate || !purpose.trim()) {
            Alert.alert('Required', 'Please fill leave type, dates, and purpose.');
            return;
        }
        const emp = useAuthStore.getState().employee;
        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                fromDate,
                toDate,
                purpose: purpose.trim(),
                contactNumber: contactNumber.trim(),
                remarks: remarks.trim() || undefined,
                isHalfDay,
                halfDayType: isHalfDay ? halfDayType : null,
                leaveType,
            };
            if (user?.role !== 'employee') {
                const empNo = emp?.emp_no || user?.emp_no;
                if (!empNo) {
                    setSubmitting(false);
                    Alert.alert('Employee', 'Select or link an employee for this request.');
                    return;
                }
                payload.empNo = empNo;
            }

            const res = await api.applyLeave(payload);
            const body = res.data as ApiEnvelope;
            if (body.success) {
                Alert.alert('Success', 'Leave applied successfully.', [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                Alert.alert('Failed', body.message || body.error || 'Could not submit');
            }
        } catch (e: unknown) {
            console.error('Leave apply failed:', e);
            const message = (() => {
                if (e && typeof e === 'object') {
                    const maybeResponse = (e as { response?: { data?: { message?: string; error?: string; details?: string; validationErrors?: string[] }; status?: number } }).response;
                    const body = maybeResponse?.data;
                    if (body) {
                        const detail = body.message || body.error || body.details || (body.validationErrors?.join('\n') ?? '');
                        if (detail) return detail;
                    }
                    if ('message' in e && typeof (e as Error).message === 'string') {
                        return (e as Error).message;
                    }
                }
                return 'Network error';
            })();
            Alert.alert('Error', message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pt-2 pb-4">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-12 h-12 rounded-2xl bg-white border-2 border-neutral-100 items-center justify-center mr-3"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest">New request</Text>
                        <Text className="text-neutral-900 text-xl font-black">Apply leave</Text>
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#10B981" />
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
                        <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">Leave type</Text>
                        <TouchableOpacity
                            onPress={() => setTypeModal(true)}
                            className="bg-white rounded-2xl border-2 border-neutral-100 px-4 py-3.5 mb-4"
                        >
                            <Text className="text-neutral-900 font-bold">{selectedTypeLabel}</Text>
                        </TouchableOpacity>

                        {isCapTrackedLeave && clBalanceLoading && (
                            <View className="bg-white rounded-2xl border-2 border-neutral-100 p-4 mb-4 items-center justify-center min-h-[100px]">
                                <ActivityIndicator size="small" color="#10B981" />
                                <Text className="text-neutral-400 text-xs font-bold mt-2">Checking balance & caps...</Text>
                            </View>
                        )}

                        {isCapTrackedLeave && !clBalanceLoading && clBalanceForMonth !== null && (
                            <View className="bg-white rounded-2xl border-2 border-emerald-100 p-4 mb-4">
                                <View className="flex-row items-center justify-between mb-3">
                                    <View>
                                        <Text className="text-neutral-400 text-[9px] font-black uppercase tracking-wider">Can still apply (this period)</Text>
                                        <View className="flex-row items-baseline mt-1">
                                            <Text className={`text-3xl font-black ${clBalanceForMonth <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                {clBalanceForMonth}
                                            </Text>
                                            <Text className="text-neutral-500 text-xs font-bold ml-1">days</Text>
                                        </View>
                                    </View>
                                    <View className={`rounded-full px-3 py-1 ${clBalanceForMonth <= 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                                        <Text className={`text-[10px] font-black uppercase tracking-wide ${clBalanceForMonth <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {clBalanceForMonth <= 0 ? 'Cap Used' : 'Room Left'}
                                        </Text>
                                    </View>
                                </View>

                                <View className="h-[1px] bg-neutral-100 my-2" />

                                <View className="flex-row justify-between flex-wrap gap-2">
                                    <View className="flex-1 min-w-[45%] bg-neutral-50 rounded-xl p-2.5">
                                        <Text className="text-neutral-400 text-[8px] font-black uppercase tracking-wider">FY Balance</Text>
                                        <Text className="text-neutral-800 text-sm font-bold mt-1">{clAnnualBalance ?? '—'} days</Text>
                                    </View>
                                    <View className="flex-1 min-w-[45%] bg-neutral-50 rounded-xl p-2.5">
                                        <Text className="text-neutral-400 text-[8px] font-black uppercase tracking-wider">Monthly Pool</Text>
                                        <Text className="text-neutral-800 text-sm font-bold mt-1">{pooledLimit ?? '—'} days</Text>
                                    </View>
                                </View>

                                {pendingDaysInCycle !== null && pendingDaysInCycle > 0 && (
                                    <View className="mt-3 bg-amber-50 rounded-xl p-2.5 flex-row items-center border border-amber-100">
                                        <Text className="text-amber-800 text-[10px] font-bold">
                                            ⚠️ {pendingDaysInCycle} days already pending in this period
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <DateField label="From date" value={fromDate} onChange={setFromDate} minimumDate={policyMin} maximumDate={policyMax} />
                        <DateField label="To date" value={toDate} onChange={setToDate} minimumDate={policyMin} maximumDate={policyMax} />

                        <View className="flex-row items-center justify-between bg-white rounded-2xl border-2 border-neutral-100 px-4 py-3 mb-4">
                            <Text className="text-neutral-900 font-bold">Half day</Text>
                            <Switch value={isHalfDay} onValueChange={setIsHalfDay} trackColor={{ true: '#A7F3D0' }} thumbColor={isHalfDay ? '#10B981' : '#f4f4f5'} />
                        </View>

                        {isHalfDay && (
                            <View className="flex-row gap-3 mb-4">
                                {(['first_half', 'second_half'] as const).map((h) => (
                                    <TouchableOpacity
                                        key={h}
                                        onPress={() => setHalfDayType(h)}
                                        className={`flex-1 py-3 rounded-2xl border-2 items-center ${halfDayType === h ? 'border-primary bg-emerald-50' : 'border-neutral-100 bg-white'}`}
                                    >
                                        <Text className="font-bold text-neutral-800">{h === 'first_half' ? 'First half' : 'Second half'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {checkingApprovedRecords && (
                            <View className="bg-neutral-50 rounded-2xl p-4 mb-4 flex-row items-center justify-center">
                                <ActivityIndicator size="small" color="#10B981" />
                                <Text className="text-neutral-400 text-xs font-bold ml-2">Checking date conflicts...</Text>
                            </View>
                        )}

                        {applyDateCheckState && (
                            <View className={`border-2 rounded-2xl p-4 mb-4 ${
                                applyDateCheckState.variant === 'error' ? 'bg-red-50 border-red-200' :
                                applyDateCheckState.variant === 'warning' ? 'bg-amber-50 border-amber-200' :
                                applyDateCheckState.variant === 'info' ? 'bg-blue-50 border-blue-200' :
                                'bg-emerald-50 border-emerald-200'
                            }`}>
                                <Text className={`font-bold text-sm mb-1 ${
                                    applyDateCheckState.variant === 'error' ? 'text-red-800' :
                                    applyDateCheckState.variant === 'warning' ? 'text-amber-800' :
                                    applyDateCheckState.variant === 'info' ? 'text-blue-800' :
                                    'text-emerald-800'
                                }`}>
                                    {applyDateCheckState.headline}
                                </Text>
                                <Text className={`text-xs font-medium leading-relaxed ${
                                    applyDateCheckState.variant === 'error' ? 'text-red-600' :
                                    applyDateCheckState.variant === 'warning' ? 'text-amber-600' :
                                    applyDateCheckState.variant === 'info' ? 'text-blue-600' :
                                    'text-emerald-600'
                                }`}>
                                    {applyDateCheckState.body}
                                </Text>
                            </View>
                        )}

                        {crossPeriodError && (
                            <View className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-4">
                                <Text className="text-red-800 font-bold text-sm mb-1">Payroll Period Conflict</Text>
                                <Text className="text-red-600 text-xs font-medium leading-relaxed">{crossPeriodError}</Text>
                            </View>
                        )}

                        {hasInsufficientBalance && (
                            <View className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-4">
                                <Text className="text-red-800 font-bold text-sm mb-1">Insufficient Balance</Text>
                                <Text className="text-red-600 text-xs font-medium leading-relaxed">
                                    You have {clBalanceForMonth} days remaining for this period, but you are requesting {requestedDays} days.
                                </Text>
                            </View>
                        )}

                        {requestedDays > 0 && (
                            <View className="bg-emerald-50 border-2 border-emerald-100 rounded-2xl px-4 py-3.5 mb-4 flex-row justify-between items-center">
                                <Text className="text-emerald-800 font-bold text-xs">Total Duration</Text>
                                <Text className="text-emerald-900 font-black text-sm">{requestedDays} Day{requestedDays === 1 ? '' : 's'}</Text>
                            </View>
                        )}

                        <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">Purpose *</Text>
                        <TextInput
                            value={purpose}
                            onChangeText={setPurpose}
                            placeholder="Reason for leave"
                            multiline
                            className="bg-white rounded-2xl border-2 border-neutral-100 px-4 py-3 min-h-[100px] text-neutral-900 font-medium mb-4"
                            placeholderTextColor="#94A3B8"
                            textAlignVertical="top"
                        />

                        <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">Contact number</Text>
                        <TextInput
                            value={contactNumber}
                            onChangeText={setContactNumber}
                            keyboardType="phone-pad"
                            className="bg-white rounded-2xl border-2 border-neutral-100 px-4 py-3 text-neutral-900 font-medium mb-4"
                            placeholderTextColor="#94A3B8"
                        />

                        <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">Remarks</Text>
                        <TextInput
                            value={remarks}
                            onChangeText={setRemarks}
                            placeholder="Optional"
                            className="bg-white rounded-2xl border-2 border-neutral-100 px-4 py-3 text-neutral-900 font-medium mb-8"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity
                            onPress={onSubmit}
                            disabled={submitting || !!validationError}
                            className={`mb-12 py-4 rounded-2xl items-center ${
                                submitting ? 'bg-emerald-300' :
                                validationError ? 'bg-neutral-200' : 'bg-primary'
                            }`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className={`font-black uppercase tracking-widest ${validationError ? 'text-neutral-400' : 'text-white'}`}>Submit</Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                )}

                <Modal visible={typeModal} animationType="slide" transparent>
                    <TouchableOpacity activeOpacity={1} onPress={() => setTypeModal(false)} className="flex-1 bg-black/40 justify-end">
                        <View className="bg-white rounded-t-3xl p-6 max-h-[70%]">
                            <Text className="text-neutral-900 font-black text-lg mb-4">Leave type</Text>
                            <ScrollView>
                                {types.map((t) => (
                                    <TouchableOpacity
                                        key={t.code}
                                        onPress={() => {
                                            setLeaveType(t.code);
                                            setTypeModal(false);
                                        }}
                                        className="py-4 border-b border-neutral-100"
                                    >
                                        <Text className="text-neutral-900 font-bold">{t.name}</Text>
                                        <Text className="text-neutral-400 text-xs">{t.code}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        </View>
    );
}
