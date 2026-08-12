import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, Plus, ChevronLeft, Search, Calendar, Eye, Users, RefreshCw, X } from 'lucide-react-native';
import { MotiView } from 'moti';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, ApiEnvelope } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import { isManagementRole, canActionComplaints, canApplyComplaints } from '../../src/lib/permissions';
import { SearchableEmployeeSelect } from '../../src/components/SearchableEmployeeSelect';
import { SkeletonCard } from '../../src/components/Skeleton';

type OrgNode = string | { _id?: string; name?: string };

type ComplaintRow = {
    _id: string;
    employeeId?: {
        _id?: string;
        emp_no?: string;
        employee_name?: string;
        designation?: OrgNode;
        designation_id?: OrgNode;
        department?: OrgNode;
        department_id?: OrgNode;
    };
    emp_no?: string;
    employeeName?: string;
    complaintType: string;
    remarks: string;
    status: string;
    appliedAt?: string;
    createdAt?: string;
    imageUrl?: string;
};

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

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

export default function ComplaintsScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    
    // Scopes: my, team (pending approvals), all, history
    const [scopeMode, setScopeMode] = useState<'my' | 'team' | 'all' | 'history'>(() => 
        isManagementRole(useAuthStore.getState().user) ? 'team' : 'my'
    );
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Lists
    const [myComplaints, setMyComplaints] = useState<ComplaintRow[]>([]);
    const [pendingComplaints, setPendingComplaints] = useState<ComplaintRow[]>([]);
    const [allComplaints, setAllComplaints] = useState<ComplaintRow[]>([]);
    
    // History specific state
    const [selectedHistoryEmployee, setSelectedHistoryEmployee] = useState<any | null>(null);

    const isManager = isManagementRole(user);
    const canAction = canActionComplaints(user);
    const canApply = canApplyComplaints(user);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const promises: Promise<any>[] = [api.getMyComplaints()];
            
            if (isManager) {
                promises.push(api.getPendingComplaintApprovals());
            } else {
                promises.push(Promise.resolve({ data: { success: true, data: [] } }));
            }

            const hasElevatedAccess = ['hr', 'sub_admin', 'super_admin', 'hod', 'manager'].includes(user?.role || '');
            if (hasElevatedAccess) {
                promises.push(api.getComplaints({ ignoreScope: 'true' }));
            } else {
                promises.push(Promise.resolve({ data: { success: true, data: [] } }));
            }

            const results = await Promise.allSettled(promises);

            // 1. My Complaints
            const myRes = results[0];
            if (myRes.status === 'fulfilled') {
                const body = myRes.value.data as ApiEnvelope<ComplaintRow[]>;
                if (body.success) setMyComplaints(body.data || []);
            } else {
                console.error('Failed to load my complaints:', myRes.reason);
            }

            // 2. Pending Approvals
            const pendingRes = results[1];
            if (pendingRes && pendingRes.status === 'fulfilled') {
                const body = pendingRes.value.data as ApiEnvelope<ComplaintRow[]>;
                if (body.success) setPendingComplaints(body.data || []);
            } else if (pendingRes) {
                console.error('Failed to load pending approvals:', pendingRes.reason);
            }

            // 3. All Complaints
            const allRes = results[2];
            if (allRes && allRes.status === 'fulfilled') {
                const body = allRes.value.data as ApiEnvelope<ComplaintRow[]>;
                if (body.success) setAllComplaints(body.data || []);
            } else if (allRes) {
                console.error('Failed to load all complaints:', allRes.reason);
            }

        } catch (error) {
            console.error('Unexpected error in loadData:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isManager, user?.role]);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    // Active working list based on tab
    const currentBaseList = useMemo(() => {
        if (scopeMode === 'my') return myComplaints;
        if (scopeMode === 'team') return pendingComplaints;
        if (scopeMode === 'all') return allComplaints;
        if (scopeMode === 'history') {
            if (!selectedHistoryEmployee) return [];
            return allComplaints.filter(c => {
                const compEmpId = c.employeeId?._id || c.employeeId;
                return String(compEmpId) === String(selectedHistoryEmployee._id);
            });
        }
        return [];
    }, [scopeMode, myComplaints, pendingComplaints, allComplaints, selectedHistoryEmployee]);

    // Categories aggregates for horizontal quick tags
    const categoryAggregates = useMemo(() => {
        // Filter currentBaseList by search & status filters first to compute counts
        const listFilteredByOther = currentBaseList.filter(item => {
            const empNo = item.employeeId?.emp_no || item.emp_no || '';
            const empName = item.employeeId?.employee_name || item.employeeName || '';
            const remarks = item.remarks || '';
            const cType = item.complaintType || '';
            const targetString = `${empNo} ${empName} ${remarks} ${cType}`.toLowerCase();
            const matchSearch = !searchText.trim() || targetString.includes(searchText.trim().toLowerCase());
            
            // Status match
            let matchStatus = true;
            if (statusFilter !== 'all') {
                matchStatus = item.status === statusFilter;
            }
            return matchSearch && matchStatus;
        });

        const counts: Record<string, number> = {};
        let total = 0;
        listFilteredByOther.forEach(c => {
            const cat = c.complaintType || 'Unassigned';
            counts[cat] = (counts[cat] || 0) + 1;
            total++;
        });

        return { counts, total };
    }, [currentBaseList, searchText, statusFilter]);

    // Final filtered list to display
    const filteredList = useMemo(() => {
        return currentBaseList.filter(item => {
            // Search match
            const empNo = item.employeeId?.emp_no || item.emp_no || '';
            const empName = item.employeeId?.employee_name || item.employeeName || '';
            const remarks = item.remarks || '';
            const cType = item.complaintType || '';
            const targetString = `${empNo} ${empName} ${remarks} ${cType}`.toLowerCase();
            const matchSearch = !searchText.trim() || targetString.includes(searchText.trim().toLowerCase());

            // Status match
            let matchStatus = true;
            if (statusFilter !== 'all') {
                matchStatus = item.status === statusFilter;
            }

            // Category match
            const matchCategory = !selectedCategory || item.complaintType === selectedCategory;

            return matchSearch && matchStatus && matchCategory;
        });
    }, [currentBaseList, searchText, statusFilter, selectedCategory]);

    const handleClearFilters = () => {
        setSearchText('');
        setStatusFilter('all');
        setSelectedCategory(null);
        setSelectedHistoryEmployee(null);
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFF', '#FFF5F5', '#FFFFFF']} className="absolute inset-0" />
            
            <SafeAreaView className="flex-1 pb-4" edges={['top', 'left', 'right']}>
                {/* Header */}
                <View className="px-6 py-4 flex-row items-center justify-between border-b border-neutral-100 bg-white/70">
                    <View className="flex-row items-center">
                        <TouchableOpacity 
                            onPress={() => router.replace('/(tabs)')}
                            className="p-2 -ml-2 rounded-full active:bg-neutral-100"
                        >
                            <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                        </TouchableOpacity>
                        <View className="ml-2">
                            <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Grievance Hub</Text>
                            <Text className="text-xl font-black text-neutral-900">Complaints</Text>
                        </View>
                    </View>
                    
                    <TouchableOpacity
                        onPress={() => { setRefreshing(true); void loadData(); }}
                        className="p-2 rounded-xl border border-neutral-200 bg-white"
                    >
                        <RefreshCw size={16} color="#475569" />
                    </TouchableOpacity>
                </View>

                {/* Scope Selection Tabs for Managers / HR / Admins */}
                {isManager && (
                    <View className="px-6 mt-4">
                        <View className="flex-row rounded-2xl bg-neutral-100 p-1">
                            <TouchableOpacity
                                onPress={() => { setScopeMode('team'); setSelectedCategory(null); }}
                                className={`flex-1 py-2.5 items-center justify-center rounded-xl ${
                                    scopeMode === 'team' ? 'bg-white border border-neutral-200/50' : ''
                                }`}
                            >
                                <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                    scopeMode === 'team' ? 'text-rose-600' : 'text-neutral-500'
                                }`}>
                                    Inbox ({pendingComplaints.length})
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => { setScopeMode('my'); setSelectedCategory(null); }}
                                className={`flex-1 py-2.5 items-center justify-center rounded-xl ${
                                    scopeMode === 'my' ? 'bg-white border border-neutral-200/50' : ''
                                }`}
                            >
                                <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                    scopeMode === 'my' ? 'text-rose-600' : 'text-neutral-500'
                                }`}>
                                    My Requests
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => { setScopeMode('all'); setSelectedCategory(null); }}
                                className={`flex-1 py-2.5 items-center justify-center rounded-xl ${
                                    scopeMode === 'all' ? 'bg-white border border-neutral-200/50' : ''
                                }`}
                            >
                                <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                    scopeMode === 'all' ? 'text-rose-600' : 'text-neutral-500'
                                }`}>
                                    All
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => { setScopeMode('history'); setSelectedCategory(null); }}
                                className={`flex-1 py-2.5 items-center justify-center rounded-xl ${
                                    scopeMode === 'history' ? 'bg-white border border-neutral-200/50' : ''
                                }`}
                            >
                                <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                    scopeMode === 'history' ? 'text-rose-600' : 'text-neutral-500'
                                }`}>
                                    History
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* History Employee Selection */}
                {scopeMode === 'history' && (
                    <View className="px-6 mt-4">
                        <SearchableEmployeeSelect
                            label="Filter Employee History"
                            selectedEmpNo={selectedHistoryEmployee?.emp_no || ''}
                            onSelect={(emp) => setSelectedHistoryEmployee(emp)}
                            ignoreScope={true}
                        />
                    </View>
                )}

                {/* Search Bar - Full Width */}
                <View className="px-6 mt-4">
                    <View className="flex-row items-center bg-white rounded-2xl border-2 border-neutral-100 px-4 py-2.5">
                        <Search size={18} color="#94A3B8" />
                        <TextInput
                            value={searchText}
                            onChangeText={setSearchText}
                            placeholder="Search complaints..."
                            placeholderTextColor="#94A3B8"
                            className="ml-2 flex-1 h-9 text-sm font-semibold text-neutral-800"
                        />
                        {searchText ? (
                            <TouchableOpacity onPress={() => setSearchText('')} className="p-1">
                                <X size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Status Toggle Filters - Full Width Horizontal Scroll Bar */}
                <View className="mt-3">
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
                    >
                        {STATUS_FILTERS.map(st => (
                            <TouchableOpacity
                                key={st}
                                onPress={() => setStatusFilter(st)}
                                className={`px-4 py-2 rounded-xl border ${
                                    statusFilter === st 
                                        ? 'bg-rose-50 border-rose-300' 
                                        : 'bg-white border-neutral-100'
                                }`}
                            >
                                <Text className={`text-[10px] font-black uppercase tracking-wider ${
                                    statusFilter === st ? 'text-rose-700' : 'text-neutral-500'
                                }`}>
                                    {st}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Categories Aggregate scroll bar (matches web design tag system) */}
                {categoryAggregates.total > 0 && (
                    <View className="mt-3">
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
                        >
                            {/* All categories tag */}
                            <TouchableOpacity
                                onPress={() => setSelectedCategory(null)}
                                className={`flex-row items-center gap-1.5 px-3.5 py-2.5 rounded-xl border ${
                                    !selectedCategory
                                        ? 'border-rose-300 bg-rose-50/50'
                                        : 'border-neutral-100 bg-neutral-50'
                                }`}
                            >
                                <View className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                <Text className={`text-[10px] font-bold ${
                                    !selectedCategory
                                        ? 'text-rose-800 font-extrabold'
                                        : 'text-neutral-600'
                                }`}>
                                    All Categories
                                </Text>
                                <View className={`px-1.5 py-0.5 rounded-md ${
                                    !selectedCategory ? 'bg-rose-100' : 'bg-neutral-200'
                                }`}>
                                    <Text className={`text-[8.5px] font-black ${
                                        !selectedCategory ? 'text-rose-800' : 'text-neutral-700'
                                    }`}>
                                        {categoryAggregates.total}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            {/* Individual categories */}
                            {Object.entries(categoryAggregates.counts).map(([cat, count]) => {
                                const isSel = selectedCategory === cat;
                                return (
                                    <TouchableOpacity
                                        key={cat}
                                        onPress={() => setSelectedCategory(isSel ? null : cat)}
                                        className={`flex-row items-center gap-1.5 px-3.5 py-2.5 rounded-xl border ${
                                            isSel
                                                ? 'border-rose-300 bg-rose-50/50'
                                                : 'border-neutral-100 bg-neutral-50'
                                        }`}
                                    >
                                        <View className={`h-1.5 w-1.5 rounded-full ${isSel ? 'bg-rose-500' : 'bg-neutral-400'}`} />
                                        <Text className={`text-[10px] font-bold ${
                                            isSel
                                                ? 'text-rose-800 font-extrabold'
                                                : 'text-neutral-600'
                                        }`}>
                                            {cat}
                                        </Text>
                                        <View className={`px-1.5 py-0.5 rounded-md ${
                                            isSel ? 'bg-rose-100' : 'bg-neutral-200'
                                        }`}>
                                            <Text className={`text-[8.5px] font-black ${
                                                isSel ? 'text-rose-800' : 'text-neutral-700'
                                            }`}>
                                                {count}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* History placeholder */}
                {scopeMode === 'history' && !selectedHistoryEmployee && (
                    <View className="flex-1 px-6 items-center justify-center py-20">
                        <Users size={48} color="#CBD5E1" strokeWidth={1.5} />
                        <Text className="mt-4 text-sm font-black text-neutral-400 uppercase tracking-widest text-center">
                            Select an employee
                        </Text>
                        <Text className="mt-1 text-xs text-neutral-400 text-center">
                            Select an employee above to inspect their grievance history.
                        </Text>
                    </View>
                )}

                {/* Complaint List Display */}
                {!(scopeMode === 'history' && !selectedHistoryEmployee) && (
                    <ScrollView
                        className="flex-1 px-6 mt-4"
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(); }} />
                        }
                    >
                        {loading && filteredList.length === 0 ? (
                            <View className="py-4 gap-y-4">
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                        ) : filteredList.length === 0 ? (
                            <View className="items-center justify-center py-20">
                                <AlertTriangle size={48} color="#CBD5E1" strokeWidth={1.5} />
                                <Text className="mt-4 text-sm font-black text-neutral-400 uppercase tracking-widest text-center">
                                    No complaints found
                                </Text>
                                <Text className="mt-1 text-xs text-neutral-400 text-center">
                                    No records match your selected criteria.
                                </Text>
                                {(searchText || statusFilter !== 'all' || selectedCategory) && (
                                    <TouchableOpacity 
                                        onPress={handleClearFilters}
                                        className="mt-4 px-4 py-2 rounded-xl bg-neutral-100 border border-neutral-200"
                                    >
                                        <Text className="text-[10px] font-black uppercase text-neutral-600">Clear filters</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            <View className="pb-24">
                                {filteredList.map((c, idx) => {
                                    const dateStr = c.appliedAt || c.createdAt;
                                    const formattedDate = dateStr 
                                        ? new Date(dateStr).toLocaleDateString('en-IN', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric'
                                        })
                                        : 'â€”';
                                    const badges = statusBadgeStyles(c.status);
                                    const empName = c.employeeId?.employee_name || c.employeeName || 'Self';
                                    const empNo = c.employeeId?.emp_no || c.emp_no || '';

                                    return (
                                        <MotiView
                                            key={c._id}
                                            from={{ opacity: 0, translateY: 10 }}
                                            animate={{ opacity: 1, translateY: 0 }}
                                            transition={{ type: 'timing', duration: 300, delay: idx * 40 }}
                                        >
                                            <TouchableOpacity
                                                activeOpacity={0.9}
                                                onPress={() => router.push(`/complaint/${c._id}`)}
                                                className="mb-3.5 rounded-3xl border border-neutral-100 bg-white p-5"
                                            >
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-1 pr-3">
                                                        <Text className="text-[9px] font-black tracking-wider uppercase text-rose-600">
                                                            {c.complaintType}
                                                        </Text>
                                                        {scopeMode !== 'my' && (
                                                            <Text className="mt-1 text-sm font-black text-neutral-900">
                                                                {empName} <Text className="text-neutral-400 font-bold text-xs">({empNo})</Text>
                                                            </Text>
                                                        )}
                                                        <Text className="mt-1 text-xs text-neutral-500 font-medium" numberOfLines={2}>
                                                            {c.remarks}
                                                        </Text>
                                                    </View>
                                                    <View className={`rounded-xl border px-3 py-1.5 ${badges.bg}`}>
                                                        <Text className={`text-[8.5px] font-black uppercase tracking-wider ${badges.text}`}>
                                                            {statusLabel(c.status)}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View className="mt-4 pt-3.5 border-t border-neutral-50 flex-row items-center justify-between">
                                                    <View className="flex-row items-center gap-1.5">
                                                        <Calendar size={12} color="#94A3B8" />
                                                        <Text className="text-[10px] font-bold text-neutral-400">{formattedDate}</Text>
                                                    </View>
                                                    <View className="flex-row items-center gap-1">
                                                        <Text className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Details</Text>
                                                        <Eye size={12} color="#E11D48" strokeWidth={2.5} />
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        </MotiView>
                                    );
                                })}
                            </View>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>

            {/* Floating Action Button to submit a new complaint */}
            {canApply && (
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => router.push('/apply-complaint')}
                    className="absolute bottom-32 right-6 h-14 w-14 items-center justify-center rounded-full bg-rose-600"
                    style={{
                        shadowColor: '#E11D48',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 8
                    }}
                >
                    <Plus size={24} color="#FFFFFF" strokeWidth={3} />
                </TouchableOpacity>
            )}
        </View>
    );
}
