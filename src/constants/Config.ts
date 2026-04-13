import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Use the local IP address for physical device testing, or localhost for simulator
// eas update --branch preview --message "Test home update prompt flow"  // this command is for pushing updates to the application
// Replace with your machine's IP (e.g., '192.168.1.5') to test on a real phone s://hrms-api.raviburaga.shop
const LOCALHOST = Platform.OS === 'android' ? ' https://hrms-api.raviburaga.shop' : 'localhost';

export const API_BASE_URL = `${LOCALHOST}/api`;

export const CONFIG = {
    API_BASE_URL,
    APP_NAME: 'LI HRMS',
    APP_VERSION: Constants.expoConfig?.version || '1.0.1',
};

// Edit this list for each release. Only these points are shown in the "What's New" dialog.
export const RELEASE_NOTES: string[] = [
    'Ravi Buraga',
    'Improved app stability and smoother navigation experience.',
    'Added new feature to allow users to update their profile information.',
    'Fixed bug in the login process.',
    'Improved the performance of the app.',
    'Added new feature to allow users to update their profile information.',
    'Fixed bug in the login process.',
    'Improved the performance of the app.',
    'Added new feature to allow users to update their profile information.',
    'Fixed bug in the login process.',
    'Improved the performance of the app.',
];
