import { useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Funnel, Search, X } from 'lucide-react-native';

export type FilterOption = {
    label: string;
    value: string;
};

type Props = {
    search: string;
    onSearchChange: (value: string) => void;
    onApply: () => void;
    onReset: () => void;
    selectedDivision: string;
    selectedDepartment: string;
    selectedDesignation: string;
    selectedEmployeeGroup?: string;
    onDivisionChange: (value: string) => void;
    onDepartmentChange: (value: string) => void;
    onDesignationChange: (value: string) => void;
    onEmployeeGroupChange?: (value: string) => void;
    divisionOptions: FilterOption[];
    departmentOptions: FilterOption[];
    designationOptions: FilterOption[];
    employeeGroupOptions?: FilterOption[];
    showEmployeeGroup?: boolean;
    loadingOptions?: boolean;
};

function DropdownField({
    fieldKey,
    title,
    allLabel,
    selectedValue,
    onOpenPicker,
}: {
    fieldKey: string;
    title: string;
    allLabel: string;
    selectedValue: string;
    onOpenPicker: (key: string) => void;
}) {
    return (
        <View className="mt-3">
            <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">{title}</Text>
            <TouchableOpacity
                onPress={() => onOpenPicker(fieldKey)}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
                activeOpacity={0.8}
            >
                <Text className="text-xs font-semibold text-neutral-700" numberOfLines={1}>
                    {selectedValue || allLabel}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

export function EntityFiltersBar({
    search,
    onSearchChange,
    onApply,
    onReset,
    selectedDivision,
    selectedDepartment,
    selectedDesignation,
    selectedEmployeeGroup = '',
    onDivisionChange,
    onDepartmentChange,
    onDesignationChange,
    onEmployeeGroupChange,
    divisionOptions,
    departmentOptions,
    designationOptions,
    employeeGroupOptions = [],
    showEmployeeGroup = false,
    loadingOptions = false,
}: Props) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [pickerKey, setPickerKey] = useState<string | null>(null);

    const selectedDivisionLabel = useMemo(() => {
        if (!selectedDivision) return '';
        return divisionOptions.find((o) => o.value === selectedDivision)?.label || '';
    }, [divisionOptions, selectedDivision]);
    const selectedDepartmentLabel = useMemo(() => {
        if (!selectedDepartment) return '';
        return departmentOptions.find((o) => o.value === selectedDepartment)?.label || '';
    }, [departmentOptions, selectedDepartment]);
    const selectedDesignationLabel = useMemo(() => {
        if (!selectedDesignation) return '';
        return designationOptions.find((o) => o.value === selectedDesignation)?.label || '';
    }, [designationOptions, selectedDesignation]);
    const selectedGroupLabel = useMemo(() => {
        if (!selectedEmployeeGroup) return '';
        return employeeGroupOptions.find((o) => o.value === selectedEmployeeGroup)?.label || '';
    }, [employeeGroupOptions, selectedEmployeeGroup]);

    const pickerConfig = useMemo(() => {
        if (pickerKey === 'division') {
            return {
                title: 'Division',
                allLabel: 'All Divisions',
                selectedValue: selectedDivision,
                options: divisionOptions,
                onSelect: onDivisionChange,
            };
        }
        if (pickerKey === 'department') {
            return {
                title: 'Department',
                allLabel: 'All Departments',
                selectedValue: selectedDepartment,
                options: departmentOptions,
                onSelect: onDepartmentChange,
            };
        }
        if (pickerKey === 'designation') {
            return {
                title: 'Designation',
                allLabel: 'All Designations',
                selectedValue: selectedDesignation,
                options: designationOptions,
                onSelect: onDesignationChange,
            };
        }
        if (pickerKey === 'group' && showEmployeeGroup && onEmployeeGroupChange) {
            return {
                title: 'Group',
                allLabel: 'All Groups',
                selectedValue: selectedEmployeeGroup,
                options: employeeGroupOptions,
                onSelect: onEmployeeGroupChange,
            };
        }
        return null;
    }, [
        departmentOptions,
        designationOptions,
        divisionOptions,
        employeeGroupOptions,
        onDepartmentChange,
        onDesignationChange,
        onDivisionChange,
        onEmployeeGroupChange,
        pickerKey,
        selectedDepartment,
        selectedDesignation,
        selectedDivision,
        selectedEmployeeGroup,
        showEmployeeGroup,
    ]);

    return (
        <View className="mb-4 rounded-2xl border border-neutral-100 bg-white p-3">
            <View className="flex-row items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                <Search size={16} color="#64748B" />
                <TextInput
                    value={search}
                    onChangeText={onSearchChange}
                    placeholder="Search name, emp no, phone..."
                    placeholderTextColor="#94A3B8"
                    className="flex-1 px-2 py-2.5 text-neutral-900"
                    returnKeyType="search"
                    onSubmitEditing={onApply}
                />
                <TouchableOpacity
                    onPress={() => setFiltersOpen((v) => !v)}
                    className={`h-9 w-9 items-center justify-center rounded-lg border ${filtersOpen ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                >
                    <Funnel size={14} color={filtersOpen ? '#047857' : '#64748B'} />
                </TouchableOpacity>
            </View>

            {filtersOpen ? (
                <>
                    <DropdownField
                        fieldKey="division"
                        onOpenPicker={setPickerKey}
                        title={loadingOptions ? 'Division (loading...)' : 'Division'}
                        allLabel="All Divisions"
                        selectedValue={selectedDivisionLabel}
                    />
                    <DropdownField
                        fieldKey="department"
                        onOpenPicker={setPickerKey}
                        title={loadingOptions ? 'Department (loading...)' : 'Department'}
                        allLabel="All Departments"
                        selectedValue={selectedDepartmentLabel}
                    />
                    <DropdownField
                        fieldKey="designation"
                        onOpenPicker={setPickerKey}
                        title={loadingOptions ? 'Designation (loading...)' : 'Designation'}
                        allLabel="All Designations"
                        selectedValue={selectedDesignationLabel}
                    />
                    {showEmployeeGroup && onEmployeeGroupChange ? (
                        <DropdownField
                            fieldKey="group"
                            onOpenPicker={setPickerKey}
                            title={loadingOptions ? 'Group (loading...)' : 'Group'}
                            allLabel="All Groups"
                            selectedValue={selectedGroupLabel}
                        />
                    ) : null}

                    <View className="mt-4 flex-row gap-2">
                        <TouchableOpacity
                            onPress={() => {
                                onApply();
                                setFiltersOpen(false);
                            }}
                            className="flex-1 rounded-xl bg-emerald-600 py-2.5"
                        >
                            <Text className="text-center text-xs font-black uppercase tracking-widest text-white">Apply</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onReset} className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 py-2.5">
                            <Text className="text-center text-xs font-black uppercase tracking-widest text-neutral-700">Reset</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : null}

            <Modal visible={pickerConfig != null} transparent animationType="fade" onRequestClose={() => setPickerKey(null)}>
                <View className="flex-1 bg-black/40 px-5 py-10">
                    <View className="mt-20 rounded-2xl bg-white p-4">
                        <View className="mb-3 flex-row items-center justify-between">
                            <Text className="text-sm font-black text-neutral-900">{pickerConfig?.title}</Text>
                            <TouchableOpacity onPress={() => setPickerKey(null)} className="rounded-md p-1">
                                <X size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
                            <TouchableOpacity
                                onPress={() => {
                                    pickerConfig?.onSelect('');
                                    setPickerKey(null);
                                }}
                                className={`mb-1 rounded-lg px-3 py-2 ${pickerConfig?.selectedValue ? 'bg-white' : 'bg-emerald-50'}`}
                            >
                                <Text className={`text-sm font-semibold ${pickerConfig?.selectedValue ? 'text-neutral-700' : 'text-emerald-700'}`}>
                                    {pickerConfig?.allLabel}
                                </Text>
                            </TouchableOpacity>
                            {(pickerConfig?.options || []).map((option) => {
                                const active = pickerConfig?.selectedValue === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => {
                                            pickerConfig?.onSelect(option.value);
                                            setPickerKey(null);
                                        }}
                                        className={`mb-1 rounded-lg px-3 py-2 ${active ? 'bg-emerald-50' : 'bg-white'}`}
                                    >
                                        <Text className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-neutral-700'}`}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
