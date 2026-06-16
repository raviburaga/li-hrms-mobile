import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { router, useRootNavigationState, usePathname } from 'expo-router';
import { Check, Lock, ChevronRight, Fingerprint, UserRound } from 'lucide-react-native';
import { MotiView, MotiText } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../src/store/useAuthStore';
import { api } from '../../src/api/client';

type LoginPayload = {
    user: {
        _id: string;
        name: string;
        email: string;
        role: string;
        emp_no?: string;
        employeeId?: string;
        featureControl?: string[];
        scope?: 'global' | 'restricted';
        dataScope?: 'all' | 'department' | 'division' | 'own';
        departments?: Array<string | { _id?: string; name?: string }>;
        allowedDivisions?: Array<string | { _id?: string; name?: string }>;
    };
    token: string;
    accessToken?: string;
    refreshToken?: string;
};

/**
 * Shared sign-in UI used by the root stack `login` route and `(tabs)/login` (post-logout / in-tab sign-in).
 */
export default function LoginScreenContent() {
    const rootNavigationState = useRootNavigationState();
    const pathname = usePathname();
    const { setAuth, isAuthenticated, rememberMe: storedRememberMe, rememberedIdentifier } = useAuthStore();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [isIdentifierFocused, setIsIdentifierFocused] = useState(false);
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRememberMe(Boolean(storedRememberMe));
        if (storedRememberMe && rememberedIdentifier) {
            setIdentifier(rememberedIdentifier);
        }
    }, [rememberedIdentifier, storedRememberMe]);

    useEffect(() => {
        if (!rootNavigationState?.key) return;
        if (!isAuthenticated) return;
        
        // Only trigger layout replacement if the user is actually on the login route.
        // This avoids background-rendered instances of this component (such as in hidden tabs)
        // from hijacking the router when navigating between active tab pages like Profile.
        if (pathname === '/login') {
            router.replace('/(tabs)');
        }
    }, [rootNavigationState?.key, isAuthenticated, pathname]);

    if (isAuthenticated) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#10B981" />
            </View>
        );
    }

    const handleLogin = async () => {
        if (!identifier || !password) {
            Alert.alert('Required', 'Please enter username / employee number / email and password.');
            return;
        }

        setLoading(true);
        try {
            const response = await api.login({ identifier, email: identifier, password });
            if (response.data.success && response.data.data) {
                const payload = response.data.data as LoginPayload;
                const { user } = payload;
                const accessToken = payload.accessToken || payload.token;
                setAuth(
                    {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        emp_no: user.emp_no,
                        employeeRef: user.employeeId,
                        featureControl: Array.isArray(user.featureControl) ? user.featureControl : undefined,
                        scope: user.scope,
                        dataScope: user.dataScope,
                        departments: Array.isArray(user.departments) ? user.departments : undefined,
                        allowedDivisions: Array.isArray(user.allowedDivisions) ? user.allowedDivisions : undefined,
                    },
                    accessToken,
                    payload.refreshToken,
                    { rememberMe, identifier: identifier.trim() }
                );
                requestAnimationFrame(() => {
                    router.replace('/(tabs)');
                });
            } else {
                Alert.alert('Access Denied', response.data.message || 'Invalid credentials.');
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            const errorMsg = err.response?.data?.message || 'Unable to connect to service. Please check your network.';
            Alert.alert('Connection Error', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />

            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />

            <MotiView
                animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.03, 0.05, 0.03],
                }}
                transition={{ duration: 8000, loop: true, type: 'timing' }}
                className="absolute top-[-100] right-[-100] h-[500] w-[500] rounded-full bg-emerald-400"
            />

            <SafeAreaView className="flex-1">
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        className="flex-1 justify-center px-8"
                    >
                        <MotiView
                            from={{ opacity: 0, translateY: 30 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'spring', damping: 15 }}
                            className="mb-14"
                        >
                            <View className="mb-4 flex-row items-center">
                                <View className="green-bar mr-3 h-1 w-10 rounded-full bg-primary" />
                                <Text className="text-xs font-bold uppercase tracking-[4px] text-primary">Enterprise Portal</Text>
                            </View>
                            <Text className="text-5xl font-black leading-[55px] tracking-tight text-neutral-900">
                                Sign<Text className="text-primary">.</Text>In
                            </Text>
                            <Text className="mt-3 text-lg font-medium tracking-wide text-neutral-400">Access your workspace account</Text>
                        </MotiView>

                        <View className="space-y-6">
                            <MotiView
                                animate={{
                                    scale: isIdentifierFocused ? 1.02 : 1,
                                }}
                                className="h-20 flex-row items-center rounded-3xl border-2 border-[#F1F5F9] bg-white px-6 shadow-sm shadow-neutral-200"
                                style={{ borderColor: isIdentifierFocused ? '#10B981' : '#F1F5F9' }}
                            >
                                <UserRound size={22} color={isIdentifierFocused ? '#10B981' : '#94A6B8'} strokeWidth={2.5} />
                                <View className="ml-4 flex-1">
                                    {(isIdentifierFocused || identifier.length > 0) && (
                                        <MotiText
                                            from={{ opacity: 0, translateY: 5 }}
                                            animate={{ opacity: 1, translateY: 0 }}
                                            className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary"
                                        >
                                            Username / Employee No / Email
                                        </MotiText>
                                    )}
                                    <TextInput
                                        placeholder={!isIdentifierFocused ? 'Username / Employee No / Email' : ''}
                                        value={identifier}
                                        onChangeText={setIdentifier}
                                        onFocus={() => setIsIdentifierFocused(true)}
                                        onBlur={() => setIsIdentifierFocused(false)}
                                        className="p-0 text-lg font-bold text-neutral-900"
                                        placeholderTextColor="#CBD5E1"
                                        autoCapitalize="none"
                                    />
                                </View>
                            </MotiView>

                            <MotiView
                                animate={{
                                    scale: isPasswordFocused ? 1.02 : 1,
                                }}
                                className="mt-5 h-20 flex-row items-center rounded-3xl border-2 border-[#F1F5F9] bg-white px-6 shadow-sm shadow-neutral-200"
                                style={{ borderColor: isPasswordFocused ? '#10B981' : '#F1F5F9' }}
                            >
                                <Lock size={22} color={isPasswordFocused ? '#10B981' : '#94A6B8'} strokeWidth={2.5} />
                                <View className="ml-4 flex-1">
                                    {(isPasswordFocused || password.length > 0) && (
                                        <MotiText
                                            from={{ opacity: 0, translateY: 5 }}
                                            animate={{ opacity: 1, translateY: 0 }}
                                            className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary"
                                        >
                                            Secure Password
                                        </MotiText>
                                    )}
                                    <TextInput
                                        placeholder={!isPasswordFocused ? 'Password' : ''}
                                        value={password}
                                        onChangeText={setPassword}
                                        onFocus={() => setIsPasswordFocused(true)}
                                        onBlur={() => setIsPasswordFocused(false)}
                                        secureTextEntry
                                        className="p-0 text-lg font-bold text-neutral-900"
                                        placeholderTextColor="#CBD5E1"
                                    />
                                </View>
                            </MotiView>

                            <View className="mt-4 flex-row items-center justify-between px-2">
                                <TouchableOpacity
                                    onPress={() => setRememberMe((value) => !value)}
                                    activeOpacity={0.85}
                                    className="flex-row items-center"
                                >
                                    <View
                                        className={`mr-2 h-5 w-5 items-center justify-center rounded-md border ${
                                            rememberMe ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-300 bg-white'
                                        }`}
                                    >
                                        {rememberMe ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                                    </View>
                                    <Text className="text-xs font-bold uppercase tracking-widest text-neutral-500">Remember me</Text>
                                </TouchableOpacity>
                                <TouchableOpacity className="px-2">
                                    <Text className="text-xs font-bold uppercase tracking-widest text-neutral-400">Recovery Access?</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                onPress={handleLogin}
                                activeOpacity={0.9}
                                disabled={loading}
                                className={`mt-8 ${loading ? 'opacity-70' : ''}`}
                            >
                                <LinearGradient
                                    colors={['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    className="h-20 flex-row items-center justify-center rounded-3xl shadow-2xl shadow-emerald-500/40"
                                >
                                    {loading ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <>
                                            <Text className="mr-2 text-xl font-black uppercase tracking-widest text-white">Login to Account</Text>
                                            <ChevronRight size={24} color="white" strokeWidth={3} />
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity className="mt-6 items-center">
                                <View className="h-16 w-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
                                    <Fingerprint size={28} color="#10B981" />
                                </View>
                                <Text className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Biometric Sign-in</Text>
                            </TouchableOpacity>
                        </View>

                        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 800 }} className="mt-16 items-center">
                            <View className="w-full items-center rounded-[32px] border border-neutral-100 bg-neutral-50 p-6">
                                <Text className="mb-1 text-xs font-bold uppercase tracking-tighter text-neutral-500">Authorization required</Text>
                                <Text className="px-4 text-center text-[11px] leading-5 text-neutral-400">
                                    To ensure workplace security, please contact your{' '}
                                    <Text className="font-black text-primary">Department Admin</Text> for official system credentials.
                                </Text>
                            </View>
                        </MotiView>
                    </KeyboardAvoidingView>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
