import Constants from 'expo-constants';

export type AppVariant = 'unit1' | 'unit2' | 'pydah';

const extra = Constants.expoConfig?.extra as { appVariant?: string } | undefined;
const rawVariant = (
    process.env.EXPO_PUBLIC_APP_VARIANT ||
    extra?.appVariant ||
    'unit1'
)
    .trim()
    .toLowerCase();

function resolveAppVariant(value: string): AppVariant {
    if (value === 'unit2' || value === 'pydah') return value;
    return 'unit1';
}

/** Active app flavor. Defaults to Unit 1 so existing builds stay unchanged. */
export const APP_VARIANT: AppVariant = resolveAppVariant(rawVariant);

const VARIANT_CONFIG = {
    unit1: {
        APP_NAME: 'LI HRMS',
        /** Released app builds (EAS / store). */
        PRODUCTION_API_ORIGIN: 'https://hrmsu1.sleipl.com',
        /** Local backend on your machine (Expo dev, physical devices, emulators). */
        LOCAL_DEV_API_ORIGIN: 'https://hrmsu1.sleipl.com',
    },
    unit2: {
        APP_NAME: 'LI HRMS Unit 2',
        PRODUCTION_API_ORIGIN: 'https://hrmsu2.sleipl.com',
        LOCAL_DEV_API_ORIGIN: 'https://hrmsu2.sleipl.com',
    },
    pydah: {
        APP_NAME: 'LI HRMS Pydah',
        PRODUCTION_API_ORIGIN: 'https://hrms.pydah.edu.in',
        LOCAL_DEV_API_ORIGIN: 'https://hrms.pydah.edu.in',
    },
} as const;

const variantConfig = VARIANT_CONFIG[APP_VARIANT];

/**
 * Set in `eas.json` (e.g. development profile) so device-installed dev clients use production API. Local `npx expo start` leaves this unset → `__DEV__` picks LAN.
 * For testing on physical device: set EXPO_PUBLIC_API_ORIGIN=http://YOUR_COMPUTER_IP:5000
 */
const envApiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN?.trim().replace(/\/$/, '');

const API_ORIGIN =
    envApiOrigin || (__DEV__ ? variantConfig.LOCAL_DEV_API_ORIGIN : variantConfig.PRODUCTION_API_ORIGIN);

export const API_BASE_URL = `${API_ORIGIN}/api`;

export const CONFIG = {
    API_BASE_URL,
    APP_NAME: variantConfig.APP_NAME,
    APP_VERSION: Constants.expoConfig?.version || '1.0.2',
    APP_VARIANT,
};

// Edit this list for each release. Only these points are shown in the "What's New" dialog.
export const RELEASE_NOTES: string[] = [
    'Ravi Buraga',
    'Adjusted the floating support ticket button position to prevent layout overlap with the bottom tab navigation bar.',
    'Enabled dynamic OTA updates delivered directly via update channels.',
    'Improved app stability and smoother navigation experience.',
    'Added new feature to allow users to update their profile information.',
    'Fixed bug in the login process.',
    'Improved the performance of the app.',
];
