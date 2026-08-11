import { useCallback, useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Image,
    Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Calendar, FileText, CheckCircle, XCircle, AlertTriangle, Eye, ShieldAlert } from 'lucide-react-native';
import { api, ApiEnvelope } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import { EmployeeMetaCard } from '../../src/components/EmployeeMetaCard';
import { ApprovalTimeline } from '../../src/components/ApprovalTimeline';
import { ActionCommentsModal } from '../../src/components/ActionCommentsModal';

type Complaint = {
    _id: string;
    employeeId?: {
        _id?: string;
        emp_no?: string;
        employee_name?: string;
        designation?: any;
        designation_id?: any;
        department?: any;
        department_id?: any;
        division?: any;
        division_id?: any;
    };
    emp_no?: string;
    employeeName?: string;
    complaintType: string;
    remarks: string;
    status: string;
    appliedAt?: string;
    createdAt?: string;
    imageUrl?: string;
    appliedBy: any;
    workflow?: {
        currentStepRole?: string | null;
        nextApproverRole?: string | null;
        reportingManagerIds?: string[];
        approvalChain?: any[];
        history?: any[];
    };
    division_name?: string;
    department_name?: string;
    designation?: string;
};

function statusBadgeStyles(status: string): { bg: string; text: string } {
    const s = (status || '').toLowerCase();
    if (s === 'pending') {
        return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' };
    } else if (s === 'approved') {
        return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' };
    } else if (s === 'rejected') {
        return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' };
    } else if (s === 'cancelled') {
        return { bg: 'bg-neutral-50 border-neutral-200', text: 'text-neutral-500' };
    } else if (s.endsWith('_approved')) {
        return { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' };
    } else if (s.endsWith('_rejected')) {
        return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' };
    }
    return { bg: 'bg-neutral-50 border-neutral-200', text: 'text-neutral-600' };
}

function statusLabel(status: string): string {
    const s = status.toLowerCase();
    if (s === 'pending') return 'Pending Review';
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    if (s === 'cancelled') return 'Cancelled';
    if (s.endsWith('_approved')) return `${status.split('_')[0].toUpperCase()} Approved`;
    if (s.endsWith('_rejected')) return `${status.split('_')[0].toUpperCase()} Rejected`;
    return status.replace(/_/g, ' ');
}

export default function ComplaintDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { user } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [complaint, setComplaint] = useState<Complaint | null>(null);

    // Modals
    const [actionModal, setActionModal] = useState<{ action: 'approve' | 'reject'; title: string } | null>(null);
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

    const loadDetails = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const res = await api.getComplaintDetails(String(id));
            const body = res.data as ApiEnvelope<Complaint>;
            if (body.success && body.data) {
                setComplaint(body.data);
            } else {
                Alert.alert('Error', body.error || 'Failed to fetch grievance details.');
                router.replace('/complaints');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            Alert.alert('Error', 'Failed to fetch details.');
            router.replace('/complaints');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void loadDetails();
    }, [loadDetails]);

    // Check if the current user can approve/reject the active step
    const canApproveAction = useMemo(() => {
        if (!complaint || !user) return false;
        
        // Final states
        if (['approved', 'rejected', 'cancelled'].includes(complaint.status)) {
            return false;
        }

        const userRole = String(user.role || '').toLowerCase();
        if (['super_admin', 'sub_admin'].includes(userRole)) {
            return true;
        }

        const nextRole = complaint.workflow?.nextApproverRole || complaint.workflow?.currentStepRole;
        if (!nextRole) return false;

        const nextRoleNorm = nextRole.toLowerCase();

        if (nextRoleNorm === 'reporting_manager') {
            const managers = complaint.workflow?.reportingManagerIds || [];
            const userEmpId = user.employeeRef || '';
            const userId = user.id || '';
            
            const isRM = managers.includes(userId.toString()) || (userEmpId && managers.includes(userEmpId.toString()));
            if (isRM) return true;

            // HOD fallback
            if (userRole === 'hod') {
                return true;
            }
        } else if (nextRoleNorm === 'hod') {
            if (userRole === 'hod') {
                return true;
            }
        } else if (userRole === nextRoleNorm) {
            return true;
        }

        return false;
    }, [complaint, user]);

    // Check if the current user can cancel this complaint
    const canCancel = useMemo(() => {
        if (!complaint || !user) return false;
        
        const isApplicant = String(complaint.appliedBy) === String(user.id);
        const isPending = !['approved', 'rejected', 'cancelled'].includes(complaint.status);
        
        return isApplicant && isPending;
    }, [complaint, user]);

    // Perform approval action
    const handleActionSubmit = async (comments: string) => {
        if (!actionModal || !complaint) return;
        
        setActionModal(null);
        setActionLoading(true);
        try {
            const res = await api.processComplaintAction(complaint._id, actionModal.action, comments);
            const body = res.data as ApiEnvelope;
            
            if (res.status === 200 && body.success) {
                Alert.alert('Success', `Grievance has been ${actionModal.action}d successfully.`, [
                    { text: 'OK', onPress: () => void loadDetails() }
                ]);
            } else {
                Alert.alert('Action Failed', body.error || 'Failed to submit action.');
            }
        } catch (error) {
            console.error('Action error:', error);
            Alert.alert('Error', 'An error occurred while submitting decision.');
        } finally {
            setActionLoading(false);
        }
    };

    // Perform cancel action
    const handleCancelSubmit = () => {
        if (!complaint) return;
        
        Alert.alert('Cancel Grievance', 'Are you sure you want to cancel this grievance request?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes, Cancel',
                style: 'destructive',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const res = await api.cancelComplaint(complaint._id);
                        const body = res.data as ApiEnvelope;
                        if (res.status === 200 && body.success) {
                            Alert.alert('Success', 'Grievance request cancelled.', [
                                { text: 'OK', onPress: () => void loadDetails() }
                            ]);
                        } else {
                            Alert.alert('Failed', body.error || 'Failed to cancel.');
                        }
                    } catch (error) {
                        console.error('Cancel error:', error);
                        Alert.alert('Error', 'An error occurred during cancellation.');
                    } finally {
                        setActionLoading(false);
                    }
                }
            }
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 bg-white items-center justify-center">
                <ActivityIndicator size="large" color="#E11D48" />
            </View>
        );
    }

    if (!complaint) return null;

    // Resolve node names
    const resolveName = (v: any) => {
        if (!v) return '—';
        if (typeof v === 'string') return v;
        return v.name || '—';
    };

    const empName = complaint.employeeId?.employee_name || complaint.employeeName || '—';
    const empNo = complaint.employeeId?.emp_no || complaint.emp_no || '—';
    const designation = resolveName(complaint.employeeId?.designation || complaint.employeeId?.designation_id || complaint.designation);
    const department = resolveName(complaint.employeeId?.department || complaint.employeeId?.department_id || complaint.department_name);
    const division = resolveName(complaint.employeeId?.division || complaint.employeeId?.division_id || complaint.division_name);

    const formattedDate = complaint.appliedAt || complaint.createdAt
        ? new Date(complaint.appliedAt || complaint.createdAt!).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : '—';

    const badges = statusBadgeStyles(complaint.status);

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFF', '#FFF5F5', '#FFFFFF']} className="absolute inset-0" />
            
            <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
                {/* Header */}
                <View className="px-6 py-4 flex-row items-center border-b border-neutral-100 bg-white/70">
                    <TouchableOpacity
                        onPress={() => router.replace('/complaints')}
                        className="p-2 -ml-2 rounded-full hover:bg-neutral-100"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="ml-2">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Details</Text>
                        <Text className="text-xl font-black text-neutral-900">Grievance Request</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
                    
                    {/* Status overview card */}
                    <View className="mb-4 rounded-[28px] border-2 border-neutral-100 bg-white p-5 flex-row items-center justify-between">
                        <View className="flex-1 pr-3">
                            <Text className="text-[9px] font-black tracking-wider uppercase text-rose-600">
                                {complaint.complaintType}
                            </Text>
                            <View className="mt-1 flex-row items-center gap-1.5">
                                <Calendar size={12} color="#64748B" />
                                <Text className="text-xs font-bold text-neutral-500">{formattedDate}</Text>
                            </View>
                        </View>
                        <View className={`rounded-xl border px-3.5 py-2 ${badges.bg}`}>
                            <Text className={`text-[9.5px] font-black uppercase tracking-wider ${badges.text}`}>
                                {statusLabel(complaint.status)}
                            </Text>
                        </View>
                    </View>

                    {/* Employee info card */}
                    <EmployeeMetaCard
                        empNo={empNo}
                        empName={empName}
                        designation={designation}
                        department={department}
                        division={division}
                    />

                    {/* Details card */}
                    <View className="mb-4 rounded-[28px] border-2 border-neutral-100 bg-white p-5">
                        <View className="flex-row items-center gap-2 mb-3">
                            <FileText size={15} color="#E11D48" />
                            <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Remarks & Details</Text>
                        </View>
                        <Text className="text-sm font-semibold text-neutral-800 leading-6">
                            {complaint.remarks}
                        </Text>

                        {/* Clickable Image Evidence preview if exists */}
                        {complaint.imageUrl && (
                            <View className="mt-5 pt-5 border-t border-neutral-50">
                                <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest mb-3">Attached Evidence</Text>
                                <TouchableOpacity
                                    activeOpacity={0.88}
                                    onPress={() => setImagePreviewOpen(true)}
                                    className="relative rounded-2xl border border-neutral-100 overflow-hidden"
                                >
                                    <Image
                                        source={{ uri: complaint.imageUrl }}
                                        className="h-44 w-full"
                                        resizeMode="cover"
                                    />
                                    <View className="absolute bottom-3 right-3 bg-black/60 rounded-xl px-2.5 py-1.5 flex-row items-center gap-1.5">
                                        <Eye size={12} color="#FFFFFF" strokeWidth={2.5} />
                                        <Text className="text-[10px] font-black text-white uppercase tracking-wider">Tap to View</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Approval timeline */}
                    {complaint.workflow?.approvalChain && (
                        <ApprovalTimeline
                            title="Workflow Timeline"
                            steps={complaint.workflow.approvalChain.map((step) => ({
                                stepOrder: step.stepOrder,
                                label: step.label || step.role,
                                role: step.role,
                                status: step.status,
                                actionByName: step.actionByName,
                                comments: step.comments,
                                updatedAt: step.updatedAt,
                            }))}
                        />
                    )}

                    {/* Approval actions log */}
                    {complaint.workflow?.history && complaint.workflow.history.length > 1 && (
                        <View className="mb-8 rounded-[28px] border-2 border-neutral-100 bg-white p-5">
                            <View className="flex-row items-center gap-2 mb-3">
                                <ShieldAlert size={14} color="#64748B" />
                                <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Action History</Text>
                            </View>
                            {complaint.workflow.history.map((hist, idx) => {
                                if (idx === 0) return null; // skip initial submission
                                const date = hist.timestamp 
                                    ? new Date(hist.timestamp).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })
                                    : '—';
                                return (
                                    <View key={idx} className="mt-3.5 pt-3.5 border-t border-neutral-50">
                                        <View className="flex-row items-center justify-between">
                                            <Text className="text-xs font-black text-neutral-800 uppercase tracking-tight">
                                                {hist.actionByName} <Text className="text-[9px] text-neutral-400 font-bold">({hist.actionByRole})</Text>
                                            </Text>
                                            <Text className="text-[9px] text-neutral-400 font-bold">{date}</Text>
                                        </View>
                                        <Text className="mt-1 text-xs font-semibold text-neutral-500">
                                            Action: <Text className="font-bold text-neutral-700 capitalize">{hist.action}</Text>
                                        </Text>
                                        {hist.comments ? (
                                            <Text className="mt-1 text-xs italic font-bold text-rose-600 bg-rose-50/50 rounded-xl px-3 py-2 border border-rose-100/50">
                                                &ldquo;{hist.comments}&rdquo;
                                            </Text>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Bottom space */}
                    <View className="h-28" />

                </ScrollView>

                {/* Bottom Actions Overlay Panel */}
                {(canApproveAction || canCancel) && (
                    <View className="absolute bottom-0 left-0 right-0 border-t border-neutral-100 bg-white/95 px-6 py-4 flex-row gap-3">
                        {canApproveAction && (
                            <>
                                <TouchableOpacity
                                    onPress={() => setActionModal({ action: 'reject', title: 'Reject Grievance' })}
                                    disabled={actionLoading}
                                    className="flex-1 rounded-2xl border-2 border-rose-200 bg-white py-3.5 shadow-xs flex-row items-center justify-center gap-1.5"
                                >
                                    <XCircle size={16} color="#E11D48" strokeWidth={2.5} />
                                    <Text className="text-xs font-black uppercase tracking-widest text-rose-600">Reject</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setActionModal({ action: 'approve', title: 'Approve Grievance' })}
                                    disabled={actionLoading}
                                    className="flex-1 rounded-2xl bg-emerald-600 py-3.5 shadow-md shadow-emerald-200 flex-row items-center justify-center gap-1.5"
                                >
                                    <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Approve</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {canCancel && (
                            <TouchableOpacity
                                onPress={handleCancelSubmit}
                                disabled={actionLoading}
                                className="flex-1 rounded-2xl bg-rose-600 py-4 shadow-md shadow-rose-200 flex-row items-center justify-center gap-1.5"
                            >
                                <XCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                                <Text className="text-xs font-black uppercase tracking-widest text-white">Cancel Grievance</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Action Comments Modal */}
                {actionModal && (
                    <ActionCommentsModal
                        visible={!!actionModal}
                        title={actionModal.title}
                        actionType={actionModal.action}
                        placeholder={`Add any reasoning or remarks for this ${actionModal.action}...`}
                        onSubmit={handleActionSubmit}
                        onClose={() => setActionModal(null)}
                    />
                )}

                {/* Fullscreen Image Preview Modal */}
                <Modal visible={imagePreviewOpen} transparent animationType="fade" onRequestClose={() => setImagePreviewOpen(false)}>
                    <View className="flex-1 bg-black items-center justify-center p-6">
                        <TouchableOpacity
                            onPress={() => setImagePreviewOpen(false)}
                            className="absolute top-14 right-6 h-10 w-10 items-center justify-center rounded-full bg-white/20"
                        >
                            <ChevronLeft size={24} color="#FFFFFF" className="rotate-270" strokeWidth={3} />
                        </TouchableOpacity>
                        {complaint.imageUrl && (
                            <Image
                                source={{ uri: complaint.imageUrl }}
                                className="h-[80%] w-full"
                                resizeMode="contain"
                            />
                        )}
                    </View>
                </Modal>

            </SafeAreaView>
        </View>
    );
}
