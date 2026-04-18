import { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { api, ApiEnvelope } from '../src/api/client';
import { useAuthStore } from '../src/store/useAuthStore';
import { todayYmdIST } from '../src/utils/dateIST';
import { DateField } from '../src/components/DateField';
import { canApplyOtFromApi } from '../src/lib/permissions';

type ConfusedPayload = {
    requiresManualSelection?: boolean;
    possibleShifts?: Array<{ shiftId: string; shiftName: string; startTime?: string; endTime?: string }>;
};

type DateBounds = { minDate: Date; maxDate: Date };

function normEmp(s: string): string {
    return s.trim().toUpperCase();
}

function toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getPolicyDateBounds(policy: {
    allowBackdated?: boolean;
    maxBackdatedDays?: number;
    allowFutureDated?: boolean;
    maxAdvanceDays?: number;
}): DateBounds {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
    const minDate = new Date(today);
    const maxDate = new Date(today);

    if (policy.allowBackdated && (policy.maxBackdatedDays ?? 0) > 0) {
        minDate.setDate(minDate.getDate() - Number(policy.maxBackdatedDays || 0));
    }
    if (policy.allowFutureDated && (policy.maxAdvanceDays ?? 0) > 0) {
        maxDate.setDate(maxDate.getDate() + Number(policy.maxAdvanceDays || 0));
    }
    return { minDate, maxDate };
}

export default function ApplyOTScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [empNo, setEmpNo] = useState(user?.emp_no ? normEmp(user.emp_no) : '');
    const [employeeId, setEmployeeId] = useState('');
    const [date, setDate] = useState(todayYmdIST());
    const [otOutTime, setOtOutTime] = useState('');
    const [comments, setComments] = useState('');
    const [manualShiftId, setManualShiftId] = useState('');
    const [confused, setConfused] = useState<ConfusedPayload | null>(null);
    const [loadingMeta, setLoadingMeta] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [attendanceInTime, setAttendanceInTime] = useState<string | null>(null);
    const [dateBounds, setDateBounds] = useState<DateBounds>(() =>
        getPolicyDateBounds({
            allowBackdated: false,
            maxBackdatedDays: 0,
            allowFutureDated: true,
            maxAdvanceDays: 365,
        })
    );

    const allowed = canApplyOtFromApi(user);

    const resolveEmployee = useCallback(async () => {
        const e = normEmp(empNo);
        if (!e) {
            setEmployeeId('');
            return;
        }
        try {
            const res = await api.getEmployee(e);
            const body = res.data as ApiEnvelope;
            if (res.status === 200 && body.success && body.data && typeof body.data === 'object') {
                const d = body.data as { _id?: string };
                setEmployeeId(String(d._id || ''));
            } else {
                setEmployeeId('');
            }
        } catch {
            setEmployeeId('');
        }
    }, [empNo]);

    useEffect(() => {
        void resolveEmployee();
    }, [resolveEmployee]);

    const refreshConfused = useCallback(async () => {
        const e = normEmp(empNo);
        if (!e || !date) {
            setConfused(null);
            return;
        }
        setLoadingMeta(true);
        try {
            const attendanceRes = await api.getAttendanceDetail(e, date);
            const attendanceBody = attendanceRes.data as ApiEnvelope<Record<string, unknown>>;
            const attendanceData = attendanceBody?.data as { shifts?: Array<{ inTime?: string | null }> } | undefined;
            const firstIn = attendanceData?.shifts?.[0]?.inTime || null;
            setAttendanceInTime(firstIn);

            const res = await api.checkConfusedShift(e, date);
            const body = res.data as ApiEnvelope & { data?: ConfusedPayload };
            if (res.status === 200 && body.success && body.data && typeof body.data === 'object') {
                setConfused(body.data as ConfusedPayload);
            } else {
                setConfused(null);
            }
        } catch {
            setConfused(null);
        } finally {
            setLoadingMeta(false);
        }
    }, [empNo, date]);

    useEffect(() => {
        void refreshConfused();
    }, [refreshConfused]);

    useEffect(() => {
        const loadBounds = async () => {
            try {
                const res = await api.getOvertimeSettings();
                const body = res.data as ApiEnvelope<Record<string, unknown>>;
                const source =
                    body && typeof body === 'object' && body.data && typeof body.data === 'object'
                        ? (body.data as Record<string, unknown>)
                        : (body as unknown as Record<string, unknown>);
                setDateBounds(
                    getPolicyDateBounds({
                        allowBackdated: Boolean(source.allowBackdated),
                        maxBackdatedDays: Number(source.maxBackdatedDays ?? 0),
                        allowFutureDated: source.allowFutureDated !== false,
                        maxAdvanceDays: Number(source.maxAdvanceDays ?? 365),
                    })
                );
            } catch {
                // Use default fallback bounds
            }
        };
        void loadBounds();
    }, []);

    const onSubmit = async () => {
        const e = normEmp(empNo);
        if (!employeeId || !e || !date || !otOutTime.trim()) {
            Alert.alert('Required', 'Employee number, date, and OT end time are required.');
            return;
        }

        const dateYmd = toYmd(new Date(date));
        const minYmd = toYmd(dateBounds.minDate);
        const maxYmd = toYmd(dateBounds.maxDate);
        if (dateYmd < minYmd || dateYmd > maxYmd) {
            Alert.alert('Date policy', `Date must be between ${minYmd} and ${maxYmd}.`);
            return;
        }

        let inTime = attendanceInTime;
        if (!inTime) {
            try {
                const attendanceRes = await api.getAttendanceDetail(e, date);
                const ab = attendanceRes.data as ApiEnvelope<Record<string, unknown>>;
                const ad = ab?.data as { shifts?: Array<{ inTime?: string | null }> } | undefined;
                inTime = ad?.shifts?.[0]?.inTime || null;
                setAttendanceInTime(inTime);
            } catch {
                inTime = null;
            }
        }

        if (!inTime) {
            Alert.alert('Attendance', 'Attendance record not found or incomplete. OT cannot be created without attendance.');
            return;
        }

        const outDate = new Date(otOutTime.trim());
        const inDate = new Date(inTime);
        if (Number.isNaN(outDate.getTime())) {
            Alert.alert('Time format', 'OT out time must be a valid ISO date-time.');
            return;
        }
        if (!Number.isNaN(inDate.getTime()) && outDate <= inDate) {
            Alert.alert('Time validation', 'OT out time must be after attendance in time.');
            return;
        }

        if (confused?.requiresManualSelection && !manualShiftId) {
            Alert.alert('Shift', 'Pick the shift for this day (confused shift).');
            return;
        }
        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                employeeId,
                employeeNumber: e,
                date,
                otOutTime: otOutTime.trim(),
                comments: comments.trim() || undefined,
            };
            if (manualShiftId) {
                payload.manuallySelectedShiftId = manualShiftId;
                payload.shiftId = manualShiftId;
            }
            const res = await api.createOT(payload);
            const body = res.data as ApiEnvelope & { validationErrors?: string[] };
            if ((res.status === 200 || res.status === 201) && body.success) {
                Alert.alert('Success', 'OT request submitted.', [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                const ve = body.validationErrors?.join?.('\n');
                Alert.alert('Failed', ve || body.message || body.error || 'Could not create OT');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    if (!allowed) {
        return (
            <View className="flex-1 bg-white px-6 pt-4">
                <StatusBar style="dark" />
                <TouchableOpacity onPress={() => router.back()} className="mb-4 flex-row items-center gap-2">
                    <ChevronLeft size={22} color="#0F172A" />
                    <Text className="font-bold text-neutral-700">Back</Text>
                </TouchableOpacity>
                <Text className="text-lg font-black text-neutral-900">Apply OT</Text>
                <Text className="mt-2 text-sm text-neutral-500">
                    OT requests are created by manager, HOD, or HR in this organisation. If you need overtime logged, ask
                    your reporting manager.
                </Text>
            </View>
        );
    }

    return (
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
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Overtime</Text>
                        <Text className="text-xl font-black text-neutral-900">Apply OT</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
                    <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Employee number</Text>
                    <TextInput
                        value={empNo}
                        onChangeText={(t) => setEmpNo(normEmp(t))}
                        autoCapitalize="characters"
                        placeholder="e.g. LI001"
                        className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3.5 font-bold text-neutral-900"
                    />

                    <DateField label="Work date" value={date} onChange={setDate} minimumDate={dateBounds.minDate} maximumDate={dateBounds.maxDate} />

                    <Text className="mb-2 mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        OT clock-out (ISO datetime)
                    </Text>
                    <TextInput
                        value={otOutTime}
                        onChangeText={setOtOutTime}
                        placeholder={`${date}T19:30:00+05:30`}
                        className="mb-2 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3.5 font-mono text-sm text-neutral-900"
                    />
                    <Text className="mb-4 text-[10px] text-neutral-400">Use the same instant format as web (IST).</Text>

                    {loadingMeta ? (
                        <ActivityIndicator color="#10B981" style={{ marginVertical: 8 }} />
                    ) : confused?.requiresManualSelection && confused.possibleShifts?.length ? (
                        <View className="mb-4 rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-3">
                            <Text className="mb-2 text-xs font-black text-amber-900">Select shift (required)</Text>
                            {confused.possibleShifts.map((s) => (
                                <TouchableOpacity
                                    key={s.shiftId}
                                    onPress={() => setManualShiftId(s.shiftId)}
                                    className={`mb-2 rounded-xl border-2 px-3 py-2 ${
                                        manualShiftId === s.shiftId ? 'border-emerald-500 bg-white' : 'border-neutral-100 bg-white'
                                    }`}
                                >
                                    <Text className="font-bold text-neutral-900">{s.shiftName}</Text>
                                    <Text className="text-[10px] text-neutral-500">
                                        {s.startTime} – {s.endTime}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}

                    <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Comments (optional)</Text>
                    <TextInput
                        value={comments}
                        onChangeText={setComments}
                        multiline
                        placeholder="Notes for approver"
                        className="mb-6 min-h-[80px] rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 text-neutral-900"
                    />

                    <TouchableOpacity
                        onPress={() => void onSubmit()}
                        disabled={submitting}
                        className="mb-10 items-center rounded-2xl bg-emerald-600 py-4"
                        style={{ opacity: submitting ? 0.7 : 1 }}
                    >
                        {submitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-sm font-black uppercase tracking-widest text-white">Submit OT</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
