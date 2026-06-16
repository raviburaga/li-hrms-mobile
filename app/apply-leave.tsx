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
import { canApplyLeaves } from '../src/lib/permissions';
import { ApplyWriteGate } from '../src/components/ApplyWriteGate';
import { DateField, formatYmd } from '../src/components/DateField';

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

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                if (!employee && user?.emp_no) {
                    const er = await api.getEmployee(user.emp_no);
                    const body = er.data as ApiEnvelope;
                    if (body.success && body.data) setEmployee(body.data as never);
                }
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
            } catch {
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

    const selectedTypeLabel = types.find((t) => t.code === leaveType)?.name || leaveType || 'Select type';

    const onSubmit = async () => {
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
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ApplyWriteGate allowed={canApplyLeaves(user)} moduleLabel="apply leave">
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
                            disabled={submitting}
                            className={`mb-12 py-4 rounded-2xl items-center ${submitting ? 'bg-emerald-300' : 'bg-primary'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-black uppercase tracking-widest">Submit</Text>
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
        </ApplyWriteGate>
    );
}
