import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    Image,
    Linking,
    Platform,
    ActivityIndicator,
    AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ChevronLeft, Calendar, Clock, MapPin, ExternalLink, Camera, Image as ImageIcon } from 'lucide-react-native';
import { api, ApiEnvelope } from '../../src/api/client';
import { ApprovalTimeline, type TimelineStep } from '../../src/components/ApprovalTimeline';
import { formatDateRangeIST, formatDateTimeIST } from '../../src/utils/dateIST';
import { useAuthStore } from '../../src/store/useAuthStore';
import { canActionLeaves, canOdUploadFromDevice, isManagementRole } from '../../src/lib/permissions';
import { canCurrentUserActOnLeaveLikeItem } from '../../src/utils/workflowPermissions';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { EmployeeMetaCard } from '../../src/components/EmployeeMetaCard';
import {
    startOdLocationTrailBackground,
    stopOdLocationTrailBackground,
} from '../../src/odTrail/odLocationTrailBackground';
import { canRecordOdLocationTrail, hasOdInEvidenceSubmitted } from '../../src/odTrail/odTrailEligibility';
import { markOdTrackingActive } from '../../src/notifications/pushRegistration';
import {
    clearActiveOdTrailId,
    clearOdTrailQueue,
    enqueueOdTrailPoints,
    syncPendingOdTrailPoints,
} from '../../src/odTrail/odTrailQueue';
import { enqueueOdOutSubmission } from '../../src/odTrail/odTrailQueue';
import NetInfo from '@react-native-community/netinfo';

type ChainStep = TimelineStep;

function googleMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
}

function openMaps(lat: number, lng: number) {
    const url = googleMapsUrl(lat, lng);
    Linking.openURL(url).catch(() => {
        Alert.alert('Maps', 'Could not open maps.');
    });
}

function parseGeoFields(geo: unknown): {
    latitude: number;
    longitude: number;
    address?: string;
    capturedAt?: string;
} | null {
    if (!geo || typeof geo !== 'object') return null;
    const g = geo as { latitude?: number | string; longitude?: number | string; address?: string; capturedAt?: string };
    const lat = Number(g.latitude);
    const lng = Number(g.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        latitude: lat,
        longitude: lng,
        address: g.address,
        capturedAt: g.capturedAt != null ? String(g.capturedAt) : undefined,
    };
}

/** OD IN location: startEvidence (preferred) or legacy top-level geoLocation */
function parseOdInGeo(row: Record<string, unknown> | null): ReturnType<typeof parseGeoFields> | null {
    if (!row) return null;
    const start = row.startEvidence as { geoLocation?: unknown } | undefined;
    const fromStart = parseGeoFields(start?.geoLocation);
    if (fromStart) return fromStart;
    return parseGeoFields(row.geoLocation);
}

/** OD OUT location from endEvidence only */
function parseOdOutGeo(row: Record<string, unknown> | null): ReturnType<typeof parseGeoFields> | null {
    if (!row) return null;
    const end = row.endEvidence as { geoLocation?: unknown } | undefined;
    return parseGeoFields(end?.geoLocation);
}

/** Fallback EXIF from legacy photoEvidence when no GPS stored */
function parseExifGeo(row: Record<string, unknown> | null): { latitude: number; longitude: number; source: 'exif' } | null {
    if (!row) return null;
    const photo = row.photoEvidence as { exifLocation?: { latitude?: number | string; longitude?: number | string } } | undefined;
    const exif = photo?.exifLocation;
    if (exif != null) {
        const lat = Number(exif.latitude);
        const lng = Number(exif.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { latitude: lat, longitude: lng, source: 'exif' };
        }
    }
    return null;
}

function canSubmitOdOut(
    od: Record<string, unknown> | null,
    user: { _id?: string; id?: string; role?: string; employeeRef?: string; employeeId?: string; emp_no?: string } | null
): boolean {
    if (!od || !user) return false;
    if (String(od.status) !== 'draft') return false;
    const end = od.endEvidence as { submittedAt?: unknown } | undefined;
    if (end?.submittedAt) return false;

    const role = String(user.role || '');
    if (['super_admin', 'sub_admin', 'hr', 'manager', 'hod'].includes(role)) return true;

    const userId = String(user._id || user.id || '').trim();
    const appliedById = String((od.appliedBy as { _id?: string } | undefined)?._id || od.appliedBy || '').trim();
    if (userId && appliedById && userId === appliedById) return true;

    const userEmpRef = String(user.employeeRef || '').trim();
    const odEmpId = String((od.employeeId as { _id?: string } | undefined)?._id || od.employeeId || '').trim();
    if (userEmpRef && odEmpId && userEmpRef === odEmpId) return true;

    const userEmpNo = String(user.employeeId || user.emp_no || '').trim().toLowerCase();
    const odEmpNo = String(od.emp_no || (od.employeeId as { emp_no?: string } | undefined)?.emp_no || '').trim().toLowerCase();
    if (userEmpNo && odEmpNo && userEmpNo === odEmpNo) return true;

    return false;
}

function statusBadge(status: string): { wrap: string; text: string } {
    const s = (status || '').toLowerCase();
    if (s === 'draft') return { wrap: 'bg-violet-100', text: 'text-violet-900' };
    if (s.includes('approv')) return { wrap: 'bg-emerald-100', text: 'text-emerald-800' };
    if (s.includes('reject')) return { wrap: 'bg-rose-100', text: 'text-rose-800' };
    if (s.includes('pending') || s.includes('progress')) return { wrap: 'bg-amber-100', text: 'text-amber-900' };
    return { wrap: 'bg-neutral-100', text: 'text-neutral-700' };
}

function nodeName(v: unknown): string {
    if (!v) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name?: unknown }).name || '—');
    return '—';
}

export default function ODDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [row, setRow] = useState<Record<string, unknown> | null>(null);
    const [allowHigherAuthority, setAllowHigherAuthority] = useState(false);
    const [outEvidence, setOutEvidence] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [outEvidenceFromDeviceFile, setOutEvidenceFromDeviceFile] = useState(false);
    const canUploadOdFromDevice = canOdUploadFromDevice(user);
    const [outLocationData, setOutLocationData] = useState<{
        latitude: number;
        longitude: number;
        address?: string;
        capturedAt: string;
    } | null>(null);
    const [locatingOut, setLocatingOut] = useState(false);
    const [submittingOut, setSubmittingOut] = useState(false);
    const [trailUsesBackground, setTrailUsesBackground] = useState(false);
    const rowRef = useRef(row);
    rowRef.current = row;
    const userRef = useRef(user);
    userRef.current = user;
    const trailBgActiveRef = useRef(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [res, settingsRes] = await Promise.all([
                api.getOD(String(id)),
                api.getLeaveSettings('od'),
            ]);
            const body = res.data as ApiEnvelope & Record<string, unknown>;
            if (body.success && body.data) setRow(body.data as Record<string, unknown>);
            else Alert.alert('Error', (body.message as string) || 'Could not load OD');
            const settingsBody = settingsRes.data as ApiEnvelope<Record<string, unknown>>;
            const wf = (settingsBody.data as { workflow?: { allowHigherAuthorityToApproveLowerLevels?: boolean } } | undefined)?.workflow;
            setAllowHigherAuthority(!!wf?.allowHigherAuthorityToApproveLowerLevels);
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        trailBgActiveRef.current = false;
        if (!id || !row || !canRecordOdLocationTrail(row, user)) {
            setTrailUsesBackground(false);
            void stopOdLocationTrailBackground();
            return undefined;
        }

        const odId = String(id);
        let cancelled = false;
        let sub: Location.LocationSubscription | null = null;
        let interval: ReturnType<typeof setInterval> | null = null;

        const fgBuffer: Array<{ latitude: number; longitude: number; capturedAt: string; accuracy?: number }> = [];
        let fgLastLat: number | null = null;
        let fgLastLng: number | null = null;
        let fgLastSend = 0;

        const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371000;
            const toRad = (d: number) => (d * Math.PI) / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
        };

        const flushFg = async () => {
            if (fgBuffer.length === 0) return;
            const chunk = fgBuffer.splice(0, fgBuffer.length);
            try {
                await enqueueOdTrailPoints(odId, chunk);
                await syncPendingOdTrailPoints();
                setRow((prev) => {
                    if (!prev) return prev;
                    const merged = [
                        ...(Array.isArray((prev as { locationTrail?: unknown[] }).locationTrail)
                            ? (prev as { locationTrail: unknown[] }).locationTrail
                            : []),
                        ...chunk,
                    ];
                    return { ...prev, locationTrail: merged };
                });
            } catch {
                /* ignore */
            }
        };

        const startFgWatch = async () => {
            const { status: perm } = await Location.requestForegroundPermissionsAsync();
            if (cancelled || perm !== 'granted') return;
            try {
                const watcher = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        distanceInterval: 35,
                        timeInterval: 45000,
                    },
                    (location) => {
                        const lat = location.coords.latitude;
                        const lng = location.coords.longitude;
                        const now = Date.now();
                        let push = fgLastLat == null;
                        const previousLat = fgLastLat;
                        const previousLng = fgLastLng;
                        if (!push && previousLat != null && previousLng != null) {
                            const dist = haversineM(previousLat, previousLng, lat, lng);
                            if (dist >= 35 || now - fgLastSend >= 50000) push = true;
                        }
                        if (!push) return;
                        fgLastLat = lat;
                        fgLastLng = lng;
                        fgLastSend = now;
                        fgBuffer.push({
                            latitude: lat,
                            longitude: lng,
                            capturedAt: new Date().toISOString(),
                            accuracy: location.coords.accuracy ?? undefined,
                        });
                        if (fgBuffer.length >= 18) void flushFg();
                    }
                );
                if (cancelled) {
                    watcher.remove();
                    return;
                }
                sub = watcher;
            } catch {
                /* watch failed */
            }
        };

        const run = async () => {
            let bg = false;
            try {
                bg = await startOdLocationTrailBackground(odId);
            } catch {
                bg = false;
            }
            if (cancelled) {
                await stopOdLocationTrailBackground();
                setTrailUsesBackground(false);
                return;
            }
            trailBgActiveRef.current = bg;
            setTrailUsesBackground(bg);
            if (bg) {
                interval = setInterval(() => {
                    if (!cancelled) void load();
                }, 60000);
            } else {
                await markOdTrackingActive(odId);
                interval = setInterval(() => void flushFg(), 40000);
                await startFgWatch();
            }
        };

        void run();

        const appSub = AppState.addEventListener('change', (s) => {
            if (s === 'active' && !cancelled) void load();
        });

        return () => {
            cancelled = true;
            sub?.remove();
            if (interval) clearInterval(interval);
            appSub.remove();
            void flushFg();
            const r = rowRef.current;
            const stillEligible =
                !!r &&
                canRecordOdLocationTrail(r as Record<string, unknown>, userRef.current) &&
                String((r as { _id?: string })._id || odId) === odId;
            if (!stillEligible || !trailBgActiveRef.current) {
                void stopOdLocationTrailBackground();
            }
            setTrailUsesBackground(false);
        };
    }, [
        id,
        row?.status,
        Boolean((row?.endEvidence as { submittedAt?: unknown } | undefined)?.submittedAt),
        hasOdInEvidenceSubmitted(row),
        user?.id,
        user?.employeeRef,
        user?.emp_no,
        user?.email,
        (user as { employeeId?: string } | null)?.employeeId,
        load,
    ]);

    const trailPointCount = useMemo(() => {
        const t = row?.locationTrail;
        if (!Array.isArray(t)) return 0;
        return t.filter((p: unknown) => {
            if (!p || typeof p !== 'object') return false;
            const o = p as { latitude?: number; longitude?: number };
            return Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude));
        }).length;
    }, [row?.locationTrail]);

    const status = String(row?.status ?? '');
    const statusDisplay =
        status === 'draft'
            ? 'Draft · add OD OUT'
            : status.replace(/_/g, ' ') || '—';
    const canCancel = ['draft', 'pending', 'hod_approved'].includes(status);
    const canApproveReject =
        status !== 'draft' &&
        canActionLeaves(user) &&
        !['approved', 'rejected', 'cancelled'].includes(status) &&
        canCurrentUserActOnLeaveLikeItem({
            item: row as unknown as { status?: string; workflow?: { [k: string]: unknown }; odType?: string },
            user,
            isOD: true,
            allowHigherAuthority,
        });
    const showEmployeeMeta = isManagementRole(user);
    const emp = row?.employeeId as
        | {
              emp_no?: string;
              employee_name?: string;
              first_name?: string;
              last_name?: string;
              designation?: unknown;
              designation_id?: unknown;
              department?: unknown;
              department_id?: unknown;
              division?: unknown;
              division_id?: unknown;
          }
        | undefined;
    const empName = String(emp?.employee_name || [emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || '—');
    const empNo = String(emp?.emp_no || row?.emp_no || '—');
    const desig = nodeName(emp?.designation || emp?.designation_id || (row as Record<string, unknown> | null)?.designation);
    const dep = nodeName(emp?.department || emp?.department_id || (row as Record<string, unknown> | null)?.department);
    const div = nodeName(emp?.division || emp?.division_id || (row as Record<string, unknown> | null)?.division);

    const chain = ((row?.workflow as { approvalChain?: ChainStep[] } | undefined)?.approvalChain ||
        []) as ChainStep[];

    const startPhoto = (row?.startEvidence as { photoEvidence?: { url?: string } } | undefined)?.photoEvidence;
    const legacyPhoto = row?.photoEvidence as { url?: string } | undefined;
    const photoUrlIn = startPhoto?.url || legacyPhoto?.url;
    const endPhoto = (row?.endEvidence as { photoEvidence?: { url?: string } } | undefined)?.photoEvidence;
    const photoUrlOut = endPhoto?.url;

    const geoIn = parseOdInGeo(row);
    const geoOut = parseOdOutGeo(row);
    const exifFallback = !geoIn ? parseExifGeo(row) : null;

    const showOutForm = canSubmitOdOut(row, user);
    const evidenceMinutes = row?.evidenceDurationMinutes;

    const requestPhotoPermission = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        return status === 'granted';
    };

    const requestCameraPermission = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        return status === 'granted';
    };

    const pickOutFromLibrary = async () => {
        const ok = await requestPhotoPermission();
        if (!ok) {
            Alert.alert('Photos', 'Allow photo library access to attach OD OUT evidence.');
            return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.85,
        });
        if (!res.canceled && res.assets[0]) {
            setOutEvidence(res.assets[0]);
            setOutEvidenceFromDeviceFile(true);
        }
    };

    const pickOutFromCamera = async () => {
        const ok = await requestCameraPermission();
        if (!ok) {
            Alert.alert('Camera', 'Allow camera access to capture OD OUT evidence.');
            return;
        }
        const res = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.85 });
        if (!res.canceled && res.assets[0]) {
            setOutEvidence(res.assets[0]);
            setOutEvidenceFromDeviceFile(false);
        }
    };

    const captureOutLocation = async () => {
        setLocatingOut(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Location', 'Location permission is required for OD OUT.');
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = pos.coords;
            let address = '';
            try {
                const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
                const r = rev[0];
                if (r) {
                    address = [r.name, r.street, r.district, r.city, r.region, r.postalCode].filter(Boolean).join(', ');
                }
            } catch {
                /* optional */
            }
            setOutLocationData({
                latitude,
                longitude,
                address: address || undefined,
                capturedAt: new Date().toISOString(),
            });
        } catch (e) {
            Alert.alert('Location', e instanceof Error ? e.message : 'Could not read your location.');
        } finally {
            setLocatingOut(false);
        }
    };

    const onSubmitOdOut = () => {
        if (!outEvidence?.uri || !outLocationData) {
            Alert.alert('OD OUT', 'Photo and GPS location are required for OD OUT.');
            return;
        }
        Alert.alert('Submit OD OUT', 'This sends the request for approval (draft → pending). Continue?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Submit',
                onPress: async () => {
                    setSubmittingOut(true);
                    try {
                        await stopOdLocationTrailBackground();
                        const trailSync = await syncPendingOdTrailPoints();
                        if (!trailSync.success) {
                            Alert.alert(
                                'Offline trail pending',
                                `Connect to the internet before submitting OD OUT. ${trailSync.remaining} route point(s) are still waiting to upload.`
                            );
                            if (canRecordOdLocationTrail(row, user)) await startOdLocationTrailBackground(String(id));
                            return;
                        }
                        // Check network first
                        const net = await NetInfo.fetch();
                        if (!net.isConnected || net.isInternetReachable === false) {
                            // Offer to save offline
                            Alert.alert('Offline', 'No internet connection. Save OD OUT and upload later?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Save offline',
                                    onPress: async () => {
                                        try {
                                            await enqueueOdOutSubmission(String(id), {
                                                photoUri: outEvidence.uri,
                                                photoMime: outEvidence.mimeType || null,
                                                photoName: outEvidence.fileName || null,
                                                latitude: outLocationData.latitude,
                                                longitude: outLocationData.longitude,
                                                capturedAt: outLocationData.capturedAt,
                                                notes: null,
                                                owner: user?.id || null,
                                            });
                                            Alert.alert('Saved', 'OD OUT saved and will be uploaded when online.');
                                            setOutEvidence(null);
                                            setOutLocationData(null);
                                        } catch (e) {
                                            Alert.alert('Error', e instanceof Error ? e.message : 'Could not save offline');
                                        }
                                    },
                                },
                            ]);
                            return;
                        }

                        const uploadRes = await api.uploadEvidence({
                            uri: outEvidence.uri,
                            mimeType: outEvidence.mimeType,
                            fileName: outEvidence.fileName,
                        });
                        const raw = uploadRes.data as ApiEnvelope & {
                            url?: string;
                            key?: string;
                            data?: { url?: string; key?: string };
                        };
                        const photoUrl = raw.url || raw.data?.url;
                        const photoKey = raw.key || raw.data?.key;
                        if (raw.success === false || !photoUrl) {
                            // Offer to save offline on upload failure
                            Alert.alert('Upload failed', raw.message || raw.error || 'Could not upload photo. Save offline?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Save offline',
                                    onPress: async () => {
                                        try {
                                            await enqueueOdOutSubmission(String(id), {
                                                photoUri: outEvidence.uri,
                                                photoMime: outEvidence.mimeType || null,
                                                photoName: outEvidence.fileName || null,
                                                latitude: outLocationData.latitude,
                                                longitude: outLocationData.longitude,
                                                capturedAt: outLocationData.capturedAt,
                                                notes: null,
                                                owner: user?.id || null,
                                            });
                                            Alert.alert('Saved', 'OD OUT saved and will be uploaded when online.');
                                            setOutEvidence(null);
                                            setOutLocationData(null);
                                        } catch (e) {
                                            Alert.alert('Error', e instanceof Error ? e.message : 'Could not save offline');
                                        }
                                    },
                                },
                            ]);
                            return;
                        }
                        const endEvidence = {
                            photoEvidence: { url: photoUrl, key: photoKey },
                            geoLocation: {
                                latitude: outLocationData.latitude,
                                longitude: outLocationData.longitude,
                                capturedAt: outLocationData.capturedAt,
                                address: outLocationData.address || '',
                            },
                            submittedAt: new Date().toISOString(),
                            photoFromDeviceFile: outEvidenceFromDeviceFile,
                        };
                        const res = await api.updateOD(String(id), { endEvidence });
                        const body = res.data as ApiEnvelope;
                        if (body.success) {
                            await stopOdLocationTrailBackground();
                            setTrailUsesBackground(false);
                            Alert.alert('Done', 'OD OUT submitted. Request is now pending approval.');
                            setOutEvidence(null);
                            setOutLocationData(null);
                            setOutEvidenceFromDeviceFile(false);
                            await load();
                        } else {
                            Alert.alert('Failed', body.message || body.error || 'Could not submit OD OUT');
                            if (canRecordOdLocationTrail(row, user)) await startOdLocationTrailBackground(String(id));
                        }
                    } catch (e) {
                        Alert.alert('Error', e instanceof Error ? e.message : 'Network error');
                        if (canRecordOdLocationTrail(row, user)) await startOdLocationTrailBackground(String(id));
                    } finally {
                        setSubmittingOut(false);
                    }
                },
            },
        ]);
    };

    const onCancel = () => {
        Alert.alert('Withdraw application', 'Cancel this on-duty request?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Withdraw',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const res = await api.cancelOD(String(id));
                        const body = res.data as ApiEnvelope;
                        if (body.success) {
                            await stopOdLocationTrailBackground();
                            await clearOdTrailQueue(String(id));
                            await clearActiveOdTrailId();
                            setTrailUsesBackground(false);
                            Alert.alert('Done', 'OD request withdrawn.');
                            router.back();
                        } else Alert.alert('Failed', body.message || body.error || 'Try again');
                    } catch {
                        Alert.alert('Error', 'Network error');
                    }
                },
            },
        ]);
    };

    const onAction = (action: 'approve' | 'reject') => {
        Alert.alert(
            action === 'approve' ? 'Approve OD' : 'Reject OD',
            `Are you sure you want to ${action} this request?`,
            [
                { text: 'No', style: 'cancel' },
                {
                    text: action === 'approve' ? 'Approve' : 'Reject',
                    style: action === 'approve' ? 'default' : 'destructive',
                    onPress: async () => {
                        try {
                            const res = await api.processODAction(String(id), action);
                            const body = res.data as ApiEnvelope;
                            if (!body.success) throw new Error(body.message || body.error || 'Could not process action');
                            await load();
                        } catch (e) {
                            Alert.alert('Action failed', e instanceof Error ? e.message : 'Could not process action');
                        }
                    },
                },
            ]
        );
    };

    const b = statusBadge(status);
    const dateRangeLabel = formatDateRangeIST(row?.fromDate, row?.toDate);
    const appliedLabel = row?.appliedAt ? formatDateTimeIST(row.appliedAt) : '';

    return (
        <View className="flex-1 bg-white">
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFE', '#F7FEE7', '#FFFFFF']} className="absolute inset-0" />
            <SafeAreaView className="flex-1">
                <View className="flex-row items-center px-6 pt-2 pb-4">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-12 h-12 rounded-2xl bg-white border-2 border-neutral-100 items-center justify-center mr-3"
                    >
                        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest">On duty</Text>
                        <Text className="text-neutral-900 text-xl font-black">Details</Text>
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 px-6 pt-6">
                        <SkeletonBlock height={24} width="30%" />
                        <SkeletonBlock height={48} width="45%" style={{ marginTop: 12 }} />
                        <SkeletonBlock height={180} style={{ marginTop: 14 }} radius={20} />
                        <SkeletonBlock height={220} style={{ marginTop: 14 }} radius={20} />
                        <SkeletonBlock height={56} style={{ marginTop: 14 }} radius={16} />
                    </View>
                ) : !row ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <Text className="text-neutral-500 text-center font-medium">No data.</Text>
                    </View>
                ) : (
                    <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                        {chain.length > 0 ? <ApprovalTimeline steps={chain} title="OD approval progress" /> : null}

                        <View className={`self-start px-3 py-1 rounded-full mb-4 ${b.wrap}`}>
                            <Text className={`text-xs font-black uppercase tracking-wide ${b.text}`}>{statusDisplay}</Text>
                        </View>

                        {status === 'draft' ? (
                            <View className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                                <Text className="text-[10px] font-black uppercase tracking-widest text-violet-800">Next step</Text>
                                <Text className="mt-1 text-sm font-medium leading-5 text-violet-900">
                                    Submit OD OUT photo and location below to send this request for approval.
                                </Text>
                                {canRecordOdLocationTrail(row, user) ? (
                                    <Text className="mt-2 text-[11px] font-medium leading-4 text-violet-800/90">
                                        {trailUsesBackground
                                            ? `Your route is recorded in the background until OD OUT (Android shows a notification). Open this screen again to refresh point counts${
                                                  trailPointCount > 0 ? ` — ${trailPointCount} GPS points loaded` : ''
                                              }.`
                                            : `Your route is recorded while this screen stays open (allow “Always” location for background recording)${
                                                  trailPointCount > 0 ? ` — ${trailPointCount} GPS points so far` : ''
                                              }.`}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        <View className="bg-white rounded-[28px] border-2 border-neutral-100 p-5 mb-4 shadow-sm">
                            <Text className="text-neutral-900 font-black text-lg">{String(row.odType ?? 'OD')}</Text>
                            <Text className="text-neutral-500 text-sm mt-1 font-medium">
                                Mode: {String(row.odType_extended ?? 'full_day').replace(/_/g, ' ')}
                            </Text>
                            {row.odType_extended === 'hours' && (row.odStartTime || row.odEndTime) ? (
                                <Text className="text-neutral-600 text-sm mt-2">
                                    {String(row.odStartTime)} – {String(row.odEndTime)}
                                    {row.durationHours != null ? ` (${row.durationHours}h)` : ''}
                                </Text>
                            ) : null}
                            <View className="flex-row items-center mt-3 gap-2 flex-wrap">
                                <Calendar size={16} color="#64748B" />
                                <Text className="text-neutral-600 font-bold">{dateRangeLabel}</Text>
                            </View>
                            <Text className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider mt-1">Dates shown in IST</Text>
                            <View className="flex-row items-center mt-2 gap-2">
                                <Clock size={16} color="#64748B" />
                                <Text className="text-neutral-600 font-medium">
                                    {Number(row.numberOfDays ?? 0)} day(s)
                                    {row.isHalfDay ? ` · Half: ${String(row.halfDayType ?? '').replace('_', ' ')}` : ''}
                                </Text>
                            </View>
                            {row.placeVisited ? (
                                <View className="flex-row items-start mt-3 gap-2">
                                    <MapPin size={16} color="#64748B" />
                                    <Text className="text-neutral-700 flex-1 font-medium">{String(row.placeVisited)}</Text>
                                </View>
                            ) : null}
                        </View>
                        {showEmployeeMeta ? (
                            <EmployeeMetaCard
                                empNo={empNo}
                                empName={empName}
                                designation={desig}
                                division={div}
                                department={dep}
                            />
                        ) : null}

                        {(photoUrlIn || geoIn || exifFallback || photoUrlOut || geoOut) ? (
                            <View className="mb-4 rounded-[28px] border-2 border-neutral-100 bg-neutral-50/80 p-4">
                                <Text className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                    Evidence & locations
                                </Text>

                                {photoUrlIn ? (
                                    <View className="mb-4 overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                                        <Text className="px-4 pt-3 pb-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                            OD IN · Photo
                                        </Text>
                                        <Image
                                            source={{ uri: photoUrlIn }}
                                            style={{ width: '100%', height: 220 }}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ) : null}

                                {(geoIn || exifFallback) ? (
                                    <View className="mb-4 rounded-2xl border border-emerald-100 bg-white p-4">
                                        <View className="mb-2 flex-row items-center gap-2">
                                            <MapPin size={18} color="#059669" strokeWidth={2.5} />
                                            <Text className="text-xs font-black uppercase tracking-widest text-emerald-800">
                                                OD IN · {geoIn ? 'GPS' : 'Location (photo EXIF)'}
                                            </Text>
                                        </View>
                                        {(() => {
                                            const g = geoIn || exifFallback;
                                            if (!g) return null;
                                            return (
                                                <>
                                                    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                                                        <Text className="text-xs text-neutral-600">
                                                            <Text className="font-bold text-neutral-400">Lat: </Text>
                                                            <Text className="font-mono">{g.latitude.toFixed(6)}</Text>
                                                        </Text>
                                                        <Text className="text-xs text-neutral-600">
                                                            <Text className="font-bold text-neutral-400">Lon: </Text>
                                                            <Text className="font-mono">{g.longitude.toFixed(6)}</Text>
                                                        </Text>
                                                    </View>
                                                    {'address' in g && g.address ? (
                                                        <View className="mt-3 border-t border-neutral-100 pt-3">
                                                            <Text className="text-[10px] font-bold uppercase text-neutral-400">Address</Text>
                                                            <Text className="mt-1 text-xs font-medium leading-5 text-neutral-700">{g.address}</Text>
                                                        </View>
                                                    ) : null}
                                                    {'capturedAt' in g && g.capturedAt ? (
                                                        <Text className="mt-2 text-[10px] text-neutral-500">
                                                            Captured (IST): {formatDateTimeIST(g.capturedAt)}
                                                        </Text>
                                                    ) : null}
                                                    <TouchableOpacity
                                                        onPress={() => openMaps(g.latitude, g.longitude)}
                                                        className="mt-3 flex-row items-center justify-center rounded-xl bg-blue-50 py-3"
                                                    >
                                                        <ExternalLink size={16} color="#2563eb" strokeWidth={2.5} />
                                                        <Text className="ml-2 text-[10px] font-black uppercase tracking-wider text-blue-600">
                                                            IN · Google Maps
                                                        </Text>
                                                    </TouchableOpacity>
                                                    {Platform.OS === 'ios' ? (
                                                        <TouchableOpacity
                                                            onPress={() => {
                                                                Linking.openURL(
                                                                    `http://maps.apple.com/?ll=${g.latitude},${g.longitude}&q=OD+IN`
                                                                ).catch(() => Alert.alert('Maps', 'Could not open Apple Maps.'));
                                                            }}
                                                            className="mt-2 flex-row items-center justify-center rounded-xl border border-neutral-200 py-2.5"
                                                        >
                                                            <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-700">
                                                                IN · Apple Maps
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </>
                                            );
                                        })()}
                                    </View>
                                ) : photoUrlIn && !geoIn && !exifFallback ? (
                                    <Text className="mb-4 text-xs text-neutral-500">No GPS coordinates for OD IN.</Text>
                                ) : null}

                                {photoUrlOut ? (
                                    <View className="mb-4 overflow-hidden rounded-2xl border border-blue-100 bg-white">
                                        <Text className="px-4 pt-3 pb-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
                                            OD OUT · Photo
                                        </Text>
                                        <Image
                                            source={{ uri: photoUrlOut }}
                                            style={{ width: '100%', height: 220 }}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ) : null}

                                {geoOut ? (
                                    <View className="rounded-2xl border border-blue-100 bg-white p-4">
                                        <View className="mb-2 flex-row items-center gap-2">
                                            <MapPin size={18} color="#2563eb" strokeWidth={2.5} />
                                            <Text className="text-xs font-black uppercase tracking-widest text-blue-800">OD OUT · GPS</Text>
                                        </View>
                                        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                                            <Text className="text-xs text-neutral-600">
                                                <Text className="font-bold text-neutral-400">Lat: </Text>
                                                <Text className="font-mono">{geoOut.latitude.toFixed(6)}</Text>
                                            </Text>
                                            <Text className="text-xs text-neutral-600">
                                                <Text className="font-bold text-neutral-400">Lon: </Text>
                                                <Text className="font-mono">{geoOut.longitude.toFixed(6)}</Text>
                                            </Text>
                                        </View>
                                        {geoOut.address ? (
                                            <View className="mt-3 border-t border-neutral-100 pt-3">
                                                <Text className="text-[10px] font-bold uppercase text-neutral-400">Address</Text>
                                                <Text className="mt-1 text-xs font-medium leading-5 text-neutral-700">{geoOut.address}</Text>
                                            </View>
                                        ) : null}
                                        {geoOut.capturedAt ? (
                                            <Text className="mt-2 text-[10px] text-neutral-500">
                                                Captured (IST): {formatDateTimeIST(geoOut.capturedAt)}
                                            </Text>
                                        ) : null}
                                        <TouchableOpacity
                                            onPress={() => openMaps(geoOut.latitude, geoOut.longitude)}
                                            className="mt-3 flex-row items-center justify-center rounded-xl bg-blue-50 py-3"
                                        >
                                            <ExternalLink size={16} color="#2563eb" strokeWidth={2.5} />
                                            <Text className="ml-2 text-[10px] font-black uppercase tracking-wider text-blue-600">
                                                OUT · Google Maps
                                            </Text>
                                        </TouchableOpacity>
                                        {Platform.OS === 'ios' ? (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    Linking.openURL(
                                                        `http://maps.apple.com/?ll=${geoOut.latitude},${geoOut.longitude}&q=OD+OUT`
                                                    ).catch(() => Alert.alert('Maps', 'Could not open Apple Maps.'));
                                                }}
                                                className="mt-2 flex-row items-center justify-center rounded-xl border border-neutral-200 py-2.5"
                                            >
                                                <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-700">
                                                    OUT · Apple Maps
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                ) : null}

                                {evidenceMinutes != null && Number(evidenceMinutes) >= 0 ? (
                                    <Text className="mt-3 text-xs font-medium text-neutral-600">
                                        Time between IN and OUT submissions: {Number(evidenceMinutes)} min
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {showOutForm ? (
                            <View className="mb-6 rounded-[28px] border-2 border-violet-200 bg-white p-5">
                                <Text className="text-neutral-900 font-black text-lg">Submit OD OUT</Text>
                                <Text className="mt-1 text-sm text-neutral-600 leading-5">
                                    Upload a closing photo and capture your location (same flow as workspace web).
                                </Text>
                                <View className="mt-4 flex-row gap-3">
                                    {canUploadOdFromDevice ? (
                                        <TouchableOpacity
                                            onPress={pickOutFromLibrary}
                                            className="flex-1 flex-row items-center justify-center rounded-2xl border-2 border-neutral-200 bg-neutral-50 py-3"
                                        >
                                            <ImageIcon size={18} color="#0F172A" strokeWidth={2.5} />
                                            <Text className="ml-2 text-xs font-black text-neutral-800">Gallery</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                    <TouchableOpacity
                                        onPress={pickOutFromCamera}
                                        className={`${canUploadOdFromDevice ? 'flex-1' : 'w-full'} flex-row items-center justify-center rounded-2xl border-2 border-neutral-200 bg-neutral-50 py-3`}
                                    >
                                        <Camera size={18} color="#0F172A" strokeWidth={2.5} />
                                        <Text className="ml-2 text-xs font-black text-neutral-800">Camera</Text>
                                    </TouchableOpacity>
                                </View>
                                {!canUploadOdFromDevice ? (
                                    <Text className="mt-2 text-xs font-medium text-neutral-500">
                                        Gallery upload is disabled for your account. Use camera capture for OD OUT evidence.
                                    </Text>
                                ) : null}
                                <View className="mt-3 overflow-hidden rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50">
                                    {outEvidence?.uri ? (
                                        <Image
                                            source={{ uri: outEvidence.uri }}
                                            style={{ width: '100%', height: 200 }}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <View className="items-center px-4 py-8">
                                            <Text className="text-sm font-medium text-neutral-500">OUT photo preview</Text>
                                        </View>
                                    )}
                                </View>
                                <TouchableOpacity
                                    onPress={captureOutLocation}
                                    disabled={locatingOut}
                                    className="mt-4 flex-row items-center justify-center rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-3"
                                >
                                    <MapPin size={20} color="#6d28d9" strokeWidth={2.5} />
                                    <Text className="ml-2 font-black text-violet-900">
                                        {locatingOut ? 'Getting location…' : 'Capture location (OD OUT)'}
                                    </Text>
                                </TouchableOpacity>
                                {outLocationData ? (
                                    <View className="mt-3 rounded-xl border border-violet-100 bg-white px-3 py-2">
                                        <Text className="text-[10px] font-black uppercase text-violet-700">OUT GPS</Text>
                                        <Text className="text-xs text-neutral-600">
                                            {outLocationData.latitude.toFixed(5)}, {outLocationData.longitude.toFixed(5)}
                                        </Text>
                                    </View>
                                ) : null}
                                <TouchableOpacity
                                    onPress={onSubmitOdOut}
                                    disabled={submittingOut}
                                    className={`mt-5 py-4 rounded-2xl items-center ${submittingOut ? 'bg-violet-300' : 'bg-violet-600'}`}
                                >
                                    {submittingOut ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text className="text-white font-black uppercase tracking-widest text-xs">
                                            Submit OD OUT & send for approval
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        <View className="bg-white rounded-[28px] border-2 border-neutral-100 p-5 mb-4">
                            <Text className="text-neutral-400 text-[10px] font-black uppercase tracking-widest mb-2">Purpose</Text>
                            <Text className="text-neutral-800 font-medium leading-6">{String(row.purpose ?? '—')}</Text>
                            {row.contactNumber ? (
                                <Text className="text-neutral-500 text-sm mt-3">Contact: {String(row.contactNumber)}</Text>
                            ) : null}
                            {row.remarks ? (
                                <Text className="text-neutral-600 text-sm mt-3">Remarks: {String(row.remarks)}</Text>
                            ) : null}
                        </View>

                        {appliedLabel ? (
                            <View className="flex-row items-center gap-2 mb-6 opacity-90">
                                <Text className="text-neutral-600 text-xs">Submitted (IST): {appliedLabel}</Text>
                            </View>
                        ) : null}

                        {canCancel && (
                            <TouchableOpacity
                                onPress={onCancel}
                                className="mb-10 py-4 rounded-2xl border-2 border-rose-200 bg-rose-50 items-center"
                            >
                                <Text className="text-rose-700 font-black uppercase tracking-widest text-xs">Withdraw request</Text>
                            </TouchableOpacity>
                        )}
                        {canApproveReject && (
                            <View className="mb-10 flex-row gap-3">
                                <TouchableOpacity
                                    onPress={() => onAction('approve')}
                                    className="flex-1 items-center rounded-2xl bg-emerald-600 py-4"
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => onAction('reject')}
                                    className="flex-1 items-center rounded-2xl bg-rose-600 py-4"
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Reject</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <View className="h-8" />
                    </ScrollView>
                )}
            </SafeAreaView>
        </View>
    );
}
