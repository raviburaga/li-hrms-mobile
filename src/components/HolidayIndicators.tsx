import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Sparkles } from 'lucide-react-native';
import { todayYmdIST, formatShortDateIST } from '../utils/dateIST';

type DayType = 'HOLIDAY' | 'WEEK_OFF';

function dismissKey(dayType: DayType): string {
    return `hrms_celebration_dismissed_${todayYmdIST()}_${dayType}`;
}

export function HolidayCelebrationModal({
    dayType,
    holidayName,
}: {
    dayType: DayType;
    holidayName?: string | null;
}) {
    const [visible, setVisible] = useState(false);
    const isHoliday = dayType === 'HOLIDAY';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const dismissed = await AsyncStorage.getItem(dismissKey(dayType));
                if (!cancelled) setVisible(!dismissed);
            } catch {
                if (!cancelled) setVisible(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dayType]);

    const dismiss = async () => {
        try {
            await AsyncStorage.setItem(dismissKey(dayType), '1');
        } catch {
            /* ignore */
        }
        setVisible(false);
    };

    if (!visible) return null;

    const headline = isHoliday ? 'Happy Holiday' : 'Happy Week Off';
    const subline = isHoliday
        ? holidayName
            ? `Today we celebrate ${holidayName}`
            : 'Take a breath — today is yours'
        : 'Your roster marked today as a well-earned break';

    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={dismiss}>
            <Pressable className="flex-1 bg-black/50" onPress={dismiss}>
                <View className="flex-1 items-center justify-center px-6">
                    <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-3xl">
                        <LinearGradient
                            colors={isHoliday ? ['#FEF3C7', '#FFF7ED', '#FFFFFF'] : ['#D1FAE5', '#ECFDF5', '#FFFFFF']}
                            className="relative px-6 py-8"
                        >
                            <TouchableOpacity
                                onPress={dismiss}
                                className="absolute right-4 top-4 rounded-full bg-white/80 p-2"
                                hitSlop={8}
                            >
                                <X size={18} color="#64748B" strokeWidth={2.5} />
                            </TouchableOpacity>

                            <View className="mb-3 items-center">
                                <View
                                    className={`rounded-2xl p-3 ${isHoliday ? 'bg-amber-100' : 'bg-emerald-100'}`}
                                >
                                    <Sparkles size={28} color={isHoliday ? '#B45309' : '#047857'} strokeWidth={2} />
                                </View>
                            </View>

                            <Text
                                className={`text-center text-[10px] font-black uppercase tracking-[0.25em] ${isHoliday ? 'text-amber-700' : 'text-emerald-700'}`}
                            >
                                {isHoliday ? 'Holiday mode' : 'Week off mode'}
                            </Text>
                            <Text className="mt-2 text-center text-2xl font-black text-neutral-900">{headline}</Text>
                            {isHoliday && holidayName ? (
                                <Text className="mt-1 text-center text-lg font-bold text-rose-600">{holidayName}</Text>
                            ) : null}
                            <Text className="mt-3 text-center text-sm leading-relaxed text-neutral-600">{subline}</Text>
                            <Text className="mt-2 text-center text-xs italic text-neutral-500">
                                {isHoliday ? 'No rush. No guilt. Just good energy.' : 'Slow down, smile, recharge fully.'}
                            </Text>

                            <TouchableOpacity
                                onPress={dismiss}
                                className={`mt-6 items-center rounded-2xl py-3.5 ${isHoliday ? 'bg-amber-500' : 'bg-emerald-600'}`}
                            >
                                <Text className="text-sm font-black uppercase tracking-wider text-white">Got it — thanks!</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </Pressable>
                </View>
            </Pressable>
        </Modal>
    );
}

export function TodayHolidayBanner({
    dayType,
    holidayName,
}: {
    dayType: 'HOLIDAY' | 'WEEK_OFF';
    holidayName?: string | null;
}) {
    const isHoliday = dayType === 'HOLIDAY';
    return (
        <View
            className={`mb-4 rounded-2xl border px-4 py-3 ${isHoliday ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
        >
            <Text
                className={`text-[10px] font-black uppercase tracking-widest ${isHoliday ? 'text-amber-800' : 'text-emerald-800'}`}
            >
                {isHoliday ? '🎊 Today is a holiday' : '🌿 Today is your week off'}
            </Text>
            <Text className={`mt-1 text-sm font-bold ${isHoliday ? 'text-amber-950' : 'text-emerald-950'}`}>
                {isHoliday
                    ? holidayName || 'Public holiday — no regular attendance expected'
                    : 'Weekly off — enjoy your break'}
            </Text>
        </View>
    );
}

type HolidayListItem = { date: string; name: string; type?: string };

export function UpcomingHolidaysPanel({
    nextName,
    nextDate,
    totalCount,
    items,
}: {
    nextName?: string | null;
    nextDate?: string | null;
    totalCount?: number;
    items?: HolidayListItem[];
}) {
    const list = items?.slice(0, 6) ?? [];
    if (!nextName && list.length === 0 && !totalCount) return null;

    return (
        <View className="mb-4 rounded-2xl border border-amber-100 bg-white p-4">
            <Text className="text-[10px] font-black uppercase tracking-widest text-amber-700">Holidays ahead</Text>
            {nextName ? (
                <Text className="mt-1 text-base font-black text-neutral-900" numberOfLines={2}>
                    Next: {nextName}
                </Text>
            ) : null}
            <Text className="mt-1 text-[11px] text-neutral-500">
                {totalCount ?? list.length} day(s) in the next 120 days (calendar + attendance)
            </Text>
            {list.length > 0 ? (
                <View className="mt-3 border-t border-neutral-100 pt-3">
                    {list.map((h) => (
                        <View key={`${h.date}-${h.name}`} className="mb-2 flex-row items-center justify-between gap-2">
                            <Text className="min-w-0 flex-1 text-xs font-semibold text-neutral-800" numberOfLines={1}>
                                {h.name}
                            </Text>
                            <Text className="shrink-0 text-[11px] font-bold tabular-nums text-neutral-500">
                                {formatShortDateIST(h.date)}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}
