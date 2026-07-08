import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, ChevronRight, Briefcase, Shield, Smartphone } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../src/store/useAuthStore';
import { canViewProfileModule } from '../../../src/lib/permissions';
import { ModuleAccessDenied } from '../../../src/components/ModuleAccessDenied';
import { useProfileData } from '../../../src/features/profile/ProfileDataContext';
import { ProfileHero } from '../../../src/features/profile/ProfileHero';
import { ProfileContactSection } from '../../../src/features/profile/ProfileContactSection';

export default function ProfileIndexScreen() {
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const { loading } = useProfileData();
    const canViewModule = canViewProfileModule(user);

    const handleLogout = () => {
        Alert.alert('Sign Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: async () => {
                    await logout();
                },
            },
        ]);
    };

    if (!canViewModule) {
        return <ModuleAccessDenied moduleLabel="Profile" />;
    }

    if (loading && !user) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#10B981" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />

            <SafeAreaView className="flex-1">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
                    <ScrollView className="flex-1 px-8 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <View className="mb-8 flex-row items-start justify-between">
                            <View>
                                <View className="mb-1 flex-row items-center">
                                    <View className="mr-2 h-1 w-8 rounded-full bg-primary" />
                                    <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">My Account</Text>
                                </View>
                                <Text className="text-4xl font-black tracking-tight text-neutral-900">
                                    Self<Text className="text-primary">.</Text>Care
                                </Text>
                            </View>
                        </View>

                        <ProfileHero />

                        <View className="mb-6">
                            <Text className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">More</Text>
                            <TouchableOpacity
                                onPress={() => router.push('/(tabs)/profile/employment')}
                                className="mb-3 flex-row items-center rounded-[24px] border border-neutral-100 bg-white px-5 py-4 shadow-sm shadow-neutral-100"
                                activeOpacity={0.85}
                            >
                                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
                                    <Briefcase size={20} color="#059669" strokeWidth={2.5} />
                                </View>
                                <Text className="ml-4 flex-1 text-base font-black text-neutral-900">Work & organization</Text>
                                <ChevronRight size={20} color="#CBD5E1" strokeWidth={2.5} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.push('/background-setup')}
                                className="mb-3 flex-row items-center rounded-[24px] border border-neutral-100 bg-white px-5 py-4 shadow-sm shadow-neutral-100"
                                activeOpacity={0.85}
                            >
                                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sky-50">
                                    <Smartphone size={20} color="#0284C7" strokeWidth={2.5} />
                                </View>
                                <View className="ml-4 flex-1">
                                    <Text className="text-base font-black text-neutral-900">Background services</Text>
                                    <Text className="mt-0.5 text-xs text-neutral-500">Notifications, GPS & battery for on-duty</Text>
                                </View>
                                <ChevronRight size={20} color="#CBD5E1" strokeWidth={2.5} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.push('/(tabs)/profile/security')}
                                className="flex-row items-center rounded-[24px] border border-neutral-100 bg-white px-5 py-4 shadow-sm shadow-neutral-100"
                                activeOpacity={0.85}
                            >
                                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-neutral-50">
                                    <Shield size={20} color="#64748B" strokeWidth={2.5} />
                                </View>
                                <Text className="ml-4 flex-1 text-base font-black text-neutral-900">Password & security</Text>
                                <ChevronRight size={20} color="#CBD5E1" strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>

                        <ProfileContactSection />

                        <TouchableOpacity
                            onPress={handleLogout}
                            className="mb-32 flex-row items-center rounded-[32px] border-2 border-rose-100/50 bg-rose-50 p-6"
                        >
                            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                                <LogOut size={22} color="#F43F5E" strokeWidth={2.5} />
                            </View>
                            <Text className="ml-5 flex-1 text-base font-black uppercase tracking-widest text-rose-600">Sign Out</Text>
                            <ChevronRight size={20} color="#FECDD3" strokeWidth={3} />
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}
