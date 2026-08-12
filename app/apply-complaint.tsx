import { useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Image,
    Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Camera, Image as ImageIcon, Trash2, Check, AlertCircle, X, Plus, ChevronDown } from 'lucide-react-native';
import { api, ApiEnvelope } from '../src/api/client';
import { useAuthStore } from '../src/store/useAuthStore';
import { canApplyComplaints, isManagementRole } from '../src/lib/permissions';
import { ApplyWriteGate } from '../src/components/ApplyWriteGate';
import { SearchableEmployeeSelect } from '../src/components/SearchableEmployeeSelect';

type ComplaintTypeOpt = { code: string; name: string; isActive?: boolean };

export default function ApplyComplaintScreen() {
    const router = useRouter();
    const { user, employee, setEmployee } = useAuthStore();
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [types, setTypes] = useState<ComplaintTypeOpt[]>([]);
    const [typeModal, setTypeModal] = useState(false);
    
    // Form fields
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
    const [complaintType, setComplaintType] = useState('');
    const [remarks, setRemarks] = useState('');
    
    // Photo attachment states
    const [evidence, setEvidence] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [uploadLoading, setUploadLoading] = useState(false);

    const isManager = isManagementRole(user);
    const isSuperAdmin = user?.role === 'super_admin';
    const selfEmpNo = String(user?.emp_no ?? '').trim().toUpperCase();

    // Category Creation specific states
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);

    const handleSaveCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) {
            Alert.alert('Required', 'Please enter a category name.');
            return;
        }
        
        setAddingCategory(true);
        try {
            // Generate unique uppercase code
            const code = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const res = await api.addLeaveType('complaint', {
                code,
                name,
                isActive: true,
            });
            const body = res.data as ApiEnvelope;
            
            if (res.status === 201 || body.success) {
                // Refresh categories list
                const st = await api.getLeaveTypes('complaint');
                const envelope = st.data as ApiEnvelope<ComplaintTypeOpt[]>;
                if (envelope.success && Array.isArray(envelope.data)) {
                    setTypes(envelope.data.filter((t) => t.isActive !== false));
                }
                
                // Select newly created category
                setComplaintType(code);
                
                // Reset state & close modal
                setNewCategoryName('');
                setShowAddCategory(false);
                setTypeModal(false);
                Alert.alert('Success', `Category "${name}" added successfully.`);
            } else {
                Alert.alert('Failed', body.error || 'Failed to add category.');
            }
        } catch (err) {
            console.error('Error adding category:', err);
            Alert.alert('Error', 'Failed to add category due to server error.');
        } finally {
            setAddingCategory(false);
        }
    };

    // Permissions check
    const requestPhotoPermission = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Photos', 'Photo library access is required to attach evidence.');
            return false;
        }
        return true;
    };

    const requestCameraPermission = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Camera', 'Camera access is required to capture photo evidence.');
            return false;
        }
        return true;
    };

    const pickFromLibrary = async () => {
        const ok = await requestPhotoPermission();
        if (!ok) return;
        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.85,
        });
        if (!res.canceled && res.assets[0]) {
            setEvidence(res.assets[0]);
        }
    };

    const pickFromCamera = async () => {
        const ok = await requestCameraPermission();
        if (!ok) return;
        const res = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.85,
        });
        if (!res.canceled && res.assets[0]) {
            setEvidence(res.assets[0]);
        }
    };

    const removeEvidence = () => {
        setEvidence(null);
    };

    // Load initial context, employee info, and category types
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                // Resolve self employee if not set
                let emp = employee;
                if (!emp && selfEmpNo) {
                    const selfRes = await api.getEmployee(selfEmpNo);
                    const selfBody = selfRes.data as ApiEnvelope<Record<string, unknown>>;
                    if (selfBody.success && selfBody.data) {
                        emp = selfBody.data as never;
                        setEmployee(selfBody.data as never);
                    }
                }
                
                // Pre-set selected employee to self by default
                if (emp) {
                    setSelectedEmployee(emp);
                }

                // Load complaint category types
                const st = await api.getLeaveTypes('complaint');
                const envelope = st.data as ApiEnvelope<ComplaintTypeOpt[]>;
                if (envelope.success && Array.isArray(envelope.data) && envelope.data.length) {
                    setTypes(envelope.data.filter((t) => t.isActive !== false));
                } else {
                    // Fallback default categories
                    setTypes([
                        { code: 'INFRASTRUCTURE', name: 'Infrastructure & Equipment' },
                        { code: 'HARASSMENT', name: 'Workplace Harassment' },
                        { code: 'SALARY', name: 'Salary & Compensation' },
                        { code: 'LEADERSHIP', name: 'Management & Leadership' },
                        { code: 'BEHAVIOR', name: 'Interpersonal Conflict / Behavior' },
                        { code: 'OTHER', name: 'Other Grievance' },
                    ]);
                }
            } catch (err) {
                console.error('Failed to load init application details:', err);
                Alert.alert('Error', 'Failed to load complaint settings.');
            } finally {
                setLoading(false);
            }
        };
        void init();
    }, [employee, selfEmpNo, setEmployee]);

    const selectedTypeLabel = types.find((t) => t.code === complaintType)?.name || complaintType || 'Select category';

    const onSubmit = async () => {
        if (!selectedEmployee) {
            Alert.alert('Required', 'Please select an employee.');
            return;
        }
        if (!complaintType) {
            Alert.alert('Required', 'Please select a complaint category.');
            return;
        }
        if (!remarks.trim()) {
            Alert.alert('Required', 'Please fill in the remarks/details.');
            return;
        }

        setSubmitting(true);
        try {
            let imageUrl = '';
            
            // Upload evidence if present
            if (evidence?.uri) {
                setUploadLoading(true);
                const uploadRes = await api.uploadEvidence({
                    uri: evidence.uri,
                    mimeType: evidence.mimeType,
                    fileName: evidence.fileName,
                });
                setUploadLoading(false);
                
                const raw = uploadRes.data as ApiEnvelope & { url?: string; data?: { url?: string } };
                const photoUrl = raw.url || raw.data?.url;
                if (raw.success !== false && photoUrl) {
                    imageUrl = photoUrl;
                } else {
                    setSubmitting(false);
                    Alert.alert('Upload Failed', raw.message || raw.error || 'Failed to upload photo evidence.');
                    return;
                }
            }

            // Submit complaint
            const payload = {
                employeeId: selectedEmployee._id,
                empNo: selectedEmployee.emp_no,
                complaintType,
                imageUrl: imageUrl || undefined,
                remarks: remarks.trim(),
            };

            const submitRes = await api.applyComplaint(payload);
            const submitBody = submitRes.data as ApiEnvelope;
            
            if (submitRes.status === 201 && submitBody.success) {
                Alert.alert('Success', 'Grievance submitted successfully!', [
                    { text: 'OK', onPress: () => router.replace('/complaints') }
                ]);
            } else {
                Alert.alert('Failed', submitBody.error || 'Failed to submit grievance.');
            }

        } catch (error) {
            console.error('Submission error:', error);
            Alert.alert('Error', 'An unexpected error occurred during submission.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFF', '#FFF5F5', '#FFFFFF']} className="absolute inset-0" />
            
            <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
                {/* Header */}
                <View className="px-6 py-4 flex-row items-center border-b border-neutral-100 bg-white/70">
                    <TouchableOpacity
                        onPress={() => router.replace('/complaints')}
                        className="p-2 -ml-2 rounded-full active:bg-neutral-100"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="ml-2">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Application</Text>
                        <Text className="text-xl font-black text-neutral-900">New Grievance</Text>
                    </View>
                </View>

                <ApplyWriteGate allowed={canApplyComplaints(user)} moduleLabel="Complaints Application">
                    {loading ? (
                        <View className="flex-1 items-center justify-center">
                            <ActivityIndicator size="large" color="#E11D48" />
                        </View>
                    ) : (
                        <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
                            
                            {/* Target Employee selection (any user with write access can search & choose any active employee) */}
                            <SearchableEmployeeSelect
                                label="Target Employee"
                                selectedEmpNo={selectedEmployee?.emp_no || ''}
                                onSelect={(emp) => setSelectedEmployee(emp)}
                                ignoreScope={true}
                            />

                            {/* Complaint Category Dropdown Selection */}
                            <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">
                                Category / Grievance Type
                            </Text>
                            <TouchableOpacity
                                onPress={() => setTypeModal(true)}
                                className="mb-5 flex-row items-center justify-between rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3.5"
                            >
                                <Text className={`font-bold ${complaintType ? 'text-neutral-900' : 'text-neutral-400'}`}>
                                    {selectedTypeLabel}
                                </Text>
                                <ChevronDown size={18} color="#94A3B8" />
                            </TouchableOpacity>

                            {/* Remarks Text Input */}
                            <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">
                                Remarks / Details (Required)
                            </Text>
                            <TextInput
                                multiline
                                numberOfLines={6}
                                value={remarks}
                                onChangeText={setRemarks}
                                placeholder="Provide description, relevant details, dates, or other information..."
                                placeholderTextColor="#94A3B8"
                                maxLength={1000}
                                className="mb-5 rounded-2xl border-2 border-neutral-100 bg-white px-4 py-3.5 text-sm font-semibold text-neutral-800 min-h-[140px]"
                                style={{ textAlignVertical: 'top' }}
                            />

                            {/* Photo Evidence Capture (Matches OD structure) */}
                            <Text className="text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-2">
                                Attachment / Photo Evidence
                            </Text>
                            
                             {evidence ? (
                                <View className="mb-6 rounded-2xl border border-neutral-100 bg-white p-3 flex-row items-center justify-between">
                                    <View className="flex-row items-center">
                                        <Image
                                            source={{ uri: evidence.uri }}
                                            className="h-14 w-14 rounded-xl border border-neutral-100 mr-3"
                                        />
                                        <View className="max-w-[70%]">
                                            <Text className="text-xs font-black text-neutral-800" numberOfLines={1}>
                                                {evidence.fileName || 'evidence.jpg'}
                                            </Text>
                                            <Text className="text-[10px] font-bold text-neutral-400 mt-0.5">
                                                {evidence.width}x{evidence.height} · Ready to upload
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        onPress={removeEvidence}
                                        className="h-10 w-10 items-center justify-center rounded-xl bg-rose-50 border border-rose-100"
                                    >
                                        <Trash2 size={16} color="#E11D48" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View className="mb-6 flex-row gap-3">
                                    <TouchableOpacity
                                        onPress={pickFromCamera}
                                        className="flex-1 flex-row items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-4 gap-2"
                                    >
                                        <Camera size={18} color="#E11D48" strokeWidth={2.5} />
                                        <Text className="text-[10px] font-black uppercase tracking-wider text-rose-600">Take Photo</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={pickFromLibrary}
                                        className="flex-1 flex-row items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-4 gap-2"
                                    >
                                        <ImageIcon size={18} color="#E11D48" strokeWidth={2.5} />
                                        <Text className="text-[10px] font-black uppercase tracking-wider text-rose-600">Select Image</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Submit Button */}
                            <TouchableOpacity
                                onPress={onSubmit}
                                disabled={submitting || uploadLoading}
                                className="mb-12 rounded-2xl bg-rose-600 py-4 flex-row items-center justify-center"
                                style={{
                                    shadowColor: '#E11D48',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.2,
                                    shadowRadius: 6,
                                    elevation: 6
                                }}
                            >
                                {submitting || uploadLoading ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" className="mr-2" />
                                ) : null}
                                <Text className="text-center text-sm font-black uppercase tracking-widest text-white">
                                    {submitting ? 'Submitting...' : 'Submit Grievance'}
                                </Text>
                            </TouchableOpacity>

                        </ScrollView>
                    )}
                </ApplyWriteGate>

                {/* Category Selection Modal */}
                <Modal visible={typeModal} animationType="slide" transparent>
                    <View className="flex-1 justify-end bg-black/40">
                        <View className="rounded-t-[40px] bg-white max-h-[70%] pb-6">
                            <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-neutral-100">
                                <Text className="text-base font-black uppercase tracking-widest text-neutral-900">Select Category</Text>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setTypeModal(false);
                                        setShowAddCategory(false);
                                        setNewCategoryName('');
                                    }}
                                    className="p-1.5 rounded-full bg-neutral-100"
                                >
                                    <X size={18} color="#0F172A" />
                                </TouchableOpacity>
                            </View>

                             {/* Option to add a category (available to all users) */}
                             <View className="px-6 py-3 border-b border-neutral-100 bg-neutral-50/50">
                                 {showAddCategory ? (
                                     <View className="flex-row items-center gap-2">
                                         <TextInput
                                             value={newCategoryName}
                                             onChangeText={setNewCategoryName}
                                             placeholder="Enter new category name..."
                                             placeholderTextColor="#94A3B8"
                                             className="flex-1 h-11 bg-white rounded-xl px-4 text-xs font-semibold text-neutral-800 border border-neutral-200"
                                             autoFocus
                                         />
                                         <TouchableOpacity
                                             onPress={handleSaveCategory}
                                             disabled={addingCategory}
                                             className="h-11 px-4 bg-rose-600 rounded-xl items-center justify-center flex-row"
                                         >
                                             {addingCategory && <ActivityIndicator size="small" color="#FFF" className="mr-1" />}
                                             <Text className="text-white text-[10px] font-black uppercase tracking-wider">Save</Text>
                                         </TouchableOpacity>
                                         <TouchableOpacity
                                             onPress={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                                             className="h-11 px-3 bg-neutral-100 rounded-xl items-center justify-center"
                                         >
                                             <Text className="text-neutral-600 text-[10px] font-black uppercase tracking-wider">Cancel</Text>
                                         </TouchableOpacity>
                                     </View>
                                 ) : (
                                     <TouchableOpacity
                                         onPress={() => setShowAddCategory(true)}
                                         className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-rose-300 bg-rose-50/20"
                                     >
                                         <Plus size={14} color="#E11D48" strokeWidth={3} />
                                         <Text className="text-[10px] font-black uppercase tracking-wider text-rose-600">Add New Category</Text>
                                     </TouchableOpacity>
                                 )}
                             </View>
                            
                            <ScrollView className="px-6 py-2">
                                {types.map((t) => {
                                    const isSelected = t.code === complaintType;
                                    return (
                                        <TouchableOpacity
                                            key={t.code}
                                            onPress={() => {
                                                setComplaintType(t.code);
                                                setTypeModal(false);
                                            }}
                                            className="py-4 border-b border-neutral-50 flex-row items-center justify-between"
                                        >
                                            <View className="flex-1 pr-3">
                                                <Text className={`text-sm ${isSelected ? 'font-black text-rose-600' : 'font-semibold text-neutral-800'}`}>
                                                    {t.name}
                                                </Text>
                                                <Text className="text-[10px] text-neutral-400 mt-0.5 tracking-wider uppercase">{t.code}</Text>
                                            </View>
                                            {isSelected && (
                                                <View className="h-6 w-6 items-center justify-center rounded-full bg-rose-50 border border-rose-200">
                                                    <Check size={14} color="#E11D48" strokeWidth={3} />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

            </SafeAreaView>
        </View>
    );
}
