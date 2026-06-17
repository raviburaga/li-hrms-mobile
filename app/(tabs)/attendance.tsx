import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    useWindowDimensions,
} from 'react-native';
import { MotiView, MotiText } from 'moti';
import { Clock, MapPin, CheckCircle2, AlertCircle, History, Radio } from 'lucide-react-native';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { api } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import {
    todayYmdIST,
    formatTimeIST,
    istYearMonth,
    formatDateOnlyIST,
    addCalendarDaysIST,
} from '../../src/utils/dateIST';
import { SkeletonBlock, SkeletonCard } from '../../src/components/Skeleton';

const POLL_MS = 35_000;

type CalShift = {
    inTime?: string | null;
    outTime?: string | null;
    shiftEndTime?: string | null;
    shiftName?: string;
    isLateIn?: boolean;
    shiftId?: { name?: string } | unknown;
};
type CalDay = {
    date?: string;
    status?: string;
    totalHours?: number | null;
    lateInMinutes?: number | null;
    earlyOutMinutes?: number | null;
    shifts?: CalShift[];
    inTime?: string | null;
    outTime?: string | null;
};

type ListDayRow = {
    date: string;
    status: string;
    inStr: string | null;
    outStr: string | null;
    label: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === 'object' && !Array.isArray(v);
}

function asCalDay(v: unknown): CalDay | null {
    if (!isRecord(v)) return null;
    return v as CalDay;
}

function shiftBounds(shifts: CalShift[] | undefined) {
    if (!shifts?.length) return { inStr: null as string | null, outStr: null as string | null };
    const first = shifts[0];
    const last = shifts[shifts.length - 1];
    return {
        inStr: first?.inTime ?? null,
        /** Only show out when a real punch exists — never duplicate in-time as out. */
        outStr: last?.outTime ?? null,
    };
}

function formatWorkedHours(h: number | null | undefined): string {
    if (h == null || Number.isNaN(Number(h))) return '—';
    const totalMin = Math.round(Number(h) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

function formatLateEarly(mins: number | null | undefined): string {
    if (mins == null || mins <= 0) return 'None';
    return `${mins} min`;
}

export default function AttendanceScreen() {
    const { user, employee } = useAuthStore();
    const empNo = (user?.emp_no || employee?.emp_no || '').trim().toUpperCase();
    const { width } = useWindowDimensions();

    const [time, setTime] = useState(() => new Date());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [calendarMap, setCalendarMap] = useState<Record<string, CalDay>>({});
    const [periodYear, setPeriodYear] = useState<number | null>(null);
    const [periodMonth, setPeriodMonth] = useState<number | null>(null);
    const [recentAttendanceList, setRecentAttendanceList] = useState<ListDayRow[]>([]);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const [todayDetail, setTodayDetail] = useState<CalDay | null>(null);

    const today = todayYmdIST();
    const { year: istY, month: istM } = istYearMonth();
    const todayRef = useRef(today);
    todayRef.current = today;

    const loadCalendar = useCallback(async () => {
        if (!useAuthStore.getState().isAuthenticated) return;
        if (!empNo) {
            setError('Employee number missing. Sign in again or contact HR.');
            setLoading(false);
            setRefreshing(false);
            return;
        }
        setError(null);
        const todayY = todayRef.current;
        const listStart = addCalendarDaysIST(todayY, -13);
        try {
            const [calRes, detailRes, listRes] = await Promise.all([
                api.getAttendanceCalendar(empNo, istY, istM),
                api.getAttendanceDetail(empNo, todayY),
                api.getAttendanceList(empNo, listStart, todayY, 1, 40).catch(() => ({
                    status: 500,
                    data: { success: false as const },
                })),
            ]);

            const body = calRes.data;
            if (!body.success || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
                setError((body as { message?: string }).message || 'Could not load attendance.');
                setCalendarMap({});
            } else {
                const raw = body.data as Record<string, unknown>;
                const next: Record<string, CalDay> = {};
                for (const [k, v] of Object.entries(raw)) {
                    const d = asCalDay(v);
                    if (d) next[k] = d;
                }
                setCalendarMap(next);
                setPeriodYear(body.year ?? istY);
                setPeriodMonth(body.month ?? istM);
            }

            const det = detailRes.data as { success?: boolean; data?: unknown };
            if (detailRes.status === 200 && det.success && det.data && isRecord(det.data)) {
                setTodayDetail(asCalDay(det.data));
            } else {
                setTodayDetail(null);
            }

            const lb = listRes.data as { success?: boolean; data?: unknown };
            if (listRes.status === 200 && lb.success && Array.isArray(lb.data)) {
                const rows: ListDayRow[] = (lb.data as unknown[]).map((rec) => {
                    const r = rec as Record<string, unknown>;
                    const date = String(r.date ?? '');
                    const status = String(r.status ?? '—');
                    const day = asCalDay(rec);
                    const b = shiftBounds(day?.shifts);
                    const ind = b.inStr ?? (r.inTime != null ? String(r.inTime) : null);
                    const outd = b.outStr ?? (r.outTime != null ? String(r.outTime) : null);
                    return {
                        date,
                        status,
                        inStr: ind || null,
                        outStr: outd || null,
                        label: date ? formatDateOnlyIST(date) : '—',
                    };
                });
                setRecentAttendanceList(rows);
            } else {
                setRecentAttendanceList([]);
            }
            setLastSynced(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Network error');
            setCalendarMap({});
            setRecentAttendanceList([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [empNo, istY, istM]);

    useEffect(() => {
        const tick = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(tick);
    }, []);

    useEffect(() => {
        if (!empNo) return;
        setLoading(true);
        loadCalendar();
        const poll = setInterval(loadCalendar, POLL_MS);
        return () => clearInterval(poll);
    }, [empNo, loadCalendar]);

    useFocusEffect(
        useCallback(() => {
            if (empNo) loadCalendar();
        }, [empNo, loadCalendar])
    );

    const calendarToday = calendarMap[today] ?? null;
    const mergedToday = useMemo((): CalDay | null => {
        if (todayDetail) {
            const cal = calendarToday;
            return {
                ...cal,
                ...todayDetail,
                shifts:
                    todayDetail.shifts && todayDetail.shifts.length > 0
                        ? todayDetail.shifts
                        : cal?.shifts,
            } as CalDay;
        }
        return calendarToday;
    }, [calendarToday, todayDetail]);

    const firstShift = mergedToday?.shifts?.[0];
    const populatedShiftName =
        firstShift && isRecord(firstShift.shiftId)
            ? String((firstShift.shiftId as { name?: string }).name || '')
            : '';
    const shiftLabel = firstShift?.shiftName || populatedShiftName || 'General Shift';

    const { inStr, outStr } = useMemo(() => {
        const bounds = shiftBounds(mergedToday?.shifts);
        if (bounds.inStr || bounds.outStr) return bounds;
        return {
            inStr: mergedToday?.inTime ?? null,
            outStr: mergedToday?.outTime ?? null,
        };
    }, [mergedToday]);

    const recentRows = useMemo(() => {
        const keys = Object.keys(calendarMap)
            .filter((k) => k <= today)
            .sort()
            .reverse()
            .slice(0, 8);
        return keys.map((dateKey) => {
            const rec = calendarMap[dateKey];
            const { inStr: i, outStr: o } = shiftBounds(rec?.shifts);
            const status = rec?.status || '—';
            return { dateKey, status, inStr: i, outStr: o, label: formatDateOnlyIST(dateKey) };
        });
    }, [calendarMap, today]);

    const rawTodayStatus = (mergedToday?.status || '').toUpperCase();
    const isHolidayToday = rawTodayStatus === 'HOLIDAY';
    const isWeekOffToday = rawTodayStatus === 'WEEK_OFF';
    const isNonWorkingToday = isHolidayToday || isWeekOffToday;

    const statusLine = isHolidayToday
        ? 'Company holiday (calendar)'
        : isWeekOffToday
          ? 'Weekly off (calendar)'
          : mergedToday?.status
            ? mergedToday.status.replace(/_/g, ' ')
            : 'No record yet';

    if (!empNo && !loading) {
        return (
            <View className="flex-1 bg-white items-center justify-center px-8">
                <StatusBar style="dark" />
                <Text className="text-neutral-600 text-center font-semibold">{error || 'No employee linked.'}</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />

            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />

            <SafeAreaView className="flex-1">
                <ScrollView
                    className="flex-1 px-8 pt-6"
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCalendar(); }} />
                    }
                >
                    <View className="mb-8 flex-row items-start justify-between">
                        <View className="flex-1 mr-2">
                            <View className="mb-1 flex-row items-center">
                                <View className="mr-2 h-1 w-8 rounded-full bg-primary" />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                                    Live (syncs {Math.round(POLL_MS / 1000)}s)
                                </Text>
                            </View>
                            <Text className="text-4xl font-black tracking-tight text-neutral-900">
                                Logs<Text className="text-primary">.</Text>Live
                            </Text>
                            <Text className="mt-1 text-[11px] font-semibold text-neutral-400">
                                Period: {periodMonth ?? istM}/{periodYear ?? istY} · Today (IST) {formatDateOnlyIST(today)}
                            </Text>
                        </View>
                        <View className="items-end">
                            <View className="flex-row items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5">
                                <Radio size={12} color="#059669" />
                                <Text className="ml-1.5 text-[10px] font-black uppercase text-emerald-700">IST</Text>
                            </View>
                            {lastSynced && (
                                <Text className="mt-1 max-w-[140px] text-right text-[9px] text-neutral-400">
                                    Updated {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            )}
                        </View>
                    </View>

                    {loading && !calendarMap[today] && !todayDetail ? (
                        <View className="pb-20">
                            <SkeletonBlock height={24} width="36%" />
                            <SkeletonBlock height={220} style={{ marginTop: 12 }} radius={24} />
                            <View style={{ marginTop: 12 }}>
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                        </View>
                    ) : (
                        <>
                            {error ? (
                                <Text className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</Text>
                            ) : null}

                            <MotiView
                                from={{ opacity: 0, translateY: 20 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                className="mb-8 items-center rounded-[40px] border-2 border-neutral-50 bg-white p-8 shadow-2xl shadow-neutral-200/50"
                            >
                                <Text className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-neutral-400">
                                    Workplace time (IST)
                                </Text>
                                <MotiText
                                    key={time.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                    from={{ opacity: 0.5 }}
                                    animate={{ opacity: 1 }}
                                    className="mb-6 text-5xl font-black tracking-tighter text-neutral-900"
                                    style={{ fontVariant: ['tabular-nums'] }}
                                >
                                    {time.toLocaleTimeString('en-IN', {
                                        timeZone: 'Asia/Kolkata',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true,
                                    })}
                                </MotiText>

                                <View
                                    className={`mb-6 flex-row items-center rounded-2xl border px-5 py-2.5 ${
                                        isHolidayToday
                                            ? 'border-red-200 bg-red-50'
                                            : isWeekOffToday
                                              ? 'border-orange-200 bg-orange-50'
                                              : 'border-emerald-100/50 bg-emerald-50'
                                    }`}
                                >
                                    <MapPin
                                        size={16}
                                        color={isHolidayToday ? '#DC2626' : isWeekOffToday ? '#EA580C' : '#10B981'}
                                        strokeWidth={2.5}
                                    />
                                    <Text
                                        className={`ml-2 flex-1 text-xs font-bold italic tracking-tight ${
                                            isHolidayToday ? 'text-red-800' : isWeekOffToday ? 'text-orange-800' : 'text-emerald-700'
                                        }`}
                                    >
                                        {statusLine}
                                    </Text>
                                </View>

                                <View
                                    className="w-full rounded-3xl border border-neutral-100 bg-neutral-50/80 px-5 py-4"
                                    style={{ maxWidth: Math.min(width - 64, 400) }}
                                >
                                    {isNonWorkingToday ? (
                                        <>
                                            <Text className="mb-2 text-center text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                                {isHolidayToday ? 'Holiday' : 'Week off'} — today
                                            </Text>
                                            <Text className="text-center text-sm font-semibold leading-5 text-neutral-700">
                                                {isHolidayToday
                                                    ? 'No regular shift is expected (workspace calendar). Any punches are for audit only.'
                                                    : 'Weekly off — same behavior as the web attendance calendar for employees.'}
                                            </Text>
                                            <Text className="mt-3 text-center text-[10px] leading-4 text-neutral-400">
                                                In/out times below are hidden unless you have exception work logged.
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text className="mb-2 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                                Today — {shiftLabel}
                                            </Text>
                                            <Text className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                                Calendar + live detail (same endpoints as web)
                                            </Text>
                                            <View className="flex-row justify-between">
                                                <View>
                                                    <Text className="text-[10px] font-black uppercase text-neutral-400">In</Text>
                                                    <Text className="text-lg font-black text-neutral-900">
                                                        {inStr ? formatTimeIST(inStr) : '—'}
                                                    </Text>
                                                </View>
                                                <View className="items-end">
                                                    <Text className="text-[10px] font-black uppercase text-neutral-400">Out</Text>
                                                    <Text className="text-lg font-black text-neutral-900">
                                                        {outStr ? formatTimeIST(outStr) : '—'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text className="mt-3 text-center text-[10px] leading-4 text-neutral-400">
                                                Check-in/out reflect device punches synced to HRMS.
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </MotiView>

                            <View className="mb-8 flex-row justify-between">
                                <View className="w-[47%] items-center rounded-[32px] border-2 border-neutral-50 bg-white p-6 shadow-sm">
                                    <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
                                        <Clock size={24} color="#059669" strokeWidth={2.5} />
                                    </View>
                                    <Text className="mb-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        Hours
                                    </Text>
                                    <Text className="text-xl font-black tracking-tight text-neutral-900">
                                        {isNonWorkingToday ? '—' : formatWorkedHours(mergedToday?.totalHours ?? undefined)}
                                    </Text>
                                    {isNonWorkingToday ? (
                                        <Text className="mt-1 text-center text-[10px] font-semibold text-neutral-400">N/A</Text>
                                    ) : null}
                                </View>
                                <View className="w-[47%] items-center rounded-[32px] border-2 border-neutral-50 bg-white p-6 shadow-sm">
                                    <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50">
                                        <AlertCircle size={24} color="#D97706" strokeWidth={2.5} />
                                    </View>
                                    <Text className="mb-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        Late / early
                                    </Text>
                                    <Text className="text-center text-xs font-bold leading-5 text-neutral-900">
                                        {isNonWorkingToday
                                            ? 'Not applicable'
                                            : `In: ${formatLateEarly(mergedToday?.lateInMinutes ?? undefined)}\nOut: ${formatLateEarly(mergedToday?.earlyOutMinutes ?? undefined)}`}
                                    </Text>
                                </View>
                            </View>

                            {recentAttendanceList.length > 0 && (
                                <View className="mb-8">
                                    <Text className="mb-1 text-lg font-black tracking-tight text-neutral-900">
                                        Recent daily records
                                    </Text>
                                    <Text className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        From attendance register · rolling 14 days (IST)
                                    </Text>
                                    <View className="rounded-[28px] border border-neutral-100 bg-white p-4">
                                        {recentAttendanceList.map((row, idx) => (
                                            <View
                                                key={`${row.date}-${idx}`}
                                                className={`flex-row items-center justify-between py-2 ${
                                                    idx < recentAttendanceList.length - 1 ? 'border-b border-neutral-100' : ''
                                                }`}
                                            >
                                                <View className="min-w-0 flex-1 pr-2">
                                                    <Text className="text-xs font-black text-neutral-900">{row.label}</Text>
                                                    <Text className="text-[10px] font-bold uppercase text-neutral-400">
                                                        {row.status.replace(/_/g, ' ')}
                                                    </Text>
                                                </View>
                                                <Text className="text-xs font-bold text-neutral-600">
                                                    {row.inStr ? formatTimeIST(row.inStr) : '—'} ·{' '}
                                                    {row.outStr ? formatTimeIST(row.outStr) : '—'}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            <View className="mb-6 flex-row items-center justify-between">
                                <Text className="text-lg font-black tracking-tight text-neutral-900">Recent days</Text>
                                <View className="flex-row items-center rounded-full border border-neutral-100 bg-neutral-50 px-4 py-2">
                                    <History size={14} color="#64748B" strokeWidth={2.5} />
                                    <Text className="ml-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                        This period
                                    </Text>
                                </View>
                            </View>

                            <View className="mb-32">
                                {recentRows.length === 0 ? (
                                    <Text className="text-center text-sm text-neutral-400">No days in this period yet.</Text>
                                ) : (
                                    recentRows.map((log, idx) => {
                                        const st = (log.status || '').toUpperCase();
                                        const ok = st === 'PRESENT' || st === 'OD' || st === 'LEAVE';
                                        const presentish = st === 'PRESENT' || st === 'PARTIAL' || st === 'HALF_DAY';
                                        const hol = st === 'HOLIDAY';
                                        const wo = st === 'WEEK_OFF';
                                        return (
                                            <MotiView
                                                key={log.dateKey}
                                                from={{ opacity: 0, translateX: -10 }}
                                                animate={{ opacity: 1, translateX: 0 }}
                                                transition={{ delay: idx * 60 }}
                                                className="mb-4 flex-row items-center rounded-[32px] border-2 border-neutral-50 bg-white p-6 shadow-sm"
                                            >
                                                <View
                                                    className={`h-14 w-14 items-center justify-center rounded-[22px] border ${
                                                        hol
                                                            ? 'border-red-100 bg-red-50'
                                                            : wo
                                                              ? 'border-orange-100 bg-orange-50'
                                                              : presentish
                                                                ? 'border-emerald-100 bg-emerald-50'
                                                                : ok
                                                                  ? 'border-sky-100 bg-sky-50'
                                                                  : 'border-rose-100 bg-rose-50'
                                                    }`}
                                                >
                                                    <CheckCircle2
                                                        size={24}
                                                        color={
                                                            hol ? '#DC2626' : wo ? '#EA580C' : presentish ? '#10B981' : ok ? '#0EA5E9' : '#EF4444'
                                                        }
                                                        strokeWidth={2.5}
                                                    />
                                                </View>
                                                <View className="ml-5 flex-1">
                                                    <Text className="text-base font-black tracking-tight text-neutral-900">
                                                        {log.label}
                                                    </Text>
                                                    <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                                        {log.status}
                                                    </Text>
                                                </View>
                                                <View className="items-end rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2">
                                                    <Text className="text-xs font-black text-neutral-900">
                                                        {log.inStr ? formatTimeIST(log.inStr) : '—'} —{' '}
                                                        {log.outStr ? formatTimeIST(log.outStr) : '—'}
                                                    </Text>
                                                </View>
                                            </MotiView>
                                        );
                                    })
                                )}
                            </View>
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
