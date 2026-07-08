/** Apply-dialog checks: approved leave/OD + attendance row for a single date. */

export type AttendancePresenceInfo = {
  hasAttendance?: boolean;
  status?: string | null;
  firstHalfPresent?: boolean;
  secondHalfPresent?: boolean;
  fullDayPresent?: boolean;
  label?: string | null;
};

export type ApprovedRecordsPayload = {
  hasLeave?: boolean;
  hasOD?: boolean;
  leaveInfo?: { isHalfDay?: boolean; halfDayType?: string | null } | null;
  odInfo?: { isHalfDay?: boolean; halfDayType?: string | null } | null;
  attendanceInfo?: AttendancePresenceInfo | null;
};

export type AttendanceSuggestion = {
  blocked: boolean;
  suggestion: string | null;
  /** User should turn on Half day in the form */
  recommendEnableHalfDay?: boolean;
  /** Which half to pick in the dropdown */
  recommendHalf?: 'first_half' | 'second_half';
};

export function getLeaveAttendanceSuggestion(
  attendanceInfo: AttendancePresenceInfo | null | undefined,
  requested: { isHalfDay: boolean; halfDayType: 'first_half' | 'second_half' | null }
): AttendanceSuggestion {
  if (!attendanceInfo?.hasAttendance) {
    return { blocked: false, suggestion: null };
  }

  const firstPresent = Boolean(attendanceInfo.firstHalfPresent);
  const secondPresent = Boolean(attendanceInfo.secondHalfPresent);
  const fullDayPresent = Boolean(attendanceInfo.fullDayPresent || (firstPresent && secondPresent));
  const requestedHalf = requested.isHalfDay ? requested.halfDayType || 'first_half' : null;

  if (fullDayPresent) {
    return {
      blocked: true,
      suggestion:
        'Attendance is already marked present for the full day. Correct attendance first, or apply leave only if policy allows.',
    };
  }

  if (firstPresent && !secondPresent) {
    if (!requested.isHalfDay || requestedHalf === 'first_half') {
      return {
        blocked: true,
        suggestion: 'First half is already marked present. Use Half day with Second half selected, or pick another date.',
        recommendEnableHalfDay: !requested.isHalfDay,
        recommendHalf: 'second_half',
      };
    }
    return {
      blocked: false,
      suggestion: 'First half is marked present. Half day — Second half is the recommended option.',
      recommendHalf: 'second_half',
    };
  }

  if (secondPresent && !firstPresent) {
    if (!requested.isHalfDay || requestedHalf === 'second_half') {
      return {
        blocked: true,
        suggestion: 'Second half is already marked present. Use Half day with First half selected, or pick another date.',
        recommendEnableHalfDay: !requested.isHalfDay,
        recommendHalf: 'first_half',
      };
    }
    return {
      blocked: false,
      suggestion: 'Second half is marked present. Half day — First half is the recommended option.',
      recommendHalf: 'first_half',
    };
  }

  const label = String(attendanceInfo.label || '');
  if (/absent/i.test(label) || String(attendanceInfo.status || '').toUpperCase() === 'ABSENT') {
    return {
      blocked: false,
      suggestion: 'Employee is marked absent. You can apply leave for this date.',
    };
  }

  return {
    blocked: false,
    suggestion: 'An attendance row exists for this date. Confirm full day vs half day before submitting.',
  };
}

export type HalfDayFormAction = {
  recommendEnableHalfDay: boolean;
  recommendHalf: 'first_half' | 'second_half';
  currentIsHalfDay: boolean;
  currentHalf: 'first_half' | 'second_half' | null;
  matchesRecommendation: boolean;
};

export type HalfOccupancy = 'free' | 'attendance' | 'leave' | 'od';

export type DayHalfCoverage = {
  first: HalfOccupancy;
  second: HalfOccupancy;
};

export type ApplyDateCheckBannerState = {
  variant: 'error' | 'warning' | 'info' | 'complete';
  headline: string;
  body: string;
  blocked: boolean;
  /** Both halves already have attendance and/or approved leave/OD — no new application */
  dateFullyCovered: boolean;
  showOppositeHalfNote: boolean;
  attendanceLabel: string | null;
  leaveLine: string | null;
  odLine: string | null;
  halfDayAction: HalfDayFormAction | null;
  coverage: DayHalfCoverage | null;
};

function occupancyLabel(occ: HalfOccupancy): string {
  switch (occ) {
    case 'attendance':
      return 'attendance (present)';
    case 'leave':
      return 'approved leave';
    case 'od':
      return 'approved OD';
    default:
      return 'open';
  }
}

/** Which half is taken by attendance vs approved leave/OD. */
export function resolveDayHalfCoverage(info: ApprovedRecordsPayload): DayHalfCoverage {
  let first: HalfOccupancy = 'free';
  let second: HalfOccupancy = 'free';
  const a = info.attendanceInfo;

  if (a?.hasAttendance) {
    if (a.fullDayPresent || (a.firstHalfPresent && a.secondHalfPresent)) {
      first = 'attendance';
      second = 'attendance';
    } else {
      if (a.firstHalfPresent) first = 'attendance';
      if (a.secondHalfPresent) second = 'attendance';
    }
  }

  const stampHalf = (half: string | null | undefined, kind: 'leave' | 'od') => {
    if (half === 'first_half') first = kind;
    else if (half === 'second_half') second = kind;
  };

  if (info.hasLeave) {
    if (info.leaveInfo?.isHalfDay) stampHalf(info.leaveInfo.halfDayType, 'leave');
    else {
      first = 'leave';
      second = 'leave';
    }
  }
  if (info.hasOD) {
    if (info.odInfo?.isHalfDay) stampHalf(info.odInfo.halfDayType, 'od');
    else {
      first = 'od';
      second = 'od';
    }
  }

  return { first, second };
}

export function isDayFullyCovered(coverage: DayHalfCoverage): boolean {
  return coverage.first !== 'free' && coverage.second !== 'free';
}

function buildDayFullyCoveredMessage(coverage: DayHalfCoverage): string {
  return (
    `First half: ${occupancyLabel(coverage.first)}. Second half: ${occupancyLabel(coverage.second)}. ` +
    'Both halves are already accounted for — you do not need to submit another application for this date.'
  );
}

function buildHalfDayAction(
  attendanceGuidance: AttendanceSuggestion,
  options: { isHalfDay: boolean; halfDayType: 'first_half' | 'second_half' | null }
): HalfDayFormAction | null {
  if (!attendanceGuidance.recommendHalf) return null;
  const recommendHalf = attendanceGuidance.recommendHalf;
  const matchesRecommendation =
    options.isHalfDay && options.halfDayType === recommendHalf;
  return {
    recommendEnableHalfDay: Boolean(attendanceGuidance.recommendEnableHalfDay),
    recommendHalf,
    currentIsHalfDay: options.isHalfDay,
    currentHalf: options.halfDayType,
    matchesRecommendation,
  };
}

export function halfDayLabel(half: 'first_half' | 'second_half'): string {
  return half === 'first_half' ? 'First half' : 'Second half';
}

export function getApplyDateCheckBannerState(
  info: ApprovedRecordsPayload | null | undefined,
  options: {
    applyType: 'leave' | 'od';
    isHalfDay: boolean;
    halfDayType: 'first_half' | 'second_half' | null;
  }
): ApplyDateCheckBannerState | null {
  if (!info) return null;

  const hasLeave = Boolean(info.hasLeave);
  const hasOD = Boolean(info.hasOD);
  const hasAttendance = Boolean(info.attendanceInfo?.hasAttendance);
  if (!hasLeave && !hasOD && !hasAttendance) return null;

  const coverage = resolveDayHalfCoverage(info);
  const dateFullyCovered = isDayFullyCovered(coverage);

  const attendanceLabel = info.attendanceInfo?.label || null;
  const leaveLine = hasLeave
    ? info.leaveInfo?.isHalfDay
      ? `${info.leaveInfo.halfDayType === 'first_half' ? 'First' : 'Second'} half leave (approved)`
      : 'Full day leave (approved)'
    : null;
  const odLine = hasOD
    ? info.odInfo?.isHalfDay
      ? `${info.odInfo.halfDayType === 'first_half' ? 'First' : 'Second'} half OD (approved)`
      : 'Full day OD (approved)'
    : null;

  if (dateFullyCovered) {
    return {
      variant: 'complete',
      headline: 'Nothing more to apply on this date',
      body: buildDayFullyCoveredMessage(coverage),
      blocked: true,
      dateFullyCovered: true,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: null,
      coverage,
    };
  }

  const attendanceGuidance = getLeaveAttendanceSuggestion(info.attendanceInfo, {
    isHalfDay: options.isHalfDay,
    halfDayType: options.halfDayType,
  });

  const fullDayConflict =
    (hasLeave && !info.leaveInfo?.isHalfDay) || (hasOD && !info.odInfo?.isHalfDay);
  const halfDayApproved =
    (hasLeave && info.leaveInfo?.isHalfDay) || (hasOD && info.odInfo?.isHalfDay);
  const sameHalfConflict =
    options.isHalfDay &&
    halfDayApproved &&
    ((hasLeave && info.leaveInfo?.halfDayType === options.halfDayType) ||
      (hasOD && info.odInfo?.halfDayType === options.halfDayType));

  const blocked = fullDayConflict || sameHalfConflict || attendanceGuidance.blocked;
  const isAbsentRow =
    hasAttendance &&
    (/absent/i.test(attendanceLabel || '') ||
      String(info.attendanceInfo?.status || '').toUpperCase() === 'ABSENT');

  const requestLabel = options.applyType === 'leave' ? 'leave' : 'OD';

  if (blocked) {
    let body = attendanceGuidance.suggestion || `This date cannot accept another ${requestLabel} request.`;
    let halfDayAction: HalfDayFormAction | null = null;
    if (fullDayConflict) {
      body = hasLeave
        ? 'An approved full-day leave already exists on this date.'
        : 'An approved full-day OD already exists on this date.';
    } else if (sameHalfConflict) {
      const otherHalf: 'first_half' | 'second_half' =
        options.halfDayType === 'first_half' ? 'second_half' : 'first_half';
      body = `That half already has an approved record. Use Half day with ${halfDayLabel(otherHalf)} selected, or pick another date.`;
      halfDayAction = {
        recommendEnableHalfDay: true,
        recommendHalf: otherHalf,
        currentIsHalfDay: options.isHalfDay,
        currentHalf: options.halfDayType,
        matchesRecommendation: options.halfDayType === otherHalf,
      };
    } else {
      halfDayAction = buildHalfDayAction(attendanceGuidance, options);
    }
    return {
      variant: 'error',
      headline: `Cannot apply ${requestLabel} on this date`,
      body,
      blocked: true,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction,
      coverage,
    };
  }

  if (halfDayApproved) {
    const approvedHalf =
      info.leaveInfo?.halfDayType === 'first_half' || info.leaveInfo?.halfDayType === 'second_half'
        ? (info.leaveInfo.halfDayType as 'first_half' | 'second_half')
        : info.odInfo?.halfDayType === 'first_half' || info.odInfo?.halfDayType === 'second_half'
          ? (info.odInfo.halfDayType as 'first_half' | 'second_half')
          : 'first_half';
    const oppositeHalf: 'first_half' | 'second_half' =
      approvedHalf === 'first_half' ? 'second_half' : 'first_half';
    const oppositeFree =
      oppositeHalf === 'first_half' ? coverage.first === 'free' : coverage.second === 'free';

    if (!oppositeFree) {
      return {
        variant: 'complete',
        headline: 'Nothing more to apply on this date',
        body: buildDayFullyCoveredMessage(coverage),
        blocked: true,
        dateFullyCovered: true,
        showOppositeHalfNote: false,
        attendanceLabel,
        leaveLine,
        odLine,
        halfDayAction: null,
        coverage,
      };
    }

    return {
      variant: 'warning',
      headline: 'Approved half-day on this date',
      body: `The other half (${halfDayLabel(oppositeHalf)}) is still open. You may apply ${requestLabel} for that half only.`,
      blocked: false,
      dateFullyCovered: false,
      showOppositeHalfNote: true,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: {
        recommendEnableHalfDay: !options.isHalfDay,
        recommendHalf: oppositeHalf,
        currentIsHalfDay: options.isHalfDay,
        currentHalf: options.halfDayType,
        matchesRecommendation: options.isHalfDay && options.halfDayType === oppositeHalf,
      },
      coverage,
    };
  }

  if (isAbsentRow && !hasLeave && !hasOD) {
    return {
      variant: 'info',
      headline: 'Marked absent on this date',
      body: 'No present attendance is recorded. Applying leave here is normal — choose Full day or enable Half day below.',
      blocked: false,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: null,
      coverage,
    };
  }

  if (hasAttendance) {
    const halfDayAction = buildHalfDayAction(attendanceGuidance, options);
    return {
      variant: attendanceGuidance.blocked ? 'error' : 'info',
      headline: 'Attendance on this date',
      body: attendanceGuidance.suggestion || 'Review Full day vs Half day before submitting.',
      blocked: attendanceGuidance.blocked,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction,
      coverage,
    };
  }

  return {
    variant: 'warning',
    headline: 'Approved record on this date',
    body: hasLeave ? 'Approved leave exists — check it does not overlap your request.' : 'Approved OD exists — check it does not overlap your request.',
    blocked: false,
    dateFullyCovered: false,
    showOppositeHalfNote: false,
    attendanceLabel,
    leaveLine,
    odLine,
    halfDayAction: null,
    coverage,
  };
}
