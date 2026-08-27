/// <reference types="expo/types" />

declare const __DEV__: boolean;

declare const process: {
    env: {
        EXPO_PUBLIC_APP_VARIANT?: string;
        EXPO_PUBLIC_API_ORIGIN?: string;
        [key: string]: string | undefined;
    };
};
