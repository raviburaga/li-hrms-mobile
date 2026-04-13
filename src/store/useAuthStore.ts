import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    profilePhoto?: string | null;
    emp_no?: string;
    employeeRef?: string;
    phone?: string;
    department?: { _id: string; name: string };
    division?: { _id: string; name: string };
    isActive?: boolean;
    is_active?: boolean;
    featureControl?: string[];
    scope?: 'global' | 'restricted';
    dataScope?: 'all' | 'department' | 'division' | 'own';
    departments?: Array<string | { _id?: string; name?: string }>;
    allowedDivisions?: Array<string | { _id?: string; name?: string }>;
}

export interface Employee {
    _id: string;
    emp_no: string;
    employee_name: string;
    joining_date?: string;
    designation?: { name: string; _id?: string };
    department?: { name: string; _id?: string };
    department_id?: string | { _id?: string; name?: string };
    division?: { name: string; _id?: string };
    division_id?: string | { _id?: string; name?: string };
    reporting_manager?: { employee_name?: string; name?: string; email?: string };
    reporting_to?: Array<{ _id?: string; name?: string; email?: string; role?: string } | string>;
    dynamicFields?: {
        reporting_to?: Array<{ _id?: string; name?: string; email?: string; role?: string } | string>;
    };
    shiftId?: { name: string; startTime: string; endTime: string };
    employment_status?: string;
    blood_group?: string;
    personal_email?: string;
    address?: string;
}

interface AuthState {
    user: User | null;
    employee: Employee | null;
    token: string | null;
    isAuthenticated: boolean;
    /** True while sign-out is clearing storage; keeps tabs from redirecting until finished. Not persisted. */
    isLoggingOut: boolean;
    setAuth: (user: User, token: string) => void;
    setEmployee: (employee: Employee | null) => void;
    logout: () => Promise<void>;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            employee: null,
            token: null,
            isAuthenticated: false,
            isLoggingOut: false,
            setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
            setEmployee: (employee) => set({ employee }),
            logout: async () => {
                set({
                    isLoggingOut: true,
                    user: null,
                    employee: null,
                    token: null,
                    isAuthenticated: false,
                });
                try {
                    useAuthStore.persist.clearStorage();
                } catch {
                    try {
                        await AsyncStorage.removeItem('auth-storage');
                    } catch {
                        /* in-memory state already cleared */
                    }
                }
                set({ isLoggingOut: false });
            },
            updateUser: (updatedUser) =>
                set((state) => ({
                    user: state.user ? { ...state.user, ...updatedUser } : null
                })),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                user: state.user,
                employee: state.employee,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
