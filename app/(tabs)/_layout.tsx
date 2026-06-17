import { Tabs } from 'expo-router';
import { LayoutDashboard, Clock, Calendar, User, Banknote, Users, Activity, Timer, Receipt } from 'lucide-react-native';
import { View, Platform, ActivityIndicator, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useAuthPersistHydrated } from '../../src/hooks/useAuthPersistHydrated';
import { api } from '../../src/api/client';
import {
    canViewEmployeesModule,
    canViewLeavesModule,
    canViewLoansModule,
    canViewMobileModule,
    canViewOtPermissionsModule,
    canViewPayslipsModule,
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
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
    const user = useAuthStore((s) => s.user);
    const updateUser = useAuthStore((s) => s.updateUser);
    const hydrated = useAuthPersistHydrated();
    const [resolvedFeatureControl, setResolvedFeatureControl] = useState<string[] | null>(null);

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
    const showLiveAttendance = canViewMobileModule(effectiveUser, 'LIVE_ATTENDANCE');
    const showProfile = canViewMobileModule(effectiveUser, 'PROFILE');
    const isSuperAdmin = effectiveUser?.role === 'super_admin';

    return (
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
                name="live-attendance"
                options={{
                    title: 'Live',
                    href: showLiveAttendance ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Activity size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="employees"
                options={{
                    title: 'Employees',
                    href: showEmployees ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Users size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="leaves"
                options={{
                    title: 'Leaves',
                    href: showLeaves ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Calendar size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="loans"
                options={{
                    title: 'Finance',
                    href: showLoans ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Banknote size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="payslips"
                options={{
                    title: 'Payslips',
                    href: showPayslips ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Receipt size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="ot-permissions"
                options={{
                    title: 'OT / Perm',
                    href: showOtPermissions ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Timer size={size} color={color} />
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
        </Tabs>
    );
}
