/**
 * Dynamic Expo config for Unit 1 / Unit 2 / Pydah flavors.
 * Static defaults live in app.json (Unit 1). Other variants are applied when
 * EXPO_PUBLIC_APP_VARIANT is set (eas.json build profiles or local env).
 *
 * @param {{ config: import('expo/config').ExpoConfig }} param0
 * @returns {import('expo/config').ExpoConfig}
 */
module.exports = ({ config }) => {
    const variant = String(process.env.EXPO_PUBLIC_APP_VARIANT || 'unit1')
        .trim()
        .toLowerCase();

    const variants = {
        unit1: {
            name: config.name,
            scheme: config.scheme,
            androidPackage: config.android?.package,
            iosBundleIdentifier: config.ios?.bundleIdentifier,
        },
        unit2: {
            name: 'LI HRMS Unit 2',
            scheme: 'li-hrms-unit2',
            androidPackage: 'com.lihrms.mobile.unit2',
            iosBundleIdentifier: 'com.lihrms.mobile.unit2',
        },
        pydah: {
            name: 'LI HRMS Pydah',
            scheme: 'li-hrms-pydah',
            androidPackage: 'com.lihrms.mobile.pydah',
            iosBundleIdentifier: 'com.lihrms.mobile.pydah',
        },
    };

    const selected = variants[variant] || variants.unit1;
    const appVariant = variants[variant] ? variant : 'unit1';

    return {
        ...config,
        name: selected.name,
        scheme: selected.scheme,
        ios: {
            ...config.ios,
            bundleIdentifier: selected.iosBundleIdentifier,
        },
        android: {
            ...config.android,
            package: selected.androidPackage,
        },
        extra: {
            ...config.extra,
            appVariant,
            eas: {
                ...(config.extra && config.extra.eas ? config.extra.eas : {}),
            },
        },
    };
};
