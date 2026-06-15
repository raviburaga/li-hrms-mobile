import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { api, ApiEnvelope } from '../../src/api/client';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { formatInr, formatSectionValue } from '../../src/lib/payslipFormat';

type SectionItem = { header: string; value: string | number; order?: number };
type PayslipSections = {
    attendance: SectionItem[];
    earnings: SectionItem[];
    deductions: SectionItem[];
    hasConfiguredSections?: boolean;
    totalEarnings?: number;
    totalDeductions?: number;
    netPayable?: number;
};
type PayslipLoanItem = {
    label?: string;
    balanceBefore?: number;
    emiDeducted?: number;
    balanceAfter?: number;
};
type PayslipLoans = {
    items?: PayslipLoanItem[];
    hasLoans?: boolean;
};
type PayrollDetail = {
    _id: string;
    monthName?: string;
    year?: number;
    status?: string;
    emp_no?: string;
    payslipSections?: PayslipSections;
    payslipLoans?: PayslipLoans;
    employeeId?: {
        employee_name?: string;
        emp_no?: string;
        department_id?: { name?: string } | string;
        designation_id?: { name?: string } | string;
        bank_account_no?: string;
    };
};

function refName(d: unknown): string {
    if (!d) return '—';
    if (typeof d === 'string') return d;
    if (typeof d === 'object' && d !== null && 'name' in d) return String((d as { name?: string }).name || '—');
    return '—';
}

function withTotals(sections: PayslipSections): PayslipSections {
    if (sections.totalEarnings != null && sections.netPayable != null) return sections;
    const totalEarnings = sections.earnings.reduce((s, i) => s + (Number(i.value) || 0), 0);
    const totalDeductions = sections.deductions.reduce((s, i) => s + (Number(i.value) || 0), 0);
    return {
        ...sections,
        totalEarnings,
        totalDeductions,
        netPayable: totalEarnings - totalDeductions,
    };
}

function Field({ label, value }: { label: string; value?: string }) {
    return (
        <View className="mb-3 min-w-[44%] flex-1">
            <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{label}</Text>
            <Text className="mt-0.5 text-sm font-bold text-neutral-900">{value || '—'}</Text>
        </View>
    );
}

function SectionTitle({ title }: { title: string }) {
    return (
        <Text className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{title}</Text>
    );
}

function LedgerBlock({
    title,
    items,
    section,
    total,
    totalLabel,
    accent,
}: {
    title: string;
    items: SectionItem[];
    section: 'earnings' | 'deductions';
    total: number;
    totalLabel: string;
    accent?: boolean;
}) {
    if (items.length === 0) return null;
    return (
        <View className="mb-4 rounded-2xl border border-neutral-100 bg-white p-4">
            <SectionTitle title={title} />
            {items.map((item, idx) => (
                <View
                    key={`${item.header}-${idx}`}
                    className="flex-row items-center justify-between border-b border-neutral-50 py-2.5"
                >
                    <Text className="max-w-[60%] text-xs font-medium text-neutral-600">{item.header}</Text>
                    <Text className={`text-xs font-black ${section === 'deductions' ? 'text-rose-700' : 'text-neutral-900'}`}>
                        {formatSectionValue(item.value, section)}
                    </Text>
                </View>
            ))}
            <View className="mt-2 flex-row items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5">
                <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-500">{totalLabel}</Text>
                <Text className={`text-sm font-black ${accent ? 'text-emerald-800' : section === 'deductions' ? 'text-rose-800' : 'text-neutral-900'}`}>
                    {formatInr(total)}
                </Text>
            </View>
        </View>
    );
}

export default function PayslipDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [payroll, setPayroll] = useState<PayrollDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.getPayrollById(String(id));
            const body = res.data as ApiEnvelope<PayrollDetail>;
            if (!body.success || !body.data) {
                setError(body.message || body.error || 'Payslip not found');
                setPayroll(null);
                return;
            }
            setPayroll(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load payslip');
            setPayroll(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const employee = payroll?.employeeId;
    const sections = payroll?.payslipSections ? withTotals(payroll.payslipSections) : null;
    const configured = Boolean(sections?.hasConfiguredSections);
    const loans = payroll?.payslipLoans;
    const loanItems = loans?.items?.filter((i) => (i.emiDeducted ?? 0) > 0 || (i.balanceBefore ?? 0) > 0) ?? [];

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-4 pt-2">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-3 rounded-2xl border border-neutral-100 bg-white p-3"
                    >
                        <ChevronLeft size={20} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Payslip</Text>
                        <Text className="text-lg font-black text-neutral-900">
                            {payroll ? `${payroll.monthName} ${payroll.year}` : 'Detail'}
                        </Text>
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 px-6 pt-6">
                        <SkeletonBlock height={120} />
                        <SkeletonBlock height={200} />
                    </View>
                ) : error || !payroll ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-center text-base font-bold text-neutral-900">Payslip not found</Text>
                        <Text className="mt-2 text-center text-sm text-neutral-500">{error}</Text>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            className="mt-6 rounded-2xl bg-primary px-6 py-3"
                        >
                            <Text className="text-xs font-black uppercase tracking-widest text-white">Back</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
                        <View className="mb-4 overflow-hidden rounded-3xl border-2 border-emerald-100 bg-white">
                            <LinearGradient colors={['#ECFDF5', '#FFFFFF']} className="px-5 py-6">
                                <Text className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-800">
                                    Confidential
                                </Text>
                                <Text className="mt-1 text-center text-2xl font-light text-neutral-900">Payslip</Text>
                                <Text className="mt-1 text-center text-sm text-neutral-500">
                                    {payroll.monthName} {payroll.year}
                                </Text>
                            </LinearGradient>

                            {!configured ? (
                                <View className="px-5 py-10">
                                    <Text className="text-center text-base font-bold text-neutral-800">
                                        Layout not configured
                                    </Text>
                                    <Text className="mt-2 text-center text-sm text-neutral-500">
                                        Ask HR to configure payslip sections in Payroll Configuration.
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <View className="flex-row flex-wrap border-t border-neutral-100 px-5 py-4">
                                        <Field label="Employee" value={employee?.employee_name} />
                                        <Field label="ID" value={employee?.emp_no || payroll.emp_no} />
                                        <Field label="Department" value={refName(employee?.department_id)} />
                                        <Field label="Designation" value={refName(employee?.designation_id)} />
                                    </View>

                                    <View className="flex-row border-t border-neutral-100">
                                        <View className="flex-1 border-r border-neutral-100 px-4 py-4">
                                            <Text className="text-[9px] font-black uppercase text-neutral-400">Earnings</Text>
                                            <Text className="mt-1 text-sm font-black text-emerald-800">
                                                {formatInr(sections?.totalEarnings ?? 0)}
                                            </Text>
                                        </View>
                                        <View className="flex-1 border-r border-neutral-100 px-4 py-4">
                                            <Text className="text-[9px] font-black uppercase text-neutral-400">Deductions</Text>
                                            <Text className="mt-1 text-sm font-black text-rose-800">
                                                {formatInr(sections?.totalDeductions ?? 0)}
                                            </Text>
                                        </View>
                                        <View className="flex-1 px-4 py-4">
                                            <Text className="text-[9px] font-black uppercase text-neutral-400">Net payable</Text>
                                            <Text className="mt-1 text-sm font-black text-neutral-900">
                                                {formatInr(sections?.netPayable ?? 0)}
                                            </Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>

                        {configured && sections ? (
                            <>
                                {sections.attendance.length > 0 ? (
                                    <View className="mb-4 rounded-2xl border border-neutral-100 bg-white p-4">
                                        <SectionTitle title="Attendance" />
                                        <View className="flex-row flex-wrap gap-2">
                                            {sections.attendance.map((item, idx) => (
                                                <View
                                                    key={`${item.header}-${idx}`}
                                                    className="min-w-[44%] flex-1 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5"
                                                >
                                                    <Text className="text-[9px] font-bold uppercase text-neutral-400">
                                                        {item.header}
                                                    </Text>
                                                    <Text className="mt-0.5 text-sm font-black text-neutral-900">
                                                        {formatSectionValue(item.value, 'attendance')}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ) : null}

                                <LedgerBlock
                                    title="Earnings"
                                    items={sections.earnings}
                                    section="earnings"
                                    total={sections.totalEarnings ?? 0}
                                    totalLabel="Total earnings"
                                    accent
                                />
                                <LedgerBlock
                                    title="Deductions"
                                    items={sections.deductions}
                                    section="deductions"
                                    total={sections.totalDeductions ?? 0}
                                    totalLabel="Total deductions"
                                />

                                {loanItems.length > 0 ? (
                                    <View className="mb-4 rounded-2xl border border-neutral-100 bg-white p-4">
                                        <SectionTitle title="Loans" />
                                        {loanItems.map((loan, idx) => (
                                            <View key={idx} className="mb-2 rounded-xl bg-neutral-50 px-3 py-3">
                                                <Text className="text-xs font-black text-neutral-800">
                                                    {loan.label || 'Loan'}
                                                </Text>
                                                <View className="mt-2 flex-row justify-between">
                                                    <Text className="text-[10px] text-neutral-500">Balance before</Text>
                                                    <Text className="text-xs font-bold text-neutral-800">
                                                        {formatInr(loan.balanceBefore ?? 0)}
                                                    </Text>
                                                </View>
                                                <View className="mt-1 flex-row justify-between">
                                                    <Text className="text-[10px] text-neutral-500">EMI deducted</Text>
                                                    <Text className="text-xs font-bold text-rose-700">
                                                        {formatInr(loan.emiDeducted ?? 0)}
                                                    </Text>
                                                </View>
                                                <View className="mt-1 flex-row justify-between">
                                                    <Text className="text-[10px] text-neutral-500">Balance after</Text>
                                                    <Text className="text-xs font-bold text-neutral-800">
                                                        {formatInr(loan.balanceAfter ?? 0)}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                ) : null}
                            </>
                        ) : null}

                        <View className="mb-24 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                            <Text className="text-center text-[10px] text-neutral-500">
                                Status: {payroll.status || '—'} · For PDF export use the web HRMS payslips page.
                            </Text>
                        </View>
                    </ScrollView>
                )}
            </SafeAreaView>
        </View>
    );
}
