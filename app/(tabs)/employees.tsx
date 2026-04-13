import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, IdCard, ShieldCheck, Users } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiEnvelope } from '../../src/api/client';
import { useAuthStore } from '../../src/store/useAuthStore';
import { canViewEmployeesModule, isManagementRole } from '../../src/lib/permissions';
import { SkeletonCard } from '../../src/components/Skeleton';
import { EntityFiltersBar, type FilterOption } from '../../src/components/EntityFiltersBar';

type OrgNode = string | { _id?: string; name?: string; code?: string };
type EmployeeRow = {
    _id?: string;
    emp_no?: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    designation?: OrgNode;
    designation_id?: OrgNode;
    department?: OrgNode;
    department_id?: OrgNode;
    division?: OrgNode;
    division_id?: OrgNode;
    is_active?: boolean;
};

type LinkedRef = string | { _id?: string; name?: string; code?: string };
type DivisionOptionRaw = { _id?: string; name?: string; departments?: LinkedRef[] };
type DepartmentOptionRaw = {
    _id?: string;
    name?: string;
    designations?: LinkedRef[];
    division?: LinkedRef;
    divisions?: LinkedRef[];
};
type DesignationOptionRaw = { _id?: string; name?: string; department?: LinkedRef };

function nodeName(v: unknown): string {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '—');
    return '—';
}

function empName(row: EmployeeRow): string {
    return String(row.employee_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || '—');
}

export default function EmployeesScreen() {
    const user = useAuthStore((s) => s.user);
    const canViewModule = canViewEmployeesModule(user);
    const isMgmt = isManagementRole(user);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDivision, setSelectedDivision] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedDesignation, setSelectedDesignation] = useState('');
    const [selectedEmployeeGroup, setSelectedEmployeeGroup] = useState('');
    const [customEmployeeGroupingEnabled, setCustomEmployeeGroupingEnabled] = useState(false);
    const [divisionOptions, setDivisionOptions] = useState<FilterOption[]>([]);
    const [departmentOptions, setDepartmentOptions] = useState<FilterOption[]>([]);
    const [designationOptions, setDesignationOptions] = useState<FilterOption[]>([]);
    const [employeeGroupOptions, setEmployeeGroupOptions] = useState<FilterOption[]>([]);
    const [divisionsRaw, setDivisionsRaw] = useState<DivisionOptionRaw[]>([]);
    const [departmentsRaw, setDepartmentsRaw] = useState<DepartmentOptionRaw[]>([]);
    const [linkedDesignationOptions, setLinkedDesignationOptions] = useState<FilterOption[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [rows, setRows] = useState<EmployeeRow[]>([]);

    const loadFilters = useCallback(async () => {
        setLoadingFilters(true);
        try {
            const [divRes, deptRes, desigRes] = await Promise.allSettled([
                api.getDivisions(true),
                api.getDepartments(true),
                api.getAllDesignations(true),
            ]);
            const toOptions = (list: unknown): FilterOption[] => {
                if (!Array.isArray(list)) return [];
                return list
                    .map((item) => {
                        if (!item || typeof item !== 'object') return null;
                        const row = item as { _id?: unknown; name?: unknown };
                        if (!row._id || !row.name) return null;
                        return { value: String(row._id), label: String(row.name) };
                    })
                    .filter((item): item is FilterOption => item !== null);
            };

            const divBody = divRes.status === 'fulfilled' ? (divRes.value.data as ApiEnvelope<unknown>) : null;
            const deptBody = deptRes.status === 'fulfilled' ? (deptRes.value.data as ApiEnvelope<unknown>) : null;
            const desigBody = desigRes.status === 'fulfilled' ? (desigRes.value.data as ApiEnvelope<unknown>) : null;

            setDivisionOptions(toOptions(divBody?.data));
            setDepartmentOptions(toOptions(deptBody?.data));
            setDesignationOptions(toOptions(desigBody?.data));
            setDivisionsRaw(Array.isArray(divBody?.data) ? (divBody?.data as DivisionOptionRaw[]) : []);
            setDepartmentsRaw(Array.isArray(deptBody?.data) ? (deptBody?.data as DepartmentOptionRaw[]) : []);

            try {
                const settingRes = await api.getSetting('custom_employee_grouping_enabled');
                const enabled = Boolean(settingRes.data?.success && settingRes.data?.data?.value);
                setCustomEmployeeGroupingEnabled(enabled);
                if (enabled) {
                    const groupsRes = await api.getEmployeeGroups(true);
                    const groupsBody = groupsRes.data as ApiEnvelope<unknown>;
                    setEmployeeGroupOptions(toOptions(groupsBody.data));
                } else {
                    setEmployeeGroupOptions([]);
                    setSelectedEmployeeGroup('');
                }
            } catch {
                setCustomEmployeeGroupingEnabled(false);
                setEmployeeGroupOptions([]);
                setSelectedEmployeeGroup('');
            }
        } finally {
            setLoadingFilters(false);
        }
    }, []);

    const load = useCallback(async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await api.getEmployees({
                is_active: true,
                page: pageNum,
                limit: pageSize,
                search: searchQuery.trim() || undefined,
                division_id: selectedDivision || undefined,
                department_id: selectedDepartment || undefined,
                designation_id: selectedDesignation || undefined,
                employee_group_id: customEmployeeGroupingEnabled ? selectedEmployeeGroup || undefined : undefined,
            });
            const body = res.data as ApiEnvelope<unknown>;
            let list: EmployeeRow[] = [];
            if (Array.isArray(body.data)) {
                list = body.data as EmployeeRow[];
            } else if (body.data && typeof body.data === 'object') {
                const maybe = body.data as { data?: unknown[]; employees?: unknown[] };
                if (Array.isArray(maybe.data)) list = maybe.data as EmployeeRow[];
                else if (Array.isArray(maybe.employees)) list = maybe.employees as EmployeeRow[];
            }

            const paginationFromBody =
                (body as unknown as { pagination?: { total?: number; totalPages?: number; page?: number } }).pagination ||
                (body.data &&
                typeof body.data === 'object' &&
                'pagination' in (body.data as object)
                    ? ((body.data as { pagination?: { total?: number; totalPages?: number; page?: number } }).pagination || undefined)
                    : undefined);

            setRows(list);
            if (paginationFromBody) {
                const total = Number(paginationFromBody.total || 0);
                const pages = Number(paginationFromBody.totalPages || 1);
                setTotalCount(total);
                setTotalPages(pages > 0 ? pages : 1);
                setCurrentPage(Number(paginationFromBody.page || pageNum));
            } else {
                setTotalCount(list.length);
                setTotalPages(1);
                setCurrentPage(1);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [customEmployeeGroupingEnabled, pageSize, searchQuery, selectedDepartment, selectedDesignation, selectedDivision, selectedEmployeeGroup]);

    useFocusEffect(
        useCallback(() => {
            void loadFilters();
        }, [loadFilters])
    );

    const applyFilters = useCallback(() => {
        setSearchQuery(searchInput.trim());
        setCurrentPage(1);
    }, [searchInput]);

    const resetFilters = useCallback(() => {
        setSearchInput('');
        setSearchQuery('');
        setSelectedDivision('');
        setSelectedDepartment('');
        setSelectedDesignation('');
        setSelectedEmployeeGroup('');
        setCurrentPage(1);
    }, []);

    const departmentChoices = useMemo(() => {
        if (!selectedDivision) return departmentOptions;
        return departmentsRaw
            .filter((d) => {
                const direct = d.division;
                if (direct) {
                    const directId = typeof direct === 'string' ? direct : String(direct._id || '');
                    if (directId === selectedDivision) return true;
                }
                if (Array.isArray(d.divisions)) {
                    return d.divisions.some((div) => {
                        const id = typeof div === 'string' ? div : String(div._id || '');
                        return id === selectedDivision;
                    });
                }
                return false;
            })
            .map((d) => ({ value: String(d._id || ''), label: d.name || String(d._id || '') }))
            .filter((d) => d.value !== '');
    }, [departmentOptions, departmentsRaw, selectedDivision]);

    const designationChoices = useMemo(() => {
        if (selectedDepartment) return linkedDesignationOptions;
        return designationOptions;
    }, [designationOptions, linkedDesignationOptions, selectedDepartment]);

    useEffect(() => {
        const run = async () => {
            if (!selectedDepartment) {
                setLinkedDesignationOptions([]);
                return;
            }
            try {
                const res = await api.getDesignations(selectedDepartment, true);
                const body = res.data as ApiEnvelope<unknown>;
                const list = Array.isArray(body.data) ? body.data : [];
                const mapped = list
                    .map((item) => {
                        if (!item || typeof item !== 'object') return null;
                        const row = item as { _id?: unknown; name?: unknown };
                        if (!row._id || !row.name) return null;
                        return { value: String(row._id), label: String(row.name) };
                    })
                    .filter((item): item is FilterOption => item !== null);
                setLinkedDesignationOptions(mapped);
            } catch {
                setLinkedDesignationOptions([]);
            }
        };
        void run();
    }, [selectedDepartment]);

    const pageSizes = [20, 50, 100];

    useEffect(() => {
        void load(currentPage);
    }, [load, currentPage]);

    const activeCount = useMemo(
        () => rows.filter((r) => r.is_active !== false).length,
        [rows]
    );

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                {!canViewModule ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-center font-semibold text-neutral-700">You do not have access to Employees module.</Text>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1 px-6 pt-6"
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(currentPage); }} tintColor="#10B981" />}
                    >
                        <View className="mb-6">
                            <View className="mb-1 flex-row items-center">
                                <View className="mr-2 h-1 w-8 rounded-full bg-primary" />
                                <Text className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Directory</Text>
                            </View>
                            <Text className="text-3xl font-black tracking-tight text-neutral-900">
                                Employees<Text className="text-primary">.</Text>List
                            </Text>
                            <Text className="mt-1 text-sm font-medium text-neutral-500">
                                {isMgmt ? 'Scoped employee directory for your role access.' : 'Employee list'}
                            </Text>
                        </View>

                        <EntityFiltersBar
                            search={searchInput}
                            onSearchChange={setSearchInput}
                            onApply={applyFilters}
                            onReset={resetFilters}
                            selectedDivision={selectedDivision}
                            selectedDepartment={selectedDepartment}
                            selectedDesignation={selectedDesignation}
                            selectedEmployeeGroup={selectedEmployeeGroup}
                            onDivisionChange={(v) => {
                                setSelectedDivision(v);
                                setSelectedDepartment('');
                                setSelectedDesignation('');
                                setSelectedEmployeeGroup('');
                            }}
                            onDepartmentChange={(v) => {
                                setSelectedDepartment(v);
                                setSelectedDesignation('');
                                setSelectedEmployeeGroup('');
                            }}
                            onDesignationChange={(v) => {
                                setSelectedDesignation(v);
                                setSelectedEmployeeGroup('');
                            }}
                            onEmployeeGroupChange={setSelectedEmployeeGroup}
                            divisionOptions={divisionOptions}
                            departmentOptions={departmentChoices}
                            designationOptions={designationChoices}
                            employeeGroupOptions={employeeGroupOptions}
                            showEmployeeGroup={customEmployeeGroupingEnabled}
                            loadingOptions={loadingFilters}
                        />

                        <View className="mb-4 rounded-2xl border-2 border-neutral-50 bg-white p-4">
                            <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Active employees</Text>
                            <Text className="mt-1 text-2xl font-black text-neutral-900">{activeCount}</Text>
                        </View>

                        {loading && !refreshing ? (
                            <View className="pb-28">
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                        ) : rows.length === 0 ? (
                            <View className="mb-24 items-center rounded-[32px] border-2 border-neutral-50 bg-white p-10">
                                <View className="mb-6 h-20 w-20 items-center justify-center rounded-[28px] border border-emerald-100 bg-emerald-50">
                                    <Users size={36} color="#10B981" strokeWidth={2.5} />
                                </View>
                                <Text className="mb-2 text-xl font-black text-neutral-900">No employees</Text>
                                <Text className="text-center font-medium leading-6 text-neutral-500">
                                    No employee records available for your current scope.
                                </Text>
                            </View>
                        ) : (
                            <View className="gap-3 pb-8">
                                {rows.map((r, idx) => (
                                    <View
                                        key={String(r._id || `${r.emp_no}-${idx}`)}
                                        className="rounded-[28px] border border-neutral-100 bg-white p-5 shadow-sm"
                                    >
                                        <View className="mb-3 flex-row items-start justify-between gap-3">
                                            <View className="min-w-0 flex-1">
                                                <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Employee</Text>
                                                <Text className="mt-0.5 text-base font-black text-neutral-900" numberOfLines={1}>
                                                    {empName(r)}
                                                </Text>
                                                <Text className="mt-0.5 text-xs font-semibold text-neutral-500">
                                                    {r.email || 'No work email'}
                                                </Text>
                                            </View>
                                            <View className={`rounded-full border px-2.5 py-1 ${r.is_active === false ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                                                <Text className={`text-[10px] font-black uppercase tracking-wider ${r.is_active === false ? 'text-rose-800' : 'text-emerald-800'}`}>
                                                    {r.is_active === false ? 'Inactive' : 'Active'}
                                                </Text>
                                            </View>
                                        </View>

                                        <View className="mb-3 flex-row gap-2">
                                            <View className="min-w-0 flex-1 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                                <View className="flex-row items-center gap-1.5">
                                                    <IdCard size={13} color="#64748B" />
                                                    <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-500">Emp No</Text>
                                                </View>
                                                <Text className="mt-1 text-xs font-black text-neutral-800">{String(r.emp_no || '—')}</Text>
                                            </View>
                                            <View className="min-w-0 flex-1 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                                <View className="flex-row items-center gap-1.5">
                                                    <ShieldCheck size={13} color="#64748B" />
                                                    <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-500">Designation</Text>
                                                </View>
                                                <Text className="mt-1 text-xs font-black text-neutral-800" numberOfLines={1}>
                                                    {nodeName(r.designation || r.designation_id)}
                                                </Text>
                                            </View>
                                        </View>

                                        <View className="rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-3">
                                            <View className="flex-row items-center gap-1.5">
                                                <Building2 size={13} color="#64748B" />
                                                <Text className="text-[9px] font-black uppercase tracking-wider text-neutral-500">Organization</Text>
                                            </View>
                                            <Text className="mt-2 text-xs text-neutral-700">
                                                <Text className="font-bold text-neutral-500">Division: </Text>
                                                {nodeName(r.division || r.division_id)}
                                            </Text>
                                            <Text className="mt-1 text-xs text-neutral-700">
                                                <Text className="font-bold text-neutral-500">Department: </Text>
                                                {nodeName(r.department || r.department_id)}
                                            </Text>
                                            {r.phone_number ? (
                                                <Text className="mt-1 text-xs text-neutral-700">
                                                    <Text className="font-bold text-neutral-500">Phone: </Text>
                                                    {r.phone_number}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View className="mb-28 mt-4 rounded-2xl border border-neutral-100 bg-white p-4">
                            <Text className="text-xs font-semibold text-neutral-600">
                                Showing <Text className="font-black text-neutral-900">{rows.length}</Text> of{' '}
                                <Text className="font-black text-neutral-900">{totalCount}</Text> employees
                            </Text>
                            <Text className="mt-1 text-xs text-neutral-500">
                                Page {currentPage} of {totalPages}
                            </Text>

                            <View className="mt-3 flex-row gap-2">
                                {pageSizes.map((size) => (
                                    <TouchableOpacity
                                        key={size}
                                        onPress={() => {
                                            setPageSize(size);
                                            setCurrentPage(1);
                                        }}
                                        className={`rounded-full border px-3 py-1.5 ${pageSize === size ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                                    >
                                        <Text className={`text-[10px] font-black uppercase tracking-wider ${pageSize === size ? 'text-emerald-700' : 'text-neutral-600'}`}>
                                            {size}/page
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View className="mt-3 flex-row gap-2">
                                <TouchableOpacity
                                    disabled={currentPage <= 1 || loading}
                                    onPress={() => {
                                        if (currentPage > 1) {
                                            const next = currentPage - 1;
                                            setCurrentPage(next);
                                        }
                                    }}
                                    className={`flex-1 rounded-xl border py-2.5 ${currentPage <= 1 || loading ? 'border-neutral-100 bg-neutral-100' : 'border-neutral-200 bg-white'}`}
                                >
                                    <Text className={`text-center text-xs font-black uppercase tracking-widest ${currentPage <= 1 || loading ? 'text-neutral-400' : 'text-neutral-700'}`}>
                                        Prev
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={currentPage >= totalPages || loading}
                                    onPress={() => {
                                        if (currentPage < totalPages) {
                                            const next = currentPage + 1;
                                            setCurrentPage(next);
                                        }
                                    }}
                                    className={`flex-1 rounded-xl border py-2.5 ${currentPage >= totalPages || loading ? 'border-neutral-100 bg-neutral-100' : 'border-emerald-200 bg-emerald-50'}`}
                                >
                                    <Text className={`text-center text-xs font-black uppercase tracking-widest ${currentPage >= totalPages || loading ? 'text-neutral-400' : 'text-emerald-700'}`}>
                                        Next
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                )}
            </SafeAreaView>
        </View>
    );
}
