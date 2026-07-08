import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    Switch,
    Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Calendar, Clock, User, Layers } from 'lucide-react-native';
import { api, ApiEnvelope } from '../../src/api/client';
import { ApprovalTimeline, type TimelineStep } from '../../src/components/ApprovalTimeline';
import { formatDateRangeIST, formatDateTimeIST } from '../../src/utils/dateIST';
import { useAuthStore } from '../../src/store/useAuthStore';
import { canActionLeaves, isManagementRole } from '../../src/lib/permissions';
import { canCurrentUserActOnLeaveLikeItem } from '../../src/utils/workflowPermissions';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmployeeMetaCard } from '../../src/components/EmployeeMetaCard';
import { ActionCommentsModal } from '../../src/components/ActionCommentsModal';

type ChainStep = TimelineStep;
type LeaveTypeOpt = { code: string; name: string; isActive?: boolean };
type LeaveSplit = {
    date: string;
    leaveType: string;
    isHalfDay: boolean;
    halfDayType: 'first_half' | 'second_half' | null;
    status: 'approved' | 'rejected';
    numberOfDays?: number;
    notes?: string | null;
};

// Date utilities
const parseDateOnly = (value: Date | string) => {
    const d = value instanceof Date ? value : new Date(String(value));
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const toISODate = (date: Date | string) => {
    const d = parseDateOnly(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const isSameCalendarDay = (a: Date | string, b: Date | string) => {
    return toISODate(a) === toISODate(b);
};

const expandLeaveToDailySegments = (leave: {
    fromDate: string;
    toDate: string;
    isHalfDay?: boolean;
    halfDayType?: 'first_half' | 'second_half' | null;
    fromIsHalfDay?: boolean;
    toIsHalfDay?: boolean;
}) => {
    const start = parseDateOnly(leave.fromDate);
    const end = parseDateOnly(leave.toDate);
    const segments: any[] = [];
    const current = new Date(start);

    while (current <= end) {
        const currentIso = toISODate(current);
        const isStart = isSameCalendarDay(current, start);
        const isEnd = isSameCalendarDay(current, end);
        let isHalfDay = false;
        let halfDayType: 'first_half' | 'second_half' | null = null;

        if (isStart && isEnd) {
            isHalfDay = !!leave.isHalfDay;
            halfDayType = (leave.halfDayType as any) || null;
        } else if (isStart) {
            isHalfDay = !!leave.fromIsHalfDay;
            halfDayType = 'second_half';
        } else if (isEnd) {
            isHalfDay = !!leave.toIsHalfDay;
            halfDayType = 'first_half';
        }

        segments.push({
            dateStr: currentIso,
            isHalfDay,
            halfDayType,
            numberOfDays: isHalfDay ? 0.5 : 1,
        });

        current.setDate(current.getDate() + 1);
    }
    return segments;
};

const clampSplitsToRange = (leave: any, splits: any[]) => {
    const start = parseDateOnly(leave.fromDate).getTime();
    const end = parseDateOnly(leave.toDate).getTime();
    const byKey = new Map<string, any>();

    splits.forEach((s) => {
        const d = parseDateOnly(s.date);
        const t = d.getTime();
        if (Number.isNaN(t) || t < start || t > end) return;
        const iso = toISODate(d);
        const key = `${iso}_${s.isHalfDay ? s.halfDayType || 'half' : 'full'}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                ...s,
                date: iso,
                numberOfDays: s.numberOfDays ?? (s.isHalfDay ? 0.5 : 1),
                halfDayType: s.isHalfDay ? s.halfDayType || 'first_half' : null,
            });
        }
    });

    return Array.from(byKey.values()).sort(
        (a, b) => parseDateOnly(a.date).getTime() - parseDateOnly(b.date).getTime()
    );
};

function statusBadge(status: string): { wrap: string; text: string } {
    const s = (status || '').toLowerCase();
    if (s.includes('approv')) return { wrap: 'bg-emerald-100', text: 'text-emerald-800' };
    if (s.includes('reject')) return { wrap: 'bg-rose-100', text: 'text-rose-800' };
    if (s.includes('pending') || s.includes('progress')) return { wrap: 'bg-amber-100', text: 'text-amber-900' };
    return { wrap: 'bg-neutral-100', text: 'text-neutral-700' };
}

function nodeName(v: unknown): string {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '—');
    return '—';
}

export default function LeaveDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [row, setRow] = useState<Record<string, unknown> | null>(null);
    const [allowHigherAuthority, setAllowHigherAuthority] = useState(false);
    const { user } = useAuthStore();

    // Leave Split States
    const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOpt[]>([]);
    const [splitMode, setSplitMode] = useState(false);
    const [splitDrafts, setSplitDrafts] = useState<LeaveSplit[]>([]);
    const [activeSplitIdx, setActiveSplitIdx] = useState<number | null>(null);
    const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);

    // Reusable Comments Modal States
    const [commentsVisible, setCommentsVisible] = useState(false);
    const [commentsTitle, setCommentsTitle] = useState('');
    const [commentsAction, setCommentsAction] = useState<'approve' | 'reject' | 'revoke' | 'neutral'>('neutral');
    const [commentsCallback, setCommentsCallback] = useState<(text: string) => Promise<void>>(() => async () => {});

    const buildInitialSplits = (leave: any) => {
        if (!leave) return [];
        if (leave.splits && leave.splits.length > 0) {
            return clampSplitsToRange(
                leave,
                leave.splits.map((s: any) => ({
                    _id: s._id,
                    date: toISODate(s.date),
                    leaveType: s.leaveType,
                    leaveNature: s.leaveNature,
                    isHalfDay: s.isHalfDay,
                    halfDayType: s.halfDayType || null,
                    status: s.status,
                    notes: s.notes || null,
                }))
            );
        }
        const defaults = expandLeaveToDailySegments({
            fromDate: toISODate(parseDateOnly(leave.fromDate)),
            toDate: toISODate(parseDateOnly(leave.toDate)),
            isHalfDay: leave.isHalfDay,
            halfDayType: leave.halfDayType || null,
            fromIsHalfDay: leave.fromIsHalfDay,
            toIsHalfDay: leave.toIsHalfDay,
        });
        return defaults.map((d) => ({
            ...d,
            leaveType: leave.leaveType,
            status: 'approved' as const,
            numberOfDays: d.numberOfDays ?? (d.isHalfDay ? 0.5 : 1),
        }));
    };

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [res, settingsRes] = await Promise.all([
                api.getLeave(String(id)),
                api.getLeaveSettings('leave'),
            ]);
            const body = res.data as ApiEnvelope & Record<string, unknown>;
            if (body.success && body.data) {
                const leaveData = body.data as Record<string, unknown>;
                setRow(leaveData);
                setSplitDrafts(buildInitialSplits(leaveData));
            } else {
                Alert.alert('Error', (body.message as string) || 'Could not load leave');
            }
            
            const settingsBody = settingsRes.data as ApiEnvelope<Record<string, unknown>>;
            const envelopeData = settingsBody.data as any;
            if (envelopeData?.types) {
                setLeaveTypes(envelopeData.types.filter((t: any) => t.isActive !== false));
            }
            const wf = envelopeData?.workflow;
            setAllowHigherAuthority(!!wf?.allowHigherAuthorityToApproveLowerLevels);
        } catch (err) {
            Alert.alert('Error', 'Network error loading settings');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const status = String(row?.status ?? '');
    const canCancel = status === 'pending' || status === 'in_progress';
    const canApproveReject =
        canActionLeaves(user) &&
        !['approved', 'rejected', 'cancelled'].includes(status) &&
        canCurrentUserActOnLeaveLikeItem({
            item: row as unknown as { status?: string; workflow?: { [k: string]: unknown }; odType?: string },
            user,
            isOD: false,
            allowHigherAuthority,
        });

    const isHigherAuthority = user && ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(String(user.role).toLowerCase());
    const canRevoke = status === 'approved' && isHigherAuthority;

    const showEmployeeMeta = isManagementRole(user);
    const emp = row?.employeeId as
        | {
              emp_no?: string;
              employee_name?: string;
              first_name?: string;
              last_name?: string;
              designation?: unknown;
              designation_id?: unknown;
              department?: unknown;
              department_id?: unknown;
              division?: unknown;
              division_id?: unknown;
          }
        | undefined;
    const empName = String(emp?.employee_name || [emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || '—');
    const empNo = String(emp?.emp_no || row?.emp_no || '—');
    const desig = nodeName(emp?.designation || emp?.designation_id || (row as Record<string, unknown> | null)?.designation);
    const dep = nodeName(emp?.department || emp?.department_id || (row as Record<string, unknown> | null)?.department);
    const div = nodeName(emp?.division || emp?.division_id || (row as Record<string, unknown> | null)?.division);

    const chain = ((row?.workflow as { approvalChain?: ChainStep[] } | undefined)?.approvalChain ||
        []) as ChainStep[];

    const onCancel = () => {
        Alert.alert('Withdraw application', 'Cancel this leave request?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Withdraw',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const res = await api.cancelLeave(String(id));
                        const body = res.data as ApiEnvelope;
                        if (body.success) {
                            Alert.alert('Done', 'Leave request withdrawn.');
                            router.back();
                        } else Alert.alert('Failed', body.message || body.error || 'Try again');
                    } catch {
                        Alert.alert('Error', 'Network error');
                    }
                },
            },
        ]);
    };

    const handleActionTrigger = (action: 'approve' | 'reject') => {
        setCommentsTitle(action === 'approve' ? 'Approve leave request' : 'Reject leave request');
        setCommentsAction(action === 'approve' ? 'approve' : 'reject');
        setCommentsCallback(() => async (comments: string) => {
            setCommentsVisible(false);
            try {
                if (action === 'approve' && splitMode) {
                    // 1. Validate splits
                    const valRes = await api.validateLeaveSplits(String(id), splitDrafts);
                    if (!valRes.data?.success && (valRes.data as any)?.isValid === false) {
                        const errs = (valRes.data as any)?.errors || ['Splits validation failed'];
                        Alert.alert('Validation Error', errs.join('\n'));
                        return;
                    }
                    // 2. Save splits
                    const saveRes = await api.createLeaveSplits(String(id), splitDrafts);
                    if (!saveRes.data?.success) {
                        const errs = (saveRes.data as any)?.errors || ['Could not save splits'];
                        Alert.alert('Splits Error', errs.join('\n'));
                        return;
                    }
                }

                const res = await api.processLeaveAction(String(id), action, comments.trim() || undefined);
                const body = res.data as ApiEnvelope;
                if (!body.success) throw new Error(body.message || body.error || 'Could not process action');
                await load();
            } catch (e) {
                Alert.alert('Action failed', e instanceof Error ? e.message : 'Could not process action');
            }
        });
        setCommentsVisible(true);
    };

    const handleRevokeTrigger = () => {
        setCommentsTitle('Revoke Leave Approval');
        setCommentsAction('revoke');
        setCommentsCallback(() => async (comments: string) => {
            setCommentsVisible(false);
            try {
                const res = await api.revokeLeaveApproval(String(id), comments.trim() || undefined);
                const body = res.data as ApiEnvelope;
                if (!body.success) throw new Error(body.message || body.error || 'Could not revoke approval');
                Alert.alert('Revoked', 'Leave approval revoked.');
                await load();
            } catch (e) {
                Alert.alert('Revocation failed', e instanceof Error ? e.message : 'Could not revoke approval');
            }
        });
        setCommentsVisible(true);
    };

    // Splits updates helpers
    const updateSplitDraft = (index: number, updates: Partial<LeaveSplit>) => {
        setSplitDrafts((prev) =>
            prev.map((rowItem, idx) => {
                if (idx !== index) return rowItem;
                const next = { ...rowItem, ...updates };
                next.numberOfDays = next.isHalfDay ? 0.5 : 1;
                if (!next.isHalfDay) {
                    next.halfDayType = null;
                }
                return next;
            })
        );
    };

    const toggleSplitHalf = (index: number) => {
        const item = splitDrafts[index];
        updateSplitDraft(index, { isHalfDay: !item.isHalfDay });
    };

    const toggleSplitHalfDayType = (index: number) => {
        const item = splitDrafts[index];
        const next = item.halfDayType === 'first_half' ? 'second_half' : 'first_half';
        updateSplitDraft(index, { halfDayType: next });
    };

    const toggleSplitStatus = (index: number) => {
        const item = splitDrafts[index];
        const next = item.status === 'approved' ? 'rejected' : 'approved';
        updateSplitDraft(index, { status: next });
    };

    const triggerSelectLeaveType = (index: number) => {
        setActiveSplitIdx(index);
        setTypeSelectorOpen(true);
    };

    const selectLeaveTypeForIndex = (code: string) => {
        if (activeSplitIdx !== null) {
            updateSplitDraft(activeSplitIdx, { leaveType: code });
        }
        setTypeSelectorOpen(false);
        setActiveSplitIdx(null);
    };

    const sb = statusBadge(status);
    const dateRangeLabel = formatDateRangeIST(row?.fromDate, row?.toDate);
    const appliedLabel = row?.appliedAt ? formatDateTimeIST(row.appliedAt) : '';

    const splitApprovedSum = splitDrafts
        .filter((s) => s.status === 'approved')
        .reduce((sum, s) => sum + (s.isHalfDay ? 0.5 : 1), 0);
    const splitRejectedSum = splitDrafts
        .filter((s) => s.status === 'rejected')
        .reduce((sum, s) => sum + (s.isHalfDay ? 0.5 : 1), 0);

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pt-2 pb-4">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-12 h-12 rounded-2xl bg-white border-2 border-neutral-100 items-center justify-center mr-3"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest">Leave</Text>
                        <Text className="text-neutral-900 text-xl font-black">Details</Text>
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 px-6 pt-6">
                        <SkeletonBlock height={24} width="30%" />
                        <SkeletonBlock height={48} width="45%" style={{ marginTop: 12 }} />
                        <SkeletonBlock height={180} style={{ marginTop: 14 }} radius={20} />
                        <SkeletonBlock height={140} style={{ marginTop: 14 }} radius={20} />
                        <SkeletonBlock height={56} style={{ marginTop: 14 }} radius={16} />
                    </View>
                ) : !row ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-neutral-500 text-center font-medium">No data.</Text>
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                        {chain.length > 0 ? <ApprovalTimeline steps={chain} /> : null}

                        <View className={`self-start px-3 py-1 rounded-full mb-4 ${sb.wrap}`}>
                            <Text className={`text-xs font-black uppercase tracking-wide ${sb.text}`}>
                                {status.replace(/_/g, ' ') || '—'}
                            </Text>
                        </View>

                        <View className="bg-white rounded-[28px] border-2 border-neutral-100 p-5 mb-4 shadow-sm">
                            <Text className="text-neutral-900 font-black text-lg mb-1">
                                {String(
                                    (row.leaveType as string) ||
                                        (row as { leave_type?: string }).leave_type ||
                                        'Leave'
                                )}
                            </Text>
                            <View className="flex-row items-center mt-3 gap-2 flex-wrap">
                                <Calendar size={16} color="#64748B" />
                                <Text className="text-neutral-600 font-bold">{dateRangeLabel}</Text>
                            </View>
                            <Text className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider mt-1">Dates shown in IST</Text>
                            <View className="flex-row items-center mt-2 gap-2">
                                <Clock size={16} color="#64748B" />
                                <Text className="text-neutral-600 font-medium">
                                    {Number(row.numberOfDays ?? 0)} day{Number(row.numberOfDays ?? 0) === 1 ? '' : 's'}
                                    {row.isHalfDay ? ` · Half: ${String(row.halfDayType ?? '').replace('_', ' ')}` : ''}
                                </Text>
                            </View>
                        </View>
                        {showEmployeeMeta ? (
                            <EmployeeMetaCard
                                empNo={empNo}
                                empName={empName}
                                designation={desig}
                                division={div}
                                department={dep}
                            />
                        ) : null}

                        <View className="bg-white rounded-[28px] border-2 border-neutral-100 p-5 mb-4">
                            <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest mb-2">Purpose</Text>
                            <Text className="text-neutral-800 font-medium leading-6">{String(row.purpose ?? '—')}</Text>
                            {row.contactNumber ? (
                                <Text className="text-neutral-500 text-sm mt-3">Contact: {String(row.contactNumber)}</Text>
                            ) : null}
                            {row.remarks ? (
                                <Text className="text-neutral-600 text-sm mt-3">Remarks: {String(row.remarks)}</Text>
                            ) : null}
                        </View>

                        {row.splitStatus ? (
                            <View className="bg-amber-50 rounded-[28px] border border-amber-100 p-5 mb-4">
                                <Text className="text-amber-900 font-black text-sm">Split status</Text>
                                <Text className="text-amber-800 mt-1">{String(row.splitStatus)}</Text>
                            </View>
                        ) : null}

                        {/* Split Mode Section for Approvers */}
                        {canApproveReject && (
                            <View className="mb-4 bg-white rounded-[28px] border-2 border-neutral-100 p-5">
                                <View className="flex-row items-center justify-between mb-4">
                                    <View className="flex-1 mr-2">
                                        <Text className="text-neutral-900 font-black text-sm uppercase tracking-wide">Split & Decision</Text>
                                        <Text className="text-neutral-400 text-[9px] font-bold mt-0.5">Manage individual day approvals</Text>
                                    </View>
                                    <Switch
                                        value={splitMode}
                                        onValueChange={setSplitMode}
                                        trackColor={{ true: '#A7F3D0' }}
                                        thumbColor={splitMode ? '#10B981' : '#f4f4f5'}
                                    />
                                </View>

                                {splitMode && (
                                    <View className="mt-2 space-y-4">
                                        <View className="flex-row gap-3 p-3 rounded-2xl bg-neutral-50 border border-neutral-100">
                                            <View className="flex-1">
                                                <Text className="text-[9px] font-black text-neutral-400 uppercase">Total</Text>
                                                <Text className="text-xs font-bold text-neutral-700 mt-0.5">{Number(row.numberOfDays ?? 0)}d</Text>
                                            </View>
                                            <View className="flex-1">
                                                <Text className="text-[9px] font-black text-emerald-500 uppercase">Approved</Text>
                                                <Text className="text-xs font-bold text-emerald-700 mt-0.5">{splitApprovedSum}d</Text>
                                            </View>
                                            <View className="flex-1">
                                                <Text className="text-[9px] font-black text-rose-500 uppercase">Rejected</Text>
                                                <Text className="text-xs font-bold text-rose-700 mt-0.5">{splitRejectedSum}d</Text>
                                            </View>
                                        </View>

                                        {splitDrafts.map((split, idx) => (
                                            <View
                                                key={`${split.date}-${idx}`}
                                                className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 mb-3"
                                            >
                                                <View className="flex-row items-center justify-between mb-3">
                                                    <Text className="text-xs font-black text-neutral-800 uppercase tracking-wider">
                                                        {new Date(split.date).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                        })}
                                                    </Text>

                                                    <TouchableOpacity
                                                        onPress={() => toggleSplitStatus(idx)}
                                                        className={`rounded-full px-3 py-1 border ${
                                                            split.status === 'approved'
                                                                ? 'bg-emerald-50 border-emerald-200'
                                                                : 'bg-rose-50 border-rose-200'
                                                        }`}
                                                    >
                                                        <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                                            split.status === 'approved' ? 'text-emerald-700' : 'text-rose-700'
                                                        }`}>
                                                            {split.status === 'approved' ? 'Approve' : 'Reject'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <View className="flex-row items-center justify-between mb-3">
                                                    <Text className="text-xs text-neutral-500 font-bold">Leave Type</Text>
                                                    <TouchableOpacity
                                                        onPress={() => triggerSelectLeaveType(idx)}
                                                        className="bg-white border-2 border-neutral-100 rounded-xl px-3 py-1.5 min-w-[120px] items-center"
                                                    >
                                                        <Text className="text-neutral-800 text-xs font-black uppercase">
                                                            {split.leaveType}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <View className="flex-row items-center justify-between">
                                                    <Text className="text-xs text-neutral-500 font-bold">Half Day</Text>
                                                    <View className="flex-row items-center gap-3">
                                                        <Switch
                                                            value={split.isHalfDay}
                                                            onValueChange={() => toggleSplitHalf(idx)}
                                                            trackColor={{ true: '#A7F3D0' }}
                                                            thumbColor={split.isHalfDay ? '#10B981' : '#f4f4f5'}
                                                        />
                                                        {split.isHalfDay && (
                                                            <TouchableOpacity
                                                                onPress={() => toggleSplitHalfDayType(idx)}
                                                                className="bg-white border-2 border-neutral-100 rounded-xl px-2.5 py-1.5"
                                                            >
                                                                <Text className="text-neutral-800 text-xs font-bold">
                                                                    {split.halfDayType === 'first_half' ? '1st Half' : '2nd Half'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {appliedLabel ? (
                            <View className="flex-row items-center gap-2 mb-8 opacity-90">
                                <User size={14} color="#94A3B8" />
                                <Text className="text-neutral-600 text-xs">Applied (IST): {appliedLabel}</Text>
                            </View>
                        ) : (
                            <View className="h-8" />
                        )}

                        {canCancel && (
                            <TouchableOpacity
                                onPress={onCancel}
                                className="mb-4 py-4 rounded-2xl border-2 border-rose-200 bg-rose-50 items-center"
                            >
                                <Text className="text-rose-700 font-black uppercase tracking-widest text-xs">Withdraw request</Text>
                            </TouchableOpacity>
                        )}

                        {canRevoke && (
                            <TouchableOpacity
                                onPress={handleRevokeTrigger}
                                className="mb-4 py-4 rounded-2xl border-2 border-amber-200 bg-amber-50 items-center"
                            >
                                <Text className="text-amber-800 font-black uppercase tracking-widest text-xs">Revoke approval</Text>
                            </TouchableOpacity>
                        )}

                        {canApproveReject && (
                            <View className="mb-10 flex-row gap-3">
                                <TouchableOpacity
                                    onPress={() => handleActionTrigger('approve')}
                                    className="flex-1 items-center rounded-2xl bg-emerald-600 py-4"
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleActionTrigger('reject')}
                                    className="flex-1 items-center rounded-2xl bg-rose-600 py-4"
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Reject</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <View className="h-12" />
                    </ScrollView>
                )}

                <ActionCommentsModal
                    visible={commentsVisible}
                    title={commentsTitle}
                    actionType={commentsAction}
                    onSubmit={commentsCallback}
                    onClose={() => setCommentsVisible(false)}
                />

                <Modal visible={typeSelectorOpen} animationType="slide" transparent>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setTypeSelectorOpen(false)}
                        className="flex-1 bg-black/40 justify-end"
                    >
                        <View className="bg-white rounded-t-3xl p-6 max-h-[60%]">
                            <Text className="text-neutral-900 font-black text-lg mb-4">Select Leave Type</Text>
                            <ScrollView>
                                {leaveTypes.map((t) => (
                                    <TouchableOpacity
                                        key={t.code}
                                        onPress={() => selectLeaveTypeForIndex(t.code)}
                                        className="py-4 border-b border-neutral-100"
                                    >
                                        <Text className="text-neutral-900 font-bold">{t.name}</Text>
                                        <Text className="text-neutral-400 text-xs">{t.code}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        </View>
    );
}
