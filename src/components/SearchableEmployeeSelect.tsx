import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    ScrollView,
    SafeAreaView,
} from 'react-native';
import { Search, X, ChevronRight } from 'lucide-react-native';
import { api, ApiEnvelope } from '../api/client';

type Employee = {
    _id: string;
    emp_no: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    department?: { name?: string } | string;
    designation?: { name?: string } | string;
};

type Props = {
    label?: string;
    selectedEmpNo: string;
    onSelect: (emp: Employee | null) => void;
};

export function SearchableEmployeeSelect({ label = 'Select Employee', selectedEmpNo, onSelect }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedName, setSelectedName] = useState('');

    const loadEmployees = async (term = '') => {
        setLoading(true);
        try {
            const res = await api.getEmployees({
                is_active: true,
                search: term || undefined,
                limit: 50,
            });
            const body = res.data as ApiEnvelope<Employee[]>;
            if (body.success && Array.isArray(body.data)) {
                setEmployees(body.data);
                if (selectedEmpNo) {
                    const matched = body.data.find(
                        (e) => String(e.emp_no).toUpperCase() === String(selectedEmpNo).toUpperCase()
                    );
                    if (matched) {
                        setSelectedName(matched.employee_name || `${matched.first_name || ''} ${matched.last_name || ''}`.trim());
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching employees:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            void loadEmployees(search);
        }
    }, [open, search]);

    useEffect(() => {
        if (selectedEmpNo && !open) {
            const fetchSingle = async () => {
                try {
                    const res = await api.getEmployee(selectedEmpNo);
                    const body = res.data as ApiEnvelope<Employee>;
                    if (body.success && body.data) {
                        const matched = body.data;
                        setSelectedName(matched.employee_name || `${matched.first_name || ''} ${matched.last_name || ''}`.trim());
                    } else {
                        setSelectedName(selectedEmpNo);
                    }
                } catch {
                    setSelectedName(selectedEmpNo);
                }
            };
            void fetchSingle();
        } else if (!selectedEmpNo) {
            setSelectedName('');
        }
    }, [selectedEmpNo]);

    const handleSelect = (emp: Employee) => {
        setSelectedName(emp.employee_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim());
        onSelect(emp);
        setOpen(false);
        setSearch('');
    };

    const handleClear = () => {
        setSelectedName('');
        onSelect(null);
    };

    const resolveNodeName = (v: unknown): string => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '');
        return '';
    };

    return (
        <View className="mb-4">
            {label ? (
                <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">{label}</Text>
            ) : null}

            <View className="flex-row items-center bg-white rounded-2xl border-2 border-neutral-100 pr-3">
                <TouchableOpacity
                    onPress={() => setOpen(true)}
                    className="flex-1 px-4 py-3.5"
                >
                    <Text className={`font-bold ${selectedName ? 'text-neutral-900' : 'text-neutral-400'}`}>
                        {selectedName || 'Search and select employee...'}
                    </Text>
                </TouchableOpacity>

                {selectedEmpNo ? (
                    <TouchableOpacity onPress={handleClear} className="p-1">
                        <X size={16} color="#94A3B8" />
                    </TouchableOpacity>
                ) : (
                    <ChevronRight size={18} color="#94A3B8" />
                )}
            </View>

            <Modal visible={open} animationType="slide" transparent>
                <SafeAreaView className="flex-1 bg-white">
                    <View className="flex-row items-center px-6 pt-4 pb-3 border-b border-neutral-100">
                        <TouchableOpacity
                            onPress={() => {
                                setOpen(false);
                                setSearch('');
                            }}
                            className="p-1 mr-2"
                        >
                            <X size={24} color="#0F172A" />
                        </TouchableOpacity>
                        <Text className="text-neutral-900 text-lg font-black flex-1">Select Employee</Text>
                    </View>

                    <View className="px-6 py-3">
                        <View className="flex-row items-center rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-3">
                            <Search size={18} color="#94A3B8" />
                            <TextInput
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Search by name or emp no..."
                                placeholderTextColor="#94A3B8"
                                className="ml-2 h-12 flex-1 text-sm font-medium text-neutral-800"
                            />
                            {search ? (
                                <TouchableOpacity onPress={() => setSearch('')} className="p-1">
                                    <X size={16} color="#94A3B8" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    {loading && employees.length === 0 ? (
                        <View className="flex-1 items-center justify-center">
                            <ActivityIndicator size="large" color="#10B981" />
                        </View>
                    ) : (
                        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
                            {employees.map((emp) => {
                                const name = emp.employee_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                                const dept = resolveNodeName(emp.department);
                                const desig = resolveNodeName(emp.designation);
                                return (
                                    <TouchableOpacity
                                        key={emp._id}
                                        onPress={() => handleSelect(emp)}
                                        className="py-4 border-b border-neutral-100 flex-row items-center justify-between"
                                    >
                                        <View className="flex-1 pr-3">
                                            <Text className="text-neutral-900 font-bold text-sm">{name}</Text>
                                            <Text className="text-neutral-400 text-xs mt-0.5">{emp.emp_no}</Text>
                                            {dept || desig ? (
                                                <Text className="text-neutral-500 text-[10px] mt-0.5">
                                                    {[desig, dept].filter(Boolean).join(' · ')}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <ChevronRight size={16} color="#CBD5E1" />
                                    </TouchableOpacity>
                                );
                            })}
                            {!loading && employees.length === 0 ? (
                                <View className="items-center py-12">
                                    <Text className="text-neutral-500 text-sm font-medium">No active employees found.</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                    )}
                </SafeAreaView>
            </Modal>
        </View>
    );
}
