import { View, Text, Image } from 'react-native';
import { MotiView } from 'moti';
import { User as UserIcon, Shield } from 'lucide-react-native';
import { useAuthStore } from '../../store/useAuthStore';
import { getRoleLabel } from './shared';

export function ProfileHero() {
    const { user, employee } = useAuthStore();
    const profilePhotoUri = typeof user?.profilePhoto === 'string' ? user.profilePhoto.trim() : '';

    return (
        <MotiView from={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-8 items-center">
            <View className="relative">
                <View className="mb-6 h-36 w-36 items-center justify-center rounded-[48px] border-4 border-white bg-white shadow-2xl shadow-neutral-200">
                    {profilePhotoUri ? (
                        <Image
                            source={{ uri: profilePhotoUri }}
                            className="h-28 w-28 rounded-[36px]"
                            resizeMode="cover"
                        />
                    ) : (
                        <View className="h-28 w-28 items-center justify-center rounded-[36px] bg-emerald-50">
                            <UserIcon size={56} color="#10B981" strokeWidth={2.5} />
                        </View>
                    )}
                </View>
                <View className="absolute bottom-6 right-0 h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-primary shadow-lg">
                    <Shield size={16} color="white" strokeWidth={3} />
                </View>
            </View>
            <Text className="text-3xl font-black tracking-tighter text-neutral-900">{user?.name || 'User'}</Text>
            <Text className="mt-1 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {employee?.designation?.name || getRoleLabel(user?.role || '')} · {employee?.emp_no || user?.emp_no || '—'}
            </Text>
            <View className="mt-3 rounded-full border border-neutral-100 bg-neutral-50 px-4 py-1">
                <Text className="text-[10px] font-bold uppercase text-neutral-500">{getRoleLabel(user?.role || '')}</Text>
            </View>
        </MotiView>
    );
}
