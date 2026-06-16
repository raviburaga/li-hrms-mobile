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
    refreshToken: string | null;
    isAuthenticated: boolean;
    rememberMe: boolean;
    rememberedIdentifier: string;
    /** True while sign-out is clearing storage; keeps tabs from redirecting until finished. Not persisted. */
    isLoggingOut: boolean;
    setAuth: (
        user: User,
        token: string,
        refreshToken?: string | null,
        options?: { rememberMe?: boolean; identifier?: string }
    ) => void;
    setEmployee: (employee: Employee | null) => void;
    logout: () => Promise<void>;
    updateUser: (user: Partial<User>) => void;
    setTokens: (token: string, refreshToken?: string | null) => void;
}

let activeWritePromise: Promise<void> | null = null;

const customStorage = {
    getItem: (name: string) => AsyncStorage.getItem(name),
    setItem: (name: string, value: string) => {
        activeWritePromise = AsyncStorage.setItem(name, value);
        return activeWritePromise;
    },
    removeItem: (name: string) => {
        activeWritePromise = AsyncStorage.removeItem(name);
        return activeWritePromise;
    },
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            employee: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            rememberMe: false,
            rememberedIdentifier: '',
            isLoggingOut: false,
            setAuth: (user, token, refreshToken, options) =>
                set({
                    user,
                    token,
                    refreshToken: refreshToken || null,
                    isAuthenticated: true,
                    rememberMe: Boolean(options?.rememberMe),
                    rememberedIdentifier: options?.rememberMe ? options.identifier || '' : '',
                }),
            setEmployee: (employee) => set({ employee }),
            logout: async () => {
                const { rememberMe, rememberedIdentifier } = useAuthStore.getState();
                try {
                    const { stopOdLocationTrailBackground } = await import('../odTrail/odLocationTrailBackground');
                    await stopOdLocationTrailBackground();
                } catch {
                    /* ignore */
                }
                set({
                    isLoggingOut: true,
                    user: null,
                    employee: null,
                    token: null,
                    refreshToken: null,
                    isAuthenticated: false,
                    rememberMe,
                    rememberedIdentifier,
                });
                try {
                    if (rememberMe && rememberedIdentifier) {
                        if (activeWritePromise) {
                            await activeWritePromise;
                        }
                    } else {
                        await useAuthStore.persist.clearStorage();
                    }
                } catch {
                    try {
                        if (!rememberMe) {
                            await AsyncStorage.removeItem('auth-storage');
                        }
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
            setTokens: (token, refreshToken) =>
                set({
                    token,
                    refreshToken: refreshToken || null,
                    isAuthenticated: true,
                }),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => customStorage),
            partialize: (state) => ({
                user: state.rememberMe ? state.user : null,
                employee: state.rememberMe ? state.employee : null,
                token: state.rememberMe ? state.token : null,
                refreshToken: state.rememberMe ? state.refreshToken : null,
                isAuthenticated: state.rememberMe ? state.isAuthenticated : false,
                rememberMe: state.rememberMe,
                rememberedIdentifier: state.rememberedIdentifier,
            }),
        }
    )
);
