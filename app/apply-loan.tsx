import { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { api, ApiEnvelope } from '../src/api/client';
import { useAuthStore } from '../src/store/useAuthStore';
import { canApplyLoans } from '../src/lib/permissions';
import { ApplyWriteGate } from '../src/components/ApplyWriteGate';

type EmployeeOpt = {
    _id?: string;
    emp_no?: string;
    employee_name?: string;
    department?: { name?: string };
};

export default function ApplyLoanScreen() {
    const router = useRouter();
    const { user, employee, setEmployee } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [requestType, setRequestType] = useState<'loan' | 'salary_advance'>('loan');
    const [amount, setAmount] = useState('');
    const [duration, setDuration] = useState('');
    const [reason, setReason] = useState('');
    const [remarks, setRemarks] = useState('');
    const [allEmployees, setAllEmployees] = useState<EmployeeOpt[]>([]);
    const [guarantorSearch, setGuarantorSearch] = useState('');
    const [guarantorEmpNos, setGuarantorEmpNos] = useState<string[]>([]);
    const [guarantorOpen, setGuarantorOpen] = useState(false);
    const [eligibilityText, setEligibilityText] = useState('');
    const [eligibilityMaxAllowed, setEligibilityMaxAllowed] = useState<number | null>(null);
    const [baseSettings, setBaseSettings] = useState<Record<string, unknown> | null>(null);
    const [resolvedSettings, setResolvedSettings] = useState<Record<string, unknown> | null>(null);

    const selfEmpNo = String(user?.emp_no ?? '').trim().toUpperCase();

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                let emp = employee;
                if (!emp && selfEmpNo) {
                    const selfRes = await api.getEmployee(selfEmpNo);
                    const selfBody = selfRes.data as ApiEnvelope<Record<string, unknown>>;
                    if (selfBody.success && selfBody.data) {
                        emp = selfBody.data as never;
                        setEmployee(selfBody.data as never);
                    }
                }

                const [empRes, eligRes, loanSettingsRes, advanceSettingsRes] = await Promise.all([
                    api.getGuarantorCandidates('', 80),
                    api.getLoanEligibility(selfEmpNo || undefined),
                    api.getLoanSettings('loan'),
                    api.getLoanSettings('salary_advance'),
                ]);
                const employees = (empRes.data as ApiEnvelope<EmployeeOpt[]>).data;
                setAllEmployees(Array.isArray(employees) ? employees : []);

                const eligibility = (eligRes.data as ApiEnvelope<Record<string, unknown>>).data;
                const max = Number(eligibility?.finalMaxAllowed ?? 0);
                if (max > 0) {
                    setEligibilityText(`Eligible salary advance limit: INR ${max.toLocaleString('en-IN')}`);
                    setEligibilityMaxAllowed(max);
                }

                // Keep both settings; we switch below based on request type.
                const loanSettings = (loanSettingsRes.data as ApiEnvelope<Record<string, unknown>>).data;
                const advanceSettings = (advanceSettingsRes.data as ApiEnvelope<Record<string, unknown>>).data;
                const initialSettings = requestType === 'loan' ? loanSettings : advanceSettings;
                setBaseSettings((initialSettings?.settings as Record<string, unknown>) || null);

                const deptId =
                    (emp as { department_id?: string | { _id?: string }; department?: { _id?: string } } | null)?.department_id &&
                    typeof (emp as { department_id?: string | { _id?: string } }).department_id === 'object'
                        ? ((emp as { department_id?: { _id?: string } }).department_id?._id || '')
                        : String((emp as { department_id?: string } | null)?.department_id || (emp as { department?: { _id?: string } } | null)?.department?._id || '');
                const divId =
                    (emp as { division_id?: string | { _id?: string }; division?: { _id?: string } } | null)?.division_id &&
                    typeof (emp as { division_id?: string | { _id?: string } }).division_id === 'object'
                        ? ((emp as { division_id?: { _id?: string } }).division_id?._id || '')
                        : String((emp as { division_id?: string } | null)?.division_id || (emp as { division?: { _id?: string } } | null)?.division?._id || '');

                if (deptId) {
                    const resolvedType = requestType === 'loan' ? 'loans' : 'salary_advance';
                    const resolvedRes = await api.getResolvedDepartmentSettings(deptId, resolvedType, divId || undefined);
                    const resolvedData = (resolvedRes.data as ApiEnvelope<Record<string, unknown>>).data;
                    const resolvedForType = requestType === 'loan'
                        ? (resolvedData?.loans as Record<string, unknown> | undefined)
                        : (resolvedData?.salaryAdvance as Record<string, unknown> | undefined);
                    setResolvedSettings(resolvedForType || null);
                }
            } catch {
                // Keep screen usable even if reference data fails.
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [selfEmpNo, employee, setEmployee, requestType]);

    useEffect(() => {
        if (requestType !== 'loan') return;
        const t = setTimeout(async () => {
            try {
                const res = await api.getGuarantorCandidates(guarantorSearch.trim(), 80);
                const body = res.data as ApiEnvelope<EmployeeOpt[]>;
                setAllEmployees(Array.isArray(body.data) ? body.data : []);
            } catch {
                // keep previous list
            }
        }, 250);
        return () => clearTimeout(t);
    }, [guarantorSearch, requestType]);

    const effectiveSettings = useMemo(() => {
        const merged = {
            ...(baseSettings || {}),
            ...(resolvedSettings || {}),
        } as Record<string, unknown>;
        return merged;
    }, [baseSettings, resolvedSettings]);

    const minAmount = Number(effectiveSettings.minAmount ?? 1000);
    const maxAmount = effectiveSettings.maxAmount != null ? Number(effectiveSettings.maxAmount) : null;
    const minDuration = Number(effectiveSettings.minDuration ?? effectiveSettings.minTenure ?? 1);
    const maxDurationRaw = effectiveSettings.maxDuration ?? effectiveSettings.maxTenure;
    const maxDuration = maxDurationRaw != null ? Number(maxDurationRaw) : null;
    const interestRate = Number(effectiveSettings.interestRate ?? 0);
    const isInterestApplicable = Boolean(effectiveSettings.isInterestApplicable);

    const amountNum = Number(amount || 0);
    const durationNum = Number(duration || 0);
    const effectiveMaxAmount = requestType === 'salary_advance'
        ? Math.min(
            maxAmount != null ? maxAmount : Number.POSITIVE_INFINITY,
            eligibilityMaxAllowed != null ? eligibilityMaxAllowed : Number.POSITIVE_INFINITY
        )
        : maxAmount;
    const amountTooLow = amount.trim() ? amountNum < minAmount : false;
    const amountTooHigh = amount.trim() && effectiveMaxAmount != null ? amountNum > effectiveMaxAmount : false;
    const durationTooLow = duration.trim() ? durationNum < minDuration : false;
    const durationTooHigh = duration.trim() && maxDuration != null ? durationNum > maxDuration : false;

    const emiPreview = useMemo(() => {
        if (requestType !== 'loan' || !amountNum || !durationNum) return null;
        if (!isInterestApplicable || interestRate === 0) {
            const emi = Math.round(amountNum / durationNum);
            return { emi, interest: 0, total: amountNum };
        }
        const totalInterest = (amountNum * interestRate * (durationNum / 12)) / 100;
        const total = amountNum + totalInterest;
        const emi = Math.round(total / durationNum);
        return { emi, interest: Math.round(totalInterest), total: Math.round(total) };
    }, [requestType, amountNum, durationNum, isInterestApplicable, interestRate]);

    const guarantorCandidates = useMemo(() => {
        return allEmployees.filter((e) => {
            const empNo = String(e.emp_no ?? '').trim().toUpperCase();
            return empNo && empNo !== selfEmpNo;
        });
    }, [allEmployees, selfEmpNo]);

    const toggleGuarantor = (empNo: string) => {
        setGuarantorEmpNos((prev) => {
            if (prev.includes(empNo)) return prev.filter((x) => x !== empNo);
            return [...prev, empNo];
        });
    };

    const onSubmit = async () => {
        if (!amount.trim() || !reason.trim()) {
            Alert.alert('Required', 'Amount and reason are required.');
            return;
        }
        if (!duration.trim()) {
            Alert.alert('Required', 'Duration is required.');
            return;
        }
        if (amountTooLow) {
            Alert.alert('Amount limit', `Minimum amount is INR ${minAmount.toLocaleString('en-IN')}.`);
            return;
        }
        if (amountTooHigh) {
            Alert.alert(
                'Amount limit',
                `Maximum amount is INR ${Number(effectiveMaxAmount).toLocaleString('en-IN')}.`
            );
            return;
        }
        if (durationTooLow) {
            Alert.alert('Duration limit', `Minimum duration is ${minDuration} month(s).`);
            return;
        }
        if (durationTooHigh) {
            Alert.alert('Duration limit', `Maximum duration is ${Number(maxDuration).toLocaleString('en-IN')} month(s).`);
            return;
        }
        if (requestType === 'loan' && guarantorEmpNos.length < 2) {
            Alert.alert('Guarantors', 'Select at least 2 guarantors for loan application.');
            return;
        }
        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                requestType,
                amount: Number(amount),
                duration: Number(duration),
                reason: reason.trim(),
                remarks: remarks.trim() || undefined,
            };
            if (requestType === 'loan') {
                payload.guarantorIds = guarantorEmpNos;
            }

            const res = await api.applyLoan(payload);
            const body = res.data as ApiEnvelope;
            if (body.success) {
                Alert.alert('Success', `${requestType === 'loan' ? 'Loan' : 'Salary advance'} request submitted.`, [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Failed', body.message || body.error || 'Could not submit request.');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ApplyWriteGate allowed={canApplyLoans(user)} moduleLabel="apply loan or salary advance">
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pb-4 pt-2">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-3 h-12 w-12 items-center justify-center rounded-2xl border-2 border-neutral-100 bg-white"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Finance request</Text>
                        <Text className="text-xl font-black text-neutral-900">Apply loan / advance</Text>
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#10B981" />
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
                        <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Request type</Text>
                        <View className="mb-4 flex-row gap-3">
                            {(['loan', 'salary_advance'] as const).map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    onPress={() => setRequestType(t)}
                                    className={`flex-1 items-center rounded-2xl border-2 py-3 ${requestType === t ? 'border-primary bg-emerald-50' : 'border-neutral-100 bg-white'}`}
                                >
                                    <Text className="font-bold text-neutral-800">{t === 'loan' ? 'Loan' : 'Salary advance'}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {requestType === 'salary_advance' && eligibilityText ? (
                            <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <Text className="text-xs font-bold text-emerald-800">{eligibilityText}</Text>
                            </View>
                        ) : null}

                        <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Amount *</Text>
                        <TextInput
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder="Enter amount"
                            className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-medium text-neutral-900"
                            placeholderTextColor="#94A3B8"
                        />
                        <Text className="mb-3 text-xs text-neutral-400">
                            Allowed range: INR {minAmount.toLocaleString('en-IN')}
                            {effectiveMaxAmount != null ? ` - INR ${Number(effectiveMaxAmount).toLocaleString('en-IN')}` : ' and above'}
                        </Text>
                        {amountTooLow ? <Text className="mb-3 text-xs font-semibold text-rose-600">Amount is below minimum limit.</Text> : null}
                        {amountTooHigh ? <Text className="mb-3 text-xs font-semibold text-rose-600">Amount exceeds allowed limit.</Text> : null}

                        <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Duration (months) *</Text>
                        <TextInput
                            value={duration}
                            onChangeText={setDuration}
                            keyboardType="number-pad"
                            placeholder="e.g. 12"
                            className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-medium text-neutral-900"
                            placeholderTextColor="#94A3B8"
                        />
                        <Text className="mb-3 text-xs text-neutral-400">
                            Allowed duration: {minDuration}
                            {maxDuration != null ? ` - ${maxDuration}` : '+'} month(s)
                        </Text>
                        {durationTooLow ? <Text className="mb-3 text-xs font-semibold text-rose-600">Duration is below minimum limit.</Text> : null}
                        {durationTooHigh ? <Text className="mb-3 text-xs font-semibold text-rose-600">Duration exceeds maximum limit.</Text> : null}

                        {requestType === 'loan' && emiPreview ? (
                            <View className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                                <Text className="text-xs font-bold text-neutral-700">
                                    EMI preview: INR {emiPreview.emi.toLocaleString('en-IN')} / month
                                </Text>
                                <Text className="mt-1 text-xs text-neutral-500">
                                    Interest: INR {emiPreview.interest.toLocaleString('en-IN')} ({isInterestApplicable ? `${interestRate}%` : '0%'})
                                </Text>
                                <Text className="mt-1 text-xs text-neutral-500">
                                    Total payable: INR {emiPreview.total.toLocaleString('en-IN')}
                                </Text>
                            </View>
                        ) : null}

                        {requestType === 'loan' ? (
                            <>
                                <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Guarantors *</Text>
                                <TouchableOpacity
                                    onPress={() => setGuarantorOpen(true)}
                                    className="mb-2 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3"
                                >
                                    <Text className="font-bold text-neutral-800">
                                        {guarantorEmpNos.length > 0 ? `${guarantorEmpNos.length} selected` : 'Select guarantors'}
                                    </Text>
                                </TouchableOpacity>
                                <Text className="mb-4 text-xs text-neutral-400">Minimum 2 guarantors required for loan applications.</Text>
                            </>
                        ) : null}

                        <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Reason *</Text>
                        <TextInput
                            value={reason}
                            onChangeText={setReason}
                            multiline
                            placeholder="Reason for request"
                            className="mb-4 min-h-[96px] rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-medium text-neutral-900"
                            placeholderTextColor="#94A3B8"
                            textAlignVertical="top"
                        />

                        <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Remarks</Text>
                        <TextInput
                            value={remarks}
                            onChangeText={setRemarks}
                            placeholder="Optional remarks"
                            className="mb-8 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-medium text-neutral-900"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity
                            onPress={onSubmit}
                            disabled={submitting}
                            className={`mb-12 items-center rounded-2xl py-4 ${submitting ? 'bg-emerald-300' : 'bg-primary'}`}
                        >
                            {submitting ? <ActivityIndicator color="white" /> : <Text className="text-xs font-black uppercase tracking-widest text-white">Submit</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                )}

                <Modal visible={guarantorOpen} animationType="slide" transparent>
                    <TouchableOpacity activeOpacity={1} onPress={() => setGuarantorOpen(false)} className="flex-1 justify-end bg-black/40">
                        <View className="max-h-[72%] rounded-t-3xl bg-white p-6">
                            <Text className="mb-4 text-lg font-black text-neutral-900">Select guarantors</Text>
                            <TextInput
                                value={guarantorSearch}
                                onChangeText={setGuarantorSearch}
                                placeholder="Search by name or emp no"
                                className="mb-3 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-medium text-neutral-900"
                                placeholderTextColor="#94A3B8"
                            />
                            <ScrollView>
                                {guarantorCandidates.map((g) => {
                                    const empNo = String(g.emp_no ?? '').trim().toUpperCase();
                                    const selected = guarantorEmpNos.includes(empNo);
                                    return (
                                        <TouchableOpacity
                                            key={empNo}
                                            onPress={() => toggleGuarantor(empNo)}
                                            className={`mb-2 rounded-2xl border px-4 py-3 ${selected ? 'border-primary bg-emerald-50' : 'border-neutral-100 bg-white'}`}
                                        >
                                            <Text className="font-bold text-neutral-900">{g.employee_name || empNo}</Text>
                                            <Text className="text-xs text-neutral-500">{empNo}</Text>
                                            {g.department?.name ? <Text className="text-xs text-neutral-400">{g.department.name}</Text> : null}
                                        </TouchableOpacity>
                                    );
                                })}
                                {guarantorCandidates.length === 0 ? (
                                    <View className="items-center py-8">
                                        <Text className="text-sm font-medium text-neutral-500">No guarantor candidates found.</Text>
                                    </View>
                                ) : null}
                            </ScrollView>
                            <TouchableOpacity
                                onPress={() => setGuarantorOpen(false)}
                                className="mt-4 items-center rounded-2xl bg-neutral-900 py-3"
                            >
                                <Text className="text-xs font-black uppercase tracking-widest text-white">Done</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        </View>
        </ApplyWriteGate>
    );
}
