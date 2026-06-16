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
import { canApplyPermissionFromApi } from '../src/lib/permissions';
import { ApplyWriteGate } from '../src/components/ApplyWriteGate';

function normEmp(s: string): string {
    return s.trim().toUpperCase();
}

type PermType = 'mid_shift' | 'late_in' | 'early_out';
type DateBounds = { minDate: Date; maxDate: Date };

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

export default function ApplyPermissionScreen() {
    const router = useRouter();
    const { user, employee, setEmployee } = useAuthStore();
    const [empNo, setEmpNo] = useState(user?.emp_no ? normEmp(user.emp_no) : '');
    const [employeeId, setEmployeeId] = useState('');
    const [date, setDate] = useState(todayYmdIST());
    const [permissionType, setPermissionType] = useState<PermType>('mid_shift');
    const [permissionStartTime, setPermissionStartTime] = useState('');
    const [permissionEndTime, setPermissionEndTime] = useState('');
    const [permittedEdgeTime, setPermittedEdgeTime] = useState('');
    const [purpose, setPurpose] = useState('');
    const [comments, setComments] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [dateBounds, setDateBounds] = useState<DateBounds>(() =>
        getPolicyDateBounds({
            allowBackdated: false,
            maxBackdatedDays: 0,
            allowFutureDated: true,
            maxAdvanceDays: 365,
        })
    );

    const allowed = canApplyPermissionFromApi(user);

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

    useEffect(() => {
        const init = async () => {
            if (!employee && user?.emp_no) {
                const er = await api.getEmployee(user.emp_no);
                const body = er.data as ApiEnvelope;
                if (body.success && body.data) setEmployee(body.data as never);
            }
        };
        void init();
    }, [employee, user?.emp_no, setEmployee]);

    useEffect(() => {
        const loadBounds = async () => {
            try {
                const res = await api.getPermissionDeductionSettings();
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
                // fallback defaults
            }
        };
        void loadBounds();
    }, []);

    const verifyMidShiftAttendance = useCallback(
        async (employeeNumber: string, ymd: string): Promise<boolean> => {
            try {
                const attendanceRes = await api.getAttendanceDetail(employeeNumber, ymd);
                const body = attendanceRes.data as ApiEnvelope<Record<string, unknown>>;
                const d = body?.data as { shifts?: Array<{ inTime?: string | null }> } | undefined;
                return Boolean(d?.shifts?.length && d.shifts[0]?.inTime);
            } catch {
                return false;
            }
        },
        []
    );

    const onSubmit = async () => {
        const e = normEmp(empNo);
        if (!employeeId || !e || !date || !purpose.trim()) {
            Alert.alert('Required', 'Employee, date, and purpose are required.');
            return;
        }

        const dateYmd = toYmd(new Date(date));
        const minYmd = toYmd(dateBounds.minDate);
        const maxYmd = toYmd(dateBounds.maxDate);
        if (dateYmd < minYmd || dateYmd > maxYmd) {
            Alert.alert('Date policy', `Date must be between ${minYmd} and ${maxYmd}.`);
            return;
        }

        if (permissionType === 'mid_shift') {
            if (!permissionStartTime.trim() || !permissionEndTime.trim()) {
                Alert.alert('Required', 'Start and end time (ISO) are required for mid-shift permission.');
                return;
            }
            const start = new Date(permissionStartTime.trim());
            const end = new Date(permissionEndTime.trim());
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                Alert.alert('Time format', 'Start and end time must be valid ISO date-time values.');
                return;
            }
            if (end <= start) {
                Alert.alert('Time validation', 'Permission end time must be after start time.');
                return;
            }
            const hasAttendance = await verifyMidShiftAttendance(e, date);
            if (!hasAttendance) {
                Alert.alert('Attendance', 'No attendance record found or no in-time for this date.');
                return;
            }
        } else if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(permittedEdgeTime.trim())) {
            Alert.alert('Required', 'Permitted time must be HH:MM (24h) for late in / early out.');
            return;
        }

        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                employeeId,
                employeeNumber: e,
                date,
                purpose: purpose.trim(),
                comments: comments.trim() || undefined,
                permissionType,
            };
            if (permissionType === 'mid_shift') {
                payload.permissionStartTime = permissionStartTime.trim();
                payload.permissionEndTime = permissionEndTime.trim();
            } else {
                payload.permittedEdgeTime = permittedEdgeTime.trim();
            }

            const res = await api.createPermission(payload);
            const body = res.data as ApiEnvelope & { validationErrors?: string[] };
            if ((res.status === 200 || res.status === 201) && body.success) {
                Alert.alert('Success', 'Permission request submitted.', [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                const ve = body.validationErrors?.join?.('\n');
                Alert.alert('Failed', ve || body.message || body.error || 'Could not create permission');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ApplyWriteGate allowed={allowed} moduleLabel="apply permission">
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
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Gate / shift</Text>
                        <Text className="text-xl font-black text-neutral-900">Apply permission</Text>
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

                    <DateField label="Date" value={date} onChange={setDate} minimumDate={dateBounds.minDate} maximumDate={dateBounds.maxDate} />

                    <Text className="mb-2 mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Type</Text>
                    <View className="mb-4 flex-row flex-wrap gap-2">
                        {(['mid_shift', 'late_in', 'early_out'] as const).map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setPermissionType(t)}
                                className={`rounded-xl border-2 px-3 py-2 ${
                                    permissionType === t ? 'border-emerald-500 bg-emerald-50' : 'border-neutral-100 bg-white'
                                }`}
                            >
                                <Text className="text-[10px] font-black uppercase text-neutral-800">
                                    {t === 'mid_shift' ? 'Mid shift' : t === 'late_in' ? 'Late in' : 'Early out'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {permissionType === 'mid_shift' ? (
                        <>
                            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Window start (ISO)
                            </Text>
                            <TextInput
                                value={permissionStartTime}
                                onChangeText={setPermissionStartTime}
                                placeholder={`${date}T12:00:00+05:30`}
                                className="mb-3 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-mono text-sm text-neutral-900"
                            />
                            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Window end (ISO)
                            </Text>
                            <TextInput
                                value={permissionEndTime}
                                onChangeText={setPermissionEndTime}
                                placeholder={`${date}T13:00:00+05:30`}
                                className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 font-mono text-sm text-neutral-900"
                            />
                        </>
                    ) : (
                        <>
                            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                Permitted time (HH:MM)
                            </Text>
                            <TextInput
                                value={permittedEdgeTime}
                                onChangeText={setPermittedEdgeTime}
                                placeholder="09:30"
                                className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3.5 font-mono text-neutral-900"
                            />
                        </>
                    )}

                    <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Purpose</Text>
                    <TextInput
                        value={purpose}
                        onChangeText={setPurpose}
                        multiline
                        placeholder="Reason for permission"
                        className="mb-3 min-h-[88px] rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 text-neutral-900"
                    />

                    <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Comments (optional)</Text>
                    <TextInput
                        value={comments}
                        onChangeText={setComments}
                        className="mb-6 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3 text-neutral-900"
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
                            <Text className="text-sm font-black uppercase tracking-widest text-white">Submit permission</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </View>
        </ApplyWriteGate>
    );
}
