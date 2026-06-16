import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, Clock3, CheckCircle2, Users, Funnel, CalendarDays } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { api, type LiveAttendanceFilterOption, type LiveAttendanceReportData } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import { canViewLiveAttendanceModule } from '../../src/lib/permissions';
import { ModuleAccessDenied } from '../../src/components/ModuleAccessDenied';
import { SkeletonCard } from '../../src/components/Skeleton';

function ymd(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatTime(t?: string | null) {
    if (!t) return '—';
    return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatHours(h?: number) {
    const v = Number(h || 0);
    const hh = Math.floor(v);
    const mm = Math.round((v - hh) * 60);
    return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export default function LiveAttendanceScreen() {
    const user = useAuthStore((s) => s.user);
    const canViewModule = canViewLiveAttendanceModule(user);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [report, setReport] = useState<LiveAttendanceReportData | null>(null);
    const [divisions, setDivisions] = useState<LiveAttendanceFilterOption[]>([]);
    const [departments, setDepartments] = useState<LiveAttendanceFilterOption[]>([]);
    const [shifts, setShifts] = useState<LiveAttendanceFilterOption[]>([]);
    const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
    const [selectedDiv, setSelectedDiv] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedShift, setSelectedShift] = useState('');

    const yesterday = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return ymd(d);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [filterRes, reportRes] = await Promise.all([
                api.getLiveAttendanceFilterOptions(),
                api.getLiveAttendanceReport({
                    date: selectedDate,
                    division: selectedDiv || undefined,
                    department: selectedDept || undefined,
                    shift: selectedShift || undefined,
                }),
            ]);
            const fBody = filterRes.data;
            const rBody = reportRes.data;
            setDivisions(Array.isArray(fBody.data?.divisions) ? fBody.data.divisions : []);
            setDepartments(Array.isArray(fBody.data?.departments) ? fBody.data.departments : []);
            setShifts(Array.isArray(fBody.data?.shifts) ? fBody.data.shifts : []);
            setReport(rBody.success && rBody.data ? rBody.data : null);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedDate, selectedDiv, selectedDept, selectedShift]);

    useFocusEffect(useCallback(() => { load(); }, [load]));
    useEffect(() => {
        const t = setInterval(() => {
            void load();
        }, 60000);
        return () => clearInterval(t);
    }, [load]);

    if (!canViewModule) {
        return <ModuleAccessDenied moduleLabel="Live Attendance" />;
    }

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <ScrollView
                    className="flex-1 px-6 pt-6"
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#10B981" />}
                >
                    <View className="mb-5 flex-row items-start justify-between">
                        <View className="min-w-0 flex-1 pr-3">
                            <View className="mb-1 flex-row items-center">
                                <View className="mr-2 h-1 w-8 rounded-full bg-primary" />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Super Admin</Text>
                            </View>
                            <Text className="text-3xl font-black tracking-tight text-neutral-900">
                                Live Attendance<Text className="text-primary">.</Text>Pulse
                            </Text>
                            <Text className="mt-1 text-sm font-medium text-neutral-500">Real-time workforce monitoring</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setFiltersOpen((v) => !v)}
                            className={`h-12 w-12 items-center justify-center rounded-2xl border-2 ${filtersOpen ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-100 bg-white'}`}
                        >
                            <Funnel size={16} color={filtersOpen ? '#047857' : '#475569'} />
                        </TouchableOpacity>
                    </View>

                    <View className="mb-4 flex-row gap-2">
                        {[{ id: ymd(new Date()), label: 'Today' }, { id: yesterday, label: 'Yesterday' }].map((d) => (
                            <TouchableOpacity
                                key={d.id}
                                onPress={() => setSelectedDate(d.id)}
                                className={`rounded-xl border px-3 py-2 ${selectedDate === d.id ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                            >
                                <Text className={`text-xs font-black uppercase tracking-wider ${selectedDate === d.id ? 'text-emerald-700' : 'text-neutral-600'}`}>{d.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {filtersOpen ? (
                        <View className="mb-4 rounded-2xl border-2 border-neutral-100 bg-white p-3">
                            <Text className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">Filters</Text>
                            {[
                                { title: 'Division', list: divisions, value: selectedDiv, set: setSelectedDiv },
                                { title: 'Department', list: departments, value: selectedDept, set: setSelectedDept },
                                { title: 'Shift', list: shifts, value: selectedShift, set: setSelectedShift },
                            ].map((grp) => (
                                <View key={grp.title} className="mb-3">
                                    <Text className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">{grp.title}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View className="flex-row gap-2">
                                            <TouchableOpacity
                                                onPress={() => grp.set('')}
                                                className={`rounded-full border px-3 py-1.5 ${grp.value === '' ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                                            >
                                                <Text className={`text-[10px] font-black uppercase tracking-wider ${grp.value === '' ? 'text-emerald-700' : 'text-neutral-600'}`}>All</Text>
                                            </TouchableOpacity>
                                            {grp.list.map((o) => (
                                                <TouchableOpacity
                                                    key={o.id}
                                                    onPress={() => grp.set(String(o.id))}
                                                    className={`rounded-full border px-3 py-1.5 ${grp.value === String(o.id) ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                                                >
                                                    <Text className={`text-[10px] font-black uppercase tracking-wider ${grp.value === String(o.id) ? 'text-emerald-700' : 'text-neutral-600'}`}>
                                                        {o.name}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </View>
                            ))}
                            <TouchableOpacity
                                onPress={() => {
                                    setSelectedDiv('');
                                    setSelectedDept('');
                                    setSelectedShift('');
                                }}
                                className="self-start rounded-lg bg-neutral-100 px-3 py-1.5"
                            >
                                <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-700">Clear filters</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {loading && !refreshing ? (
                        <View className="pb-28">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </View>
                    ) : !report ? (
                        <View className="mb-24 items-center rounded-[32px] border-2 border-neutral-50 bg-white p-10">
                            <CalendarDays size={34} color="#94A3B8" />
                            <Text className="mt-3 text-center font-semibold text-neutral-600">No live attendance data for selected filters.</Text>
                        </View>
                    ) : (
                        <>
                            <View className="mb-4 flex-row flex-wrap justify-between">
                                {[
                                    { label: 'Total workforce', value: report.summary.totalActiveEmployees, icon: Users, color: '#334155' },
                                    { label: 'Active now', value: report.summary.currentlyWorking, icon: Clock3, color: '#059669' },
                                    { label: 'Completed', value: report.summary.completedShift, icon: CheckCircle2, color: '#7C3AED' },
                                    { label: 'Present', value: report.summary.totalPresent, icon: Activity, color: '#2563EB' },
                                ].map((m) => (
                                    <View key={m.label} className="mb-3 w-[48%] rounded-2xl border border-neutral-100 bg-white p-4">
                                        <m.icon size={16} color={m.color} />
                                        <Text className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">{m.label}</Text>
                                        <Text className="mt-1 text-2xl font-black text-neutral-900">{m.value}</Text>
                                    </View>
                                ))}
                            </View>

                            <View className="mb-4 rounded-[24px] border border-neutral-100 bg-white p-4">
                                <Text className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">Currently working</Text>
                                {report.currentlyWorking.length === 0 ? (
                                    <Text className="text-sm text-neutral-500">No active shifts right now.</Text>
                                ) : report.currentlyWorking.map((e) => (
                                    <View key={`${e.id}-w`} className="mb-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                        <Text className="text-xs font-black text-neutral-900">{e.name} · {e.empNo}</Text>
                                        <Text className="mt-0.5 text-[10px] text-neutral-600">{e.department || '—'} · {e.shift || '—'}</Text>
                                        <Text className="mt-0.5 text-[10px] text-neutral-600">In: {formatTime(e.inTime)} · {formatHours(e.hoursWorked)}</Text>
                                    </View>
                                ))}
                            </View>

                            <View className="mb-24 rounded-[24px] border border-neutral-100 bg-white p-4">
                                <Text className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">Shift completed</Text>
                                {report.completedShift.length === 0 ? (
                                    <Text className="text-sm text-neutral-500">No completed shifts yet.</Text>
                                ) : report.completedShift.map((e) => (
                                    <View key={`${e.id}-c`} className="mb-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                        <Text className="text-xs font-black text-neutral-900">{e.name} · {e.empNo}</Text>
                                        <Text className="mt-0.5 text-[10px] text-neutral-600">{e.department || '—'} · {e.shift || '—'}</Text>
                                        <Text className="mt-0.5 text-[10px] text-neutral-600">In: {formatTime(e.inTime)} · Out: {formatTime(e.outTime)} · {formatHours(e.hoursWorked)}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
