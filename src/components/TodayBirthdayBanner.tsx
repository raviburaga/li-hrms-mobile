import { View, Text, ScrollView } from 'react-native';
import { Cake } from 'lucide-react-native';

export type TodayBirthdayItem = {
    id: string;
    name: string;
    designationName: string;
};

export function TodayBirthdayBanner({ items }: { items: TodayBirthdayItem[] }) {
    if (items.length === 0) return null;

    return (
        <View className="mb-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white">
            <View className="flex-row items-center border-b border-emerald-100 bg-emerald-50 px-3 py-2.5">
                <Cake size={16} color="#047857" strokeWidth={2.5} />
                <Text className="ml-2 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                    Today&apos;s birthday{items.length > 1 ? 's' : ''}
                </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3 py-3">
                {items.map((item, idx) => (
                    <View
                        key={item.id}
                        className={`mr-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 ${idx === items.length - 1 ? 'mr-3' : ''}`}
                    >
                        <Text className="text-xs font-black text-emerald-900">🎉 {item.name}</Text>
                        <Text className="mt-0.5 text-[10px] font-medium text-emerald-700">{item.designationName}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
