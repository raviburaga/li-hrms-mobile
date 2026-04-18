/** OD IN must be persisted (photo + GPS) before location trail may run — mirrors web + backend draft rules. */
export function hasOdInEvidenceSubmitted(od: Record<string, unknown> | null | undefined): boolean {
    if (!od) return false;
    const start = (od.startEvidence as Record<string, unknown> | undefined) || {};
    const startPhoto = start.photoEvidence as { url?: string } | undefined;
    const legacyPhoto = od.photoEvidence as { url?: string } | undefined;
    const photoUrl = startPhoto?.url || legacyPhoto?.url;
    const geo =
        (start.geoLocation as Record<string, unknown> | undefined) ||
        (od.geoLocation as Record<string, unknown> | undefined);
    const lat = geo && typeof geo === 'object' ? Number(geo.latitude) : NaN;
    const lng = geo && typeof geo === 'object' ? Number(geo.longitude) : NaN;
    return Boolean(photoUrl && Number.isFinite(lat) && Number.isFinite(lng));
}

export type OdTrailUser = {
    id?: string;
    _id?: string;
    employeeRef?: string;
    employeeId?: string;
    emp_no?: string;
    email?: string;
} | null;

/** Same rules as web `isOdApplicantOwnerClient` — trail only for the employee, not approvers viewing someone else. */
export function isOdApplicantOwnerForTrail(od: Record<string, unknown> | null, user: OdTrailUser): boolean {
    if (!od || !user) return false;
    const uid = String(user._id || user.id || '').trim();
    const appliedById = String((od.appliedBy as { _id?: string } | undefined)?._id || od.appliedBy || '').trim();
    if (uid && appliedById && appliedById === uid) return true;

    const userEmpRef = String(user.employeeRef || '').trim();
    const odEmpId = String((od.employeeId as { _id?: string } | undefined)?._id || od.employeeId || '').trim();
    if (userEmpRef && odEmpId && userEmpRef === odEmpId) return true;
    if (uid && odEmpId && uid === odEmpId) return true;

    const userEmpNo = String(user.employeeId || user.emp_no || '').trim().toLowerCase();
    const odEmpNo = String(od.emp_no || (od.employeeId as { emp_no?: string } | undefined)?.emp_no || '').trim().toLowerCase();
    if (userEmpNo && odEmpNo && userEmpNo === odEmpNo) return true;

    const userEmpNoCandidates = [user.emp_no, user.email].filter(Boolean).map((v) => String(v).trim().toLowerCase());
    const odEmpNoCandidates = [od.emp_no, (od.employeeId as { emp_no?: string } | undefined)?.emp_no]
        .filter(Boolean)
        .map((v) => String(v).trim().toLowerCase());
    if (userEmpNoCandidates.some((val) => odEmpNoCandidates.includes(val))) return true;

    return false;
}

export function canRecordOdLocationTrail(od: Record<string, unknown> | null, user: OdTrailUser): boolean {
    if (!od || !user) return false;
    if (String(od.status) !== 'draft') return false;
    const end = od.endEvidence as { submittedAt?: unknown } | undefined;
    if (end?.submittedAt) return false;
    if (!hasOdInEvidenceSubmitted(od)) return false;
    return isOdApplicantOwnerForTrail(od, user);
}
