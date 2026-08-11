import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Linking,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { MotiView } from 'moti';
import {
    LayoutDashboard,
    Calendar,
    Clock,
    Bell,
    BellRing,
    Users,
    CheckCircle2,
    Star,
    Coffee,
    User,
    ChevronRight,
    Building2,
    Banknote,
    Timer,
    Receipt,
    LifeBuoy,
    AlertTriangle,
    LogOut,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useAuthStore } from '../../src/store/useAuthStore';
import { api, ApiEnvelope } from '../../src/api/client';
import { formatTimeIST, todayYmdIST } from '../../src/utils/dateIST';
import { SkeletonBlock, SkeletonCard } from '../../src/components/Skeleton';
import { UpdateEnforcer } from '../../src/features/update/UpdateEnforcer';
import {
    canViewAttendanceModule,
    canViewDashboardModule,
    canViewLeavesModule,
    canViewLoansModule,
    canViewOtPermissionsModule,
    canViewPayslipsModule,
    canViewProfileModule,
    canViewComplaintsModule,
} from '../../src/lib/permissions';
import { ModuleAccessDenied } from '../../src/components/ModuleAccessDenied';
import { useNotificationStore } from '../../src/notifications/notificationStore';
import { TodayBirthdayBanner, type TodayBirthdayItem } from '../../src/components/TodayBirthdayBanner';
import { showAppToast } from '../../src/ui/toast';
import {
    HolidayCelebrationModal,
    TodayHolidayBanner,
    UpcomingHolidaysPanel,
} from '../../src/components/HolidayIndicators';
import { formatShortDateIST } from '../../src/utils/dateIST';

type DashboardStats = {
    totalEmployees?: number;
    pendingLeaves?: number;
    approvedLeaves?: number;
    todayPresent?: number;
    todayAbsent?: number;
    upcomingHolidays?: number;
    upcomingHolidaysList?: Array<{ date: string; name: string; type?: string }>;
    nextHolidayName?: string | null;
    nextHolidayDate?: string | null;
    isTodayHoliday?: boolean;
    isTodayWeekOff?: boolean;
    todayHolidayName?: string | null;
    todayDayType?: string;
    myPendingLeaves?: number;
    myApprovedLeaves?: number;
    teamPendingApprovals?: number;
    efficiencyScore?: number;
    departmentFeed?: Array<Record<string, unknown>>;
    leaveBalance?: number;
    compensatoryOffBalance?: number | null;
    yearlyClCreditDaysPosted?: number | null;
    yearlyCclCreditDaysPosted?: number | null;
    financialYearRegister?: string | null;
};

type AttendanceDay = {
    status?: string;
    inTime?: string | null;
    outTime?: string | null;
    isLateIn?: boolean;
    shifts?: Array<{
        inTime?: string | null;
        outTime?: string | null;
        shiftEndTime?: string | null;
        shiftName?: string;
        isLateIn?: boolean;
        shiftId?: { name?: string } | unknown;
    }>;
    shiftId?: { name?: string } | unknown;
};

function isPresentRow(data: AttendanceDay | null): boolean {
    if (!data) return false;
    const s = (data.status || '').toUpperCase();
    return s === 'PRESENT' || s === 'PARTIAL' || s === 'HALF_DAY';
}

function isNonWorkingCalendarDay(data: AttendanceDay | null): boolean {
    const s = (data?.status || '').toUpperCase();
    return s === 'HOLIDAY' || s === 'WEEK_OFF';
}

function workStatusHeadline(data: AttendanceDay | null): string {
    if (!data) return 'Not clocked in';
    const s = (data.status || '').toUpperCase();
    if (s === 'HOLIDAY') return 'Public holiday';
    if (s === 'WEEK_OFF') return 'Weekly off';
    if (s === 'LEAVE') return 'On leave';
    if (s === 'OD') return 'On duty';
    if (isPresentRow(data)) return 'Clocked in';
    return 'Not clocked in';
}

function statusDisplay(data: AttendanceDay | null): string {
    if (!data) return 'No record';
    return (data.status || '—').replace(/_/g, ' ');
}

function pickInTime(rec: AttendanceDay | null): string | null | undefined {
    if (!rec) return undefined;
    if (rec.inTime) return rec.inTime;
    return rec.shifts?.[0]?.inTime;
}

function pickOutTime(rec: AttendanceDay | null): string | null | undefined {
    if (!rec) return undefined;
    if (rec.outTime) return rec.outTime;
    return rec.shifts?.[0]?.outTime;
}

function expectedOutDisplay(rec: AttendanceDay | null): string {
    const direct = pickOutTime(rec);
    if (direct) return formatTimeIST(direct);
    const end = rec?.shifts?.[0]?.shiftEndTime;
    if (end) {
        const date = todayYmdIST();
        return formatTimeIST(`${date}T${end}`);
    }
    return '--:--';
}

function DashboardMetricCard({
    title,
    value,
    description,
    icon: Icon,
    iconColor,
    iconBg,
}: {
    title: string;
    value: string | number;
    description: string;
    icon: typeof Calendar;
    iconColor: string;
    iconBg: string;
}) {
    return (
        <View className="mb-4 w-[48%] rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <View className="mb-3 flex-row items-start justify-between">
                <View className="min-w-0 flex-1 pr-2">
                    <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{title}</Text>
                    <Text className="mt-1 text-xl font-black text-neutral-900" numberOfLines={1}>
                        {value}
                    </Text>
                </View>
                <View className="rounded-xl border border-neutral-100 p-2" style={{ backgroundColor: iconBg }}>
                    <Icon size={20} color={iconColor} strokeWidth={2.5} />
                </View>
            </View>
            <Text className="text-[10px] font-medium text-neutral-500" numberOfLines={3}>
                {description}
            </Text>
        </View>
    );
}

function QuickLinkRow({
    label,
    desc,
    onPress,
    icon: Icon,
    color,
    bg,
}: {
    label: string;
    desc: string;
    onPress: () => void;
    icon: typeof Calendar;
    color: string;
    bg: string;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            className="mb-3 flex-row items-center rounded-2xl border border-neutral-100 bg-white p-4"
        >
            <View className="rounded-xl p-3" style={{ backgroundColor: bg }}>
                <Icon size={20} color={color} strokeWidth={2.5} />
            </View>
            <View className="min-w-0 flex-1 px-3">
                <Text className="text-xs font-black uppercase tracking-tight text-neutral-900">{label}</Text>
                <Text className="text-[10px] text-neutral-500">{desc}</Text>
            </View>
            <ChevronRight size={18} color="#CBD5E1" strokeWidth={2.5} />
        </TouchableOpacity>
    );
}

export default function DashboardScreen() {
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const empNo = (user?.emp_no || '').trim().toUpperCase();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<DashboardStats>({});
    const [attendanceRow, setAttendanceRow] = useState<AttendanceDay | null>(null);
    const [ticketLoading, setTicketLoading] = useState(false);
    const notificationUnread = useNotificationStore((s) => s.unreadCount);
    const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
    const [todayBirthdayItems, setTodayBirthdayItems] = useState<TodayBirthdayItem[]>([]);

    const userRole = user?.role || 'employee';
    const showOtPermQuick = canViewOtPermissionsModule(user);
    const showPayslipsQuick = canViewPayslipsModule(user);
    const showLeavesQuick = canViewLeavesModule(user);
    const showAttendanceQuick = canViewAttendanceModule(user);
    const showLoansQuick = canViewLoansModule(user);
    const showProfileQuick = canViewProfileModule(user);
    const showComplaintsQuick = canViewComplaintsModule(user);

    const handleLogout = () => {
        Alert.alert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: () => {
                    void logout();
                },
            },
        ]);
    };

    const loadData = useCallback(async () => {
        if (!useAuthStore.getState().isAuthenticated) return;
        try {
            const today = todayYmdIST();

            const [statsRes, detailRes, birthdayRes] = await Promise.all([
                api.getDashboardStats(),
                empNo ? api.getAttendanceDetail(empNo, today) : Promise.resolve({ status: 404, data: {} }),
                api.getBirthdaysSummary({ today: true, includeLeft: false }),
            ]);
            void refreshUnreadCount();

            if (statsRes.status !== 200 || !statsRes.data?.success) {
                setStats({});
            } else {
                const statsBody = statsRes.data;
                if (statsBody.data && typeof statsBody.data === 'object' && !Array.isArray(statsBody.data)) {
                    setStats(statsBody.data as DashboardStats);
                } else {
                    setStats({});
                }
            }

            const d = detailRes.data as { success?: boolean; data?: unknown };
            if (
                detailRes.status === 200 &&
                d.success &&
                d.data &&
                typeof d.data === 'object' &&
                !Array.isArray(d.data)
            ) {
                setAttendanceRow(d.data as AttendanceDay);
            } else {
                setAttendanceRow(null);
            }

            const bBody = birthdayRes.data as ApiEnvelope<Array<Record<string, unknown>>>;
            if (birthdayRes.status === 200 && bBody.success && Array.isArray(bBody.data)) {
                setTodayBirthdayItems(
                    bBody.data.map((emp) => ({
                        id: String(emp._id || emp.emp_no || ''),
                        name: String(emp.employee_name || emp.emp_no || 'Employee'),
                        designationName:
                            (typeof emp.designation_id === 'object' &&
                                emp.designation_id &&
                                'name' in emp.designation_id &&
                                String((emp.designation_id as { name?: string }).name)) ||
                            (typeof emp.designation === 'object' &&
                                emp.designation &&
                                'name' in emp.designation &&
                                String((emp.designation as { name?: string }).name)) ||
                            '—',
                    }))
                );
            } else {
                setTodayBirthdayItems([]);
            }
        } catch {
            setStats({});
            setAttendanceRow(null);
            setTodayBirthdayItems([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [empNo, refreshUnreadCount]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const headerDate = useMemo(
        () =>
            new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                timeZone: 'Asia/Kolkata',
            }),
        []
    );

    const showGlobalAttendanceCard = userRole !== 'super_admin';

    const openTicketPortal = useCallback(async () => {
        if (ticketLoading) return;

        setTicketLoading(true);
        try {
            const response = await api.getTicketSsoUrl();
            const url = response.data?.data?.url;
            if (response.status === 200 && response.data?.success && url) {
                await Linking.openURL(url);
                return;
            }
            showAppToast(
                response.data?.message || 'Could not open the ticket management portal. Please try again later.',
                'error'
            );
        } catch {
            showAppToast('Could not connect to generate a ticket portal login link.', 'error');
        } finally {
            setTicketLoading(false);
        }
    }, [ticketLoading]);

    const employeeCco =
        stats.compensatoryOffBalance != null && Number.isFinite(Number(stats.compensatoryOffBalance))
            ? Number(stats.compensatoryOffBalance)
            : null;
    const fyLabel = stats.financialYearRegister || '';
    const clPosted = stats.yearlyClCreditDaysPosted ?? null;
    const cclPosted = stats.yearlyCclCreditDaysPosted ?? null;
    const ccoDescription =
        fyLabel && clPosted != null && cclPosted != null
            ? `FY ${fyLabel}: ${clPosted} CL credited · ${cclPosted} CCL credited`
            : 'From leave register; FY credits when available';

    if (loading && !refreshing) {
        return (
            <View className="flex-1 bg-white px-6 pt-8">
                <SkeletonBlock height={14} width="28%" />
                <SkeletonBlock height={34} width="56%" style={{ marginTop: 10 }} />
                <SkeletonBlock height={170} style={{ marginTop: 16 }} radius={24} />
                <View style={{ marginTop: 14 }}>
                    <SkeletonCard />
                    <SkeletonCard />
                </View>
            </View>
        );
    }

    if (!canViewDashboardModule(user)) {
        return <ModuleAccessDenied moduleLabel="Dashboard" />;
    }

    const nonWorking = isNonWorkingCalendarDay(attendanceRow);
    const isTodayHoliday = Boolean(stats.isTodayHoliday);
    const isTodayWeekOff = Boolean(stats.isTodayWeekOff);
    const nextHolName =
        stats.nextHolidayName || (stats.upcomingHolidaysList && stats.upcomingHolidaysList[0]?.name) || null;
    const nextHolDate =
        stats.nextHolidayDate || (stats.upcomingHolidaysList && stats.upcomingHolidaysList[0]?.date) || null;
    const holCount = stats.upcomingHolidays ?? stats.upcomingHolidaysList?.length ?? 0;

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <UpdateEnforcer />

            {(isTodayHoliday || isTodayWeekOff) && (
                <HolidayCelebrationModal
                    dayType={isTodayHoliday ? 'HOLIDAY' : 'WEEK_OFF'}
                    holidayName={stats.todayHolidayName}
                />
            )}

            <SafeAreaView className="flex-1">
                <ScrollView
                    className="flex-1 px-6 pt-5"
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
                >
                    <MotiView from={{ opacity: 0, translateY: -12 }} animate={{ opacity: 1, translateY: 0 }} className="mb-6 flex-row items-start justify-between">
                        <View className="min-w-0 flex-1 pr-3">
                            <View className="mb-1 flex-row items-center">
                                <View className="mr-2 h-1 w-8 rounded-full bg-emerald-500" />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{headerDate}</Text>
                            </View>
                            <Text className="text-3xl font-black tracking-tight text-neutral-900" numberOfLines={2}>
                                Welcome, {user?.name?.split(' ')[0] || 'there'}
                            </Text>
                            <Text className="mt-1 text-xs font-medium text-neutral-500">Here&apos;s what&apos;s happening today</Text>
                        </View>
                        <MotiView
                            animate={
                                notificationUnread > 0
                                    ? { scale: [1, 1.08, 1, 1.06, 1, 1] }
                                    : { scale: 1 }
                            }
                            transition={
                                notificationUnread > 0
                                    ? {
                                          type: 'timing',
                                          duration: 1250,
                                          loop: true,
                                      }
                                    : {
                                          type: 'timing',
                                          duration: 180,
                                      }
                            }
                        >
                            <TouchableOpacity
                                onPress={() => router.push('/notifications')}
                                className="relative h-14 w-14 items-center justify-center rounded-2xl border border-neutral-100 bg-white shadow-sm"
                                accessibilityLabel="Open notifications"
                            >
                                <MotiView
                                    animate={
                                        notificationUnread > 0
                                            ? {
                                                  rotate: ['0deg', '8deg', '-8deg', '7deg', '-7deg', '6deg', '-6deg', '0deg'],
                                              }
                                            : { rotate: '0deg' }
                                    }
                                    transition={
                                        notificationUnread > 0
                                            ? {
                                                  type: 'timing',
                                                  duration: 260,
                                                  loop: true,
                                              }
                                            : {
                                                  type: 'timing',
                                                  duration: 180,
                                              }
                                    }
                                >
                                    {notificationUnread > 0 ? (
                                        <BellRing size={22} color="#0F172A" strokeWidth={2.5} />
                                    ) : (
                                        <Bell size={22} color="#0F172A" strokeWidth={2.5} />
                                    )}
                                </MotiView>
                                {notificationUnread > 0 ? (
                                    <View className="absolute right-1 top-1 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 py-0.5">
                                        <Text className="text-[10px] font-black text-white">
                                            {notificationUnread > 99 ? '99+' : notificationUnread}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        </MotiView>
                    </MotiView>

                    {todayBirthdayItems.length > 0 ? <TodayBirthdayBanner items={todayBirthdayItems} /> : null}

                    {(isTodayHoliday || isTodayWeekOff) ? (
                        <TodayHolidayBanner
                            dayType={isTodayHoliday ? 'HOLIDAY' : 'WEEK_OFF'}
                            holidayName={stats.todayHolidayName}
                        />
                    ) : null}

                    {showGlobalAttendanceCard && (
                        <MotiView from={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mb-8 overflow-hidden rounded-3xl">
                            <LinearGradient
                                colors={['#059669', '#10B981']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                className="p-5"
                            >
                                <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3">
                                    <View className="flex-row items-center gap-3">
                                        <View className="h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15">
                                            <Clock size={26} color="white" strokeWidth={2.5} />
                                        </View>
                                        <View>
                                            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">Your work status</Text>
                                            <Text className="text-lg font-black text-white">{workStatusHeadline(attendanceRow)}</Text>
                                        </View>
                                    </View>
                                    <View
                                        className={`rounded-2xl px-4 py-2 ${
                                            isPresentRow(attendanceRow) ? 'bg-white' : 'border border-white/25 bg-white/10'
                                        }`}
                                    >
                                        <Text
                                            className={`text-[10px] font-black uppercase tracking-widest ${
                                                isPresentRow(attendanceRow) ? 'text-emerald-700' : 'text-white'
                                            }`}
                                        >
                                            {statusDisplay(attendanceRow)}
                                        </Text>
                                    </View>
                                </View>

                                {nonWorking ? (
                                    <View className="rounded-2xl border border-white/15 bg-black/10 px-4 py-4">
                                        <Text className="text-center text-sm font-bold text-white">
                                            {(attendanceRow?.status || '').toUpperCase() === 'HOLIDAY'
                                                ? 'Company holiday — no regular attendance is expected today (same rules as workspace calendar).'
                                                : 'Weekly off — no regular shift attendance expected today.'}
                                        </Text>
                                    </View>
                                ) : (
                                    <>
                                        <View className="flex-row flex-wrap gap-2">
                                            <View className="min-w-[44%] flex-1 rounded-2xl border border-white/15 bg-black/10 px-4 py-3">
                                                <Text className="text-[9px] font-bold uppercase text-white/60">In time</Text>
                                                <Text className="font-mono text-base font-black text-white">
                                                    {pickInTime(attendanceRow) ? formatTimeIST(pickInTime(attendanceRow)!) : '--:--'}
                                                </Text>
                                            </View>
                                            <View className="min-w-[44%] flex-1 rounded-2xl border border-white/15 bg-black/10 px-4 py-3">
                                                <Text className="text-[9px] font-bold uppercase text-white/60">Expected out</Text>
                                                <Text className="font-mono text-base font-black text-white">
                                                    {expectedOutDisplay(attendanceRow)}
                                                </Text>
                                            </View>
                                        </View>

                                        {attendanceRow?.shifts && attendanceRow.shifts.length > 0 ? (
                                            <View className="mt-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                                                {attendanceRow.shifts.map((shift, idx) => (
                                                    <View key={idx} className={idx > 0 ? 'mt-3 border-t border-white/10 pt-3' : ''}>
                                                        <Text className="text-[9px] font-semibold uppercase text-emerald-100">Shift</Text>
                                                        <Text className="text-xs font-bold text-white">
                                                            {shift.shiftName ||
                                                                (typeof shift.shiftId === 'object' && shift.shiftId && 'name' in shift.shiftId
                                                                    ? String((shift.shiftId as { name?: string }).name)
                                                                    : 'General')}
                                                        </Text>
                                                        <View className="mt-2 flex-row justify-between">
                                                            <Text className="text-xs text-white/90">{formatTimeIST(shift.inTime)}</Text>
                                                            <Text className="text-xs text-white/90">{formatTimeIST(shift.outTime)}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : attendanceRow?.inTime || attendanceRow?.outTime ? (
                                            <View className="mt-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                                                <Text className="text-center text-xs text-white/90">
                                                    {formatTimeIST(attendanceRow.inTime)} → {formatTimeIST(attendanceRow.outTime)}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View className="mt-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                                                <Text className="text-center text-xs text-white/80">
                                                    No check-in yet — waiting for attendance log
                                                </Text>
                                            </View>
                                        )}
                                    </>
                                )}
                            </LinearGradient>
                        </MotiView>
                    )}

                    {/* Role blocks — mirror web dashboard/stats */}
                    {userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin' ? (
                        <View className="mb-6 flex-row flex-wrap justify-between">
                            <DashboardMetricCard
                                title="Total workforce"
                                value={stats.totalEmployees ?? 0}
                                description="Active employees (scope)"
                                icon={Users}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                            <DashboardMetricCard
                                title="Pending approvals"
                                value={stats.pendingLeaves ?? 0}
                                description="Requires your action"
                                icon={Clock}
                                iconColor="#D97706"
                                iconBg="#FFFBEB"
                            />
                            <DashboardMetricCard
                                title="Approved leaves"
                                value={stats.approvedLeaves ?? 0}
                                description="Finalized records"
                                icon={CheckCircle2}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                            <DashboardMetricCard
                                title="Active today"
                                value={stats.todayPresent ?? 0}
                                description="Present count"
                                icon={Calendar}
                                iconColor="#059669"
                                iconBg="#D1FAE5"
                            />
                        </View>
                    ) : userRole === 'hod' || userRole === 'manager' ? (
                        <View className="mb-6 flex-row flex-wrap justify-between">
                            <DashboardMetricCard
                                title="Team strength"
                                value={stats.totalEmployees ?? 0}
                                description="Total members"
                                icon={Users}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                            <DashboardMetricCard
                                title="Team present"
                                value={stats.todayPresent ?? 0}
                                description="Today"
                                icon={Calendar}
                                iconColor="#047857"
                                iconBg="#D1FAE5"
                            />
                            <DashboardMetricCard
                                title="Pending team"
                                value={stats.teamPendingApprovals ?? 0}
                                description="Awaiting decision"
                                icon={Clock}
                                iconColor="#D97706"
                                iconBg="#FFFBEB"
                            />
                            <DashboardMetricCard
                                title="Efficiency"
                                value={`${stats.efficiencyScore ?? 0}%`}
                                description="Department avg"
                                icon={CheckCircle2}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                        </View>
                    ) : (
                        <View className="mb-6 flex-row flex-wrap justify-between">
                            <DashboardMetricCard
                                title="Leave balance"
                                value={stats.leaveBalance ?? 0}
                                description="Available days"
                                icon={Calendar}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                            <DashboardMetricCard
                                title="Comp. off (CCL)"
                                value={employeeCco != null ? employeeCco : '—'}
                                description={ccoDescription}
                                icon={Coffee}
                                iconColor="#B45309"
                                iconBg="#FFFBEB"
                            />
                            <DashboardMetricCard
                                title="Active requests"
                                value={stats.myPendingLeaves ?? 0}
                                description="Awaiting approval"
                                icon={Clock}
                                iconColor="#D97706"
                                iconBg="#FFFBEB"
                            />
                            <DashboardMetricCard
                                title="Monthly presence"
                                value={stats.todayPresent ?? 0}
                                description="Present days (period)"
                                icon={CheckCircle2}
                                iconColor="#059669"
                                iconBg="#ECFDF5"
                            />
                            <DashboardMetricCard
                                title="Holidays ahead"
                                value={nextHolName || holCount || '—'}
                                description={
                                    nextHolDate
                                        ? `Next: ${formatShortDateIST(nextHolDate)} · ${holCount} in next 120d`
                                        : 'Calendar for your division / group'
                                }
                                icon={Star}
                                iconColor="#CA8A04"
                                iconBg="#FEF9C3"
                            />
                        </View>
                    )}

                    {(nextHolName || (stats.upcomingHolidaysList?.length ?? 0) > 0) ? (
                        <UpcomingHolidaysPanel
                            nextName={nextHolName}
                            nextDate={nextHolDate}
                            totalCount={holCount}
                            items={stats.upcomingHolidaysList}
                        />
                    ) : null}

                    <View className="mb-3 flex-row items-center gap-2">
                        <LayoutDashboard size={20} color="#059669" strokeWidth={2.5} />
                        <Text className="text-base font-black text-neutral-900">My portal</Text>
                    </View>
                    <View className="mb-24 rounded-3xl border border-neutral-100 bg-white/80 p-4">
                        {showComplaintsQuick ? (
                            <QuickLinkRow
                                label="Complaints hub"
                                desc="Register and track grievances"
                                icon={AlertTriangle}
                                color="#E11D48"
                                bg="#FFE4E6"
                                onPress={() => router.push('/complaints')}
                            />
                        ) : null}
                        {showLeavesQuick ? (
                            <QuickLinkRow
                                label="Apply absence"
                                desc="Leave or OD request"
                                icon={Calendar}
                                color="#059669"
                                bg="#ECFDF5"
                                onPress={() => router.push('/(tabs)/leaves')}
                            />
                        ) : null}
                        {showOtPermQuick ? (
                            <QuickLinkRow
                                label="OT & permissions"
                                desc="Requests, approvals, gate QR (same as web)"
                                icon={Timer}
                                color="#B45309"
                                bg="#FFFBEB"
                                onPress={() => router.push('/(tabs)/ot-permissions')}
                            />
                        ) : null}
                        {showAttendanceQuick ? (
                            <QuickLinkRow
                                label="Time card"
                                desc="Review daily logs (same as web)"
                                icon={Clock}
                                color="#047857"
                                bg="#D1FAE5"
                                onPress={() => router.push('/(tabs)/attendance')}
                            />
                        ) : null}
                        {(userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') && showProfileQuick ? (
                            <QuickLinkRow
                                label="Workspace focus"
                                desc="HRMS web for full directory & payroll"
                                icon={Building2}
                                color="#0D9488"
                                bg="#CCFBF1"
                                onPress={() => router.push('/(tabs)/profile')}
                            />
                        ) : null}
                        {showLoansQuick ? (
                            <QuickLinkRow
                                label="Loans & advances"
                                desc="Apply and track finance requests"
                                icon={Banknote}
                                color="#0F766E"
                                bg="#CCFBF1"
                                onPress={() => router.push('/(tabs)/loans')}
                            />
                        ) : null}
                        {showPayslipsQuick ? (
                            <QuickLinkRow
                                label="My payslips"
                                desc="View released salary slips (same as web)"
                                icon={Receipt}
                                color="#047857"
                                bg="#D1FAE5"
                                onPress={() => router.push('/(tabs)/payslips')}
                            />
                        ) : null}
                        {showProfileQuick ? (
                            <QuickLinkRow
                                label="Profile & security"
                                desc="Account, org hierarchy, password"
                                icon={User}
                                color="#0D9488"
                                bg="#CCFBF1"
                                onPress={() => router.push('/(tabs)/profile')}
                            />
                        ) : (
                            <QuickLinkRow
                                label="Sign out"
                                desc="End your session"
                                icon={LogOut}
                                color="#BE123C"
                                bg="#FFE4E6"
                                onPress={handleLogout}
                            />
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>

            <TouchableOpacity
                activeOpacity={0.88}
                disabled={ticketLoading}
                onPress={openTicketPortal}
                accessibilityRole="button"
                accessibilityLabel="Raise a ticket for any queries"
                className="absolute bottom-32 right-5 flex-row items-end"
            >
                <View className="mr-2 max-w-[190px] rounded-2xl border border-teal-100 bg-white px-3 py-2 shadow-sm">
                    <Text className="text-[12px] font-black text-neutral-900">Have any queries?</Text>
                    <Text className="mt-0.5 text-[10px] font-medium text-neutral-500">
                        Tap here to raise a ticket.
                    </Text>
                </View>
                <View className="h-14 w-14 items-center justify-center rounded-full border-[3px] border-teal-500 bg-emerald-50 shadow-sm">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-emerald-600">
                        {ticketLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <LifeBuoy size={22} color="#FFFFFF" strokeWidth={2.5} />
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}
