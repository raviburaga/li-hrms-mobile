import { Tabs } from 'expo-router';
import { LayoutDashboard, Clock, Calendar, User, Banknote, Users, Activity, Timer, Receipt } from 'lucide-react-native';
import { View, Platform, ActivityIndicator, Text } from 'react-native';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useAuthPersistHydrated } from '../../src/hooks/useAuthPersistHydrated';
import {
    canViewEmployeesModule,
    canViewLeavesModule,
    canViewLoansModule,
    canViewOtPermissionsModule,
    canViewPayslipsModule,
} from '../../src/lib/permissions';

const fill = { flex: 1 as const, backgroundColor: '#ffffff' as const };

export default function TabLayout() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoggingOut = useAuthStore((s) => s.isLoggingOut);
    const user = useAuthStore((s) => s.user);
    const hydrated = useAuthPersistHydrated();

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

    const tabBarShown = isAuthenticated;
    const showLeaves = canViewLeavesModule(user);
    const showLoans = canViewLoansModule(user);
    const showPayslips = canViewPayslipsModule(user);
    const showEmployees = canViewEmployeesModule(user);
    const showOtPermissions = canViewOtPermissionsModule(user);
    const isSuperAdmin = user?.role === 'super_admin';

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
                    tabBarIcon: ({ color, size }) => (
                        <LayoutDashboard size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="attendance"
                options={{
                    title: 'Attendance',
                    href: isSuperAdmin ? null : undefined,
                    tabBarIcon: ({ color, size }) => (
                        <Clock size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="live-attendance"
                options={{
                    title: 'Live',
                    href: isSuperAdmin ? undefined : null,
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
                    tabBarIcon: ({ color, size }) => (
                        <User size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="login"
                options={{
                    href: null,
                }}
            />
        </Tabs>
    );
}
