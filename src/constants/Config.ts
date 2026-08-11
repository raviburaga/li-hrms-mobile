import Constants from 'expo-constants';

/** Released app builds (EAS / store). */
const PRODUCTION_API_ORIGIN = 'http://192.168.5.25:5000';
/** Local backend on your machine (Expo dev, physical devices, emulators). */
const LOCAL_DEV_API_ORIGIN = 'http://192.168.5.25:5000';

/** Set in `eas.json` (e.g. development profile) so device-installed dev clients use production API. Local `npx expo start` leaves this unset → `__DEV__` picks LAN.
 * For testing on physical device: set EXPO_PUBLIC_API_ORIGIN=http://YOUR_COMPUTER_IP:5000
 */
const envApiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN?.trim().replace(/\/$/, '');

const API_ORIGIN = envApiOrigin || (__DEV__ ? LOCAL_DEV_API_ORIGIN : PRODUCTION_API_ORIGIN);

export const API_BASE_URL = `${API_ORIGIN}/api`;

export const CONFIG = {
    API_BASE_URL,
    APP_NAME: 'LI HRMS',
    APP_VERSION: Constants.expoConfig?.version || '1.0.2',
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
