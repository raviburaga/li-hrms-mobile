import { Tabs, useRouter } from 'expo-router';
import {
    LayoutDashboard,
    Clock,
    Calendar,
    User,
    Banknote,
    Users,
    Activity,
    Timer,
    Receipt,
    Menu,
    X,
    AlertTriangle,
} from 'lucide-react-native';
import { View, Platform, ActivityIndicator, Text, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useAuthPersistHydrated } from '../../src/hooks/useAuthPersistHydrated';
import { api } from '../../src/api/client';
import {
    canViewAttendanceModule,
    canViewDashboardModule,
    canViewEmployeesModule,
    canViewLeavesModule,
    canViewLiveAttendanceModule,
    canViewLoansModule,
    canViewMobileModule,
    canViewOtPermissionsModule,
    canViewPayslipsModule,
    canViewProfileModule,
    canViewComplaintsModule,
} from '../../src/lib/permissions';

const fill = { flex: 1 as const, backgroundColor: '#ffffff' as const };
const MOBILE_FALLBACK_MODULES = [
    'DASHBOARD',
    'ATTENDANCE',
    'LIVE_ATTENDANCE',
    'EMPLOYEES',
    'LEAVE_OD',
    'LOANS',
    'PAYSLIPS',
    'OT_PERMISSIONS',
    'PROFILE',
];
const EMPLOYEE_FALLBACK_MODULES = ['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS'];

function fallbackFeatureControl(role?: string | null): string[] {
    const r = String(role || '').toLowerCase();
    if (r === 'manager' || r === 'hr' || r === 'hod') return MOBILE_FALLBACK_MODULES;
    return EMPLOYEE_FALLBACK_MODULES;
}

export default function TabLayout() {
    const router = useRouter();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
    const user = useAuthStore((s) => s.user);
    const updateUser = useAuthStore((s) => s.updateUser);
    const hydrated = useAuthPersistHydrated();
    const [resolvedFeatureControl, setResolvedFeatureControl] = useState<string[] | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const resolveFeatureControl = async () => {
            if (!hydrated || !isAuthenticated || !user?.role) {
                setResolvedFeatureControl(null);
                return;
            }

            if (Array.isArray(user.featureControl) && user.featureControl.length > 0) {
                setResolvedFeatureControl(user.featureControl);
                return;
            }

            try {
                const response = await api.getSetting(`feature_control_${user.role}`);
                const activeModules = response.data?.data?.value;
                const modules =
                    activeModules &&
                    typeof activeModules === 'object' &&
                    'activeModules' in activeModules &&
                    Array.isArray((activeModules as { activeModules?: unknown }).activeModules)
                        ? ((activeModules as { activeModules: string[] }).activeModules)
                        : null;

                if (!cancelled && modules && modules.length > 0) {
                    setResolvedFeatureControl(modules);
                    updateUser({ featureControl: modules });
                    return;
                }
            } catch {
                /* fall back below, same intent as web sidebar */
            }

            if (!cancelled) {
                const fallback = fallbackFeatureControl(user.role);
                setResolvedFeatureControl(fallback);
                updateUser({ featureControl: fallback });
            }
        };

        void resolveFeatureControl();
        return () => {
            cancelled = true;
        };
    }, [hydrated, isAuthenticated, updateUser, user?.role, user?.featureControl]);

    if (!hydrated) {
        return <View style={fill} />;
    }

    if (isLoggingOut) {
        return (
            <View style={[fill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={{ marginTop: 16, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#a3a3a3', letterSpacing: 1 }}>
                    Signing out…
                </Text>
            </View>
        );
    }

    if (isAuthenticated && user?.role && (!resolvedFeatureControl || resolvedFeatureControl.length === 0)) {
        return <View style={fill} />;
    }

    const effectiveUser =
        user && resolvedFeatureControl
            ? { ...user, featureControl: resolvedFeatureControl }
            : user;

    const tabBarShown = isAuthenticated;
    const showLeaves = canViewLeavesModule(effectiveUser);
    const showLoans = canViewLoansModule(effectiveUser);
    const showPayslips = canViewPayslipsModule(effectiveUser);
    const showEmployees = canViewEmployeesModule(effectiveUser);
    const showOtPermissions = canViewOtPermissionsModule(effectiveUser);
    const showDashboard = canViewMobileModule(effectiveUser, 'DASHBOARD');
    const showAttendance = canViewMobileModule(effectiveUser, 'ATTENDANCE');
    const showLiveAttendance = canViewLiveAttendanceModule(effectiveUser);
    const showProfile = canViewMobileModule(effectiveUser, 'PROFILE');
    const isSuperAdmin = effectiveUser?.role === 'super_admin';

    // Menu layout items list
    const menuItems = [
        {
            name: 'Leaves & OD',
            icon: Calendar,
            route: '/(tabs)/leaves',
            show: showLeaves,
            color: '#10B981',
            bg: '#ECFDF5',
        },
        {
            name: 'Live Attendance',
            icon: Activity,
            route: '/(tabs)/live-attendance',
            show: showLiveAttendance,
            color: '#3B82F6',
            bg: '#EFF6FF',
        },
        {
            name: 'Employees',
            icon: Users,
            route: '/(tabs)/employees',
            show: showEmployees,
            color: '#8B5CF6',
            bg: '#F5F3FF',
        },
        {
            name: 'Finance & Loans',
            icon: Banknote,
            route: '/(tabs)/loans',
            show: showLoans,
            color: '#0D9488',
            bg: '#F0FDFA',
        },
        {
            name: 'My Payslips',
            icon: Receipt,
            route: '/(tabs)/payslips',
            show: showPayslips,
            color: '#10B981',
            bg: '#ECFDF5',
        },
        {
            name: 'OT & Permissions',
            icon: Timer,
            route: '/(tabs)/ot-permissions',
            show: showOtPermissions,
            color: '#F59E0B',
            bg: '#FFFBEB',
        },
        {
            name: 'Complaints Hub',
            icon: AlertTriangle,
            route: '/complaints',
            show: canViewComplaintsModule(effectiveUser),
            color: '#EF4444',
            bg: '#FEF2F2',
        },
    ];

    return (
        <>
            <Tabs
                screenOptions={{
                    tabBarActiveTintColor: '#10B981',
                    tabBarInactiveTintColor: '#CBD5E1',
                    tabBarLabelStyle: {
                        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
                        fontWeight: '900',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: -5
                    },
                    tabBarStyle: tabBarShown
                        ? {
                              backgroundColor: '#FFFFFF',
                              borderTopWidth: 0,
                              elevation: 10,
                              height: 100,
                              paddingBottom: 35,
                              paddingTop: 15,
                              borderTopLeftRadius: 40,
                              borderTopRightRadius: 40,
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              shadowColor: '#10B981',
                              shadowOffset: { width: 0, height: -10 },
                              shadowOpacity: 0.08,
                              shadowRadius: 20,
                              borderWidth: 2,
                              borderColor: '#F1F5F9',
                          }
                        : { display: 'none' },
                    headerShown: false,
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        href: showDashboard ? undefined : null,
                        tabBarIcon: ({ color, size }) => (
                            <LayoutDashboard size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="attendance"
                    options={{
                        title: 'Attendance',
                        href: showAttendance && !isSuperAdmin ? undefined : null,
                        tabBarIcon: ({ color, size }) => (
                            <Clock size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="profile"
                    options={{
                        title: 'Profile',
                        href: showProfile ? undefined : null,
                        tabBarIcon: ({ color, size }) => (
                            <User size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="menu"
                    listeners={{
                        tabPress: (e) => {
                            e.preventDefault();
                            setMenuOpen(true);
                        },
                    }}
                    options={{
                        title: 'Menu',
                        tabBarIcon: ({ color, size }) => (
                            <Menu size={size} color={color} />
                        ),
                    }}
                />

                {/* Hidden tab screens (mapped to Menu bottom sheet drawer list) */}
                <Tabs.Screen
                    name="live-attendance"
                    options={{
                        title: 'Live',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Activity size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="employees"
                    options={{
                        title: 'Employees',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Users size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="leaves"
                    options={{
                        title: 'Leaves',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Calendar size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="loans"
                    options={{
                        title: 'Finance',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Banknote size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="payslips"
                    options={{
                        title: 'Payslips',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Receipt size={size} color={color} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="ot-permissions"
                    options={{
                        title: 'OT / Perm',
                        href: null,
                        tabBarIcon: ({ color, size }) => (
                            <Timer size={size} color={color} />
                        ),
                    }}
                />
            </Tabs>

            {/* Menu Bottom-to-Top Overlay Sheet Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={menuOpen}
                onRequestClose={() => setMenuOpen(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setMenuOpen(false)}
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{
                            width: '100%',
                            backgroundColor: '#FFFFFF',
                            borderTopLeftRadius: 40,
                            borderTopRightRadius: 40,
                            paddingHorizontal: 24,
                            paddingTop: 16,
                            paddingBottom: 45,
                            maxHeight: '75%',
                            shadowColor: '#10B981',
                            shadowOffset: { width: 0, height: -12 },
                            shadowOpacity: 0.1,
                            shadowRadius: 24,
                            elevation: 24,
                        }}
                    >
                        {/* Drawer Drag Bar Indicator */}
                        <View
                            style={{
                                width: 50,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#E2E8F0',
                                alignSelf: 'center',
                                marginBottom: 20,
                            }}
                        />

                        {/* Sheet Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <View>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 2, textTransform: 'uppercase' }}>
                                    HRMS Workspace
                                </Text>
                                <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 2 }}>
                                    All Modules
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setMenuOpen(false)}
                                style={{
                                    height: 40,
                                    width: 40,
                                    borderRadius: 20,
                                    backgroundColor: '#F1F5F9',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={20} color="#64748B" strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>

                        {/* Two-Column Premium Module Card Grid */}
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
                                {menuItems
                                    .filter((item) => item.show)
                                    .map((item, idx) => {
                                        const Icon = item.icon;
                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                onPress={() => {
                                                    setMenuOpen(false);
                                                    router.push(item.route as any);
                                                }}
                                                style={{
                                                    width: '48%',
                                                    backgroundColor: '#FFFFFF',
                                                    borderWidth: 2,
                                                    borderColor: '#F8FAFC',
                                                    borderRadius: 24,
                                                    padding: 16,
                                                    marginBottom: 10,
                                                    shadowColor: '#10B981',
                                                    shadowOffset: { width: 0, height: 4 },
                                                    shadowOpacity: 0.02,
                                                    shadowRadius: 8,
                                                    elevation: 1,
                                                }}
                                            >
                                                <View
                                                    style={{
                                                        height: 44,
                                                        width: 44,
                                                        borderRadius: 14,
                                                        backgroundColor: item.bg,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        marginBottom: 12,
                                                    }}
                                                >
                                                    <Icon size={22} color={item.color} strokeWidth={2.5} />
                                                </View>
                                                <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A' }}>
                                                    {item.name}
                                                </Text>
                                                <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                    Tap to Open
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                            </View>
                        </ScrollView>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </>
    );
}
