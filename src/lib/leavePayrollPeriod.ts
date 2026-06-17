/**
 * Payroll period date utilities — ported from web frontend.
 * Mirrors backend dateCycleService rules (IST-aligned).
 */

// ─── IST helpers ────────────────────────────────────────────────────────────

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1Based: number): number {
    return new Date(year, month1Based, 0).getDate();
}

/** Parse a plain YYYY-MM-DD string to { year, month, day }. */
function istYmdToParts(ymd: string): { year: number; month: number; day: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
}

/**
 * Normalise a date value to a plain YYYY-MM-DD string (IST civil day).
 * Plain YYYY-MM-DD strings are returned as-is (no TZ shift).
 */
export function normalizeToISTYmd(value: Date | string): string | null {
    const raw = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // ISO/timestamp — convert to IST calendar date
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
}

// ─── Payroll Period ──────────────────────────────────────────────────────────

export type PayrollPeriod = { from: string; to: string; month: number; year: number };

/**
 * Returns the payroll period (from/to YYYY-MM-DD) that contains dateInput.
 * e.g. cycle start=26 → "26 Jan – 25 Feb" is the February-labelled period.
 */
export function getPayrollPeriodForDate(
    dateInput: string,
    payrollCycleStartDay: number,
    payrollCycleEndDay: number | null | undefined
): PayrollPeriod | null {
    const ymd = normalizeToISTYmd(dateInput);
    if (!ymd) return null;
    const parts = istYmdToParts(ymd);
    if (!parts) return null;
    const { year, month: month1, day } = parts;

    const startDay =
        payrollCycleStartDay >= 1 && payrollCycleStartDay <= 31 ? payrollCycleStartDay : 1;
    const rawEnd = payrollCycleEndDay;
    const endDay =
        rawEnd != null && !Number.isNaN(Number(rawEnd)) && Number(rawEnd) >= 1 && Number(rawEnd) <= 31
            ? Number(rawEnd)
            : startDay > 1
                ? startDay - 1
                : 31;

    // Full calendar-month cycle (start=1)
    if (startDay <= 1 && endDay >= 28) {
        const actualEnd = Math.min(endDay, lastDayOfMonth(year, month1));
        return {
            from: `${year}-${pad2(month1)}-01`,
            to: `${year}-${pad2(month1)}-${pad2(actualEnd)}`,
            month: month1,
            year,
        };
    }

    // Date is in the "second half" of the cycle (day >= startDay)
    if (day >= startDay) {
        let nextMonth = month1 + 1;
        let nextYear = year;
        if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
        const endActual = Math.min(endDay, lastDayOfMonth(nextYear, nextMonth));
        return {
            from: `${year}-${pad2(month1)}-${pad2(startDay)}`,
            to: `${nextYear}-${pad2(nextMonth)}-${pad2(endActual)}`,
            month: nextMonth,
            year: nextYear,
        };
    }

    // Date is in the "first half" of the cycle (day < startDay)
    let prevMonth = month1 - 1;
    let prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
    const endActual = Math.min(endDay, lastDayOfMonth(year, month1));
    return {
        from: `${prevYear}-${pad2(prevMonth)}-${pad2(startDay)}`,
        to: `${year}-${pad2(month1)}-${pad2(endActual)}`,
        month: month1,
        year,
    };
}

export function formatPayrollPeriodRangeLabel(fromYmd: string, toYmd: string): string {
    const fmt = (ymd: string) => {
        const p = ymd.split('-').map((x) => parseInt(x, 10));
        const d = new Date(p[0], p[1] - 1, p[2]);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(fromYmd)} – ${fmt(toYmd)}`;
}

/** True when from and to (inclusive) lie within the same payroll period. */
export type PeriodCheckResult =
    | { ok: true; period: { from: string; to: string } }
    | { ok: false; fromPeriod: { from: string; to: string }; toPeriod: { from: string; to: string } };

export function leaveDatesInSinglePayrollPeriod(
    fromYmd: string,
    toYmd: string,
    payrollCycleStartDay: number,
    payrollCycleEndDay: number | null | undefined
): PeriodCheckResult {
    const to = toYmd?.trim() || fromYmd;
    const fromPeriod = getPayrollPeriodForDate(fromYmd, payrollCycleStartDay, payrollCycleEndDay);
    const toPeriod = getPayrollPeriodForDate(to, payrollCycleStartDay, payrollCycleEndDay);
    if (!fromPeriod || !toPeriod) {
        return { ok: true, period: fromPeriod || toPeriod || { from: fromYmd, to } };
    }
    if (fromPeriod.from === toPeriod.from && fromPeriod.to === toPeriod.to) {
        return { ok: true, period: { from: fromPeriod.from, to: fromPeriod.to } };
    }
    return {
        ok: false,
        fromPeriod: { from: fromPeriod.from, to: fromPeriod.to },
        toPeriod: { from: toPeriod.from, to: toPeriod.to },
    };
}

/**
 * Returns a user-facing error string when the selected date range crosses payroll
 * period boundaries; returns null when everything is fine.
 */
export function buildCrossPayrollPeriodLeaveError(
    fromYmd: string,
    toYmd: string,
    payrollCycleStartDay: number,
    payrollCycleEndDay: number | null | undefined
): string | null {
    if (!fromYmd?.trim()) return null;
    const to = (toYmd || fromYmd).trim();
    const check = leaveDatesInSinglePayrollPeriod(fromYmd, to, payrollCycleStartDay, payrollCycleEndDay);
    if (check.ok) return null;
    return (
        `Leave cannot span payroll periods. ` +
        `${formatPayrollPeriodRangeLabel(check.fromPeriod.from, check.fromPeriod.to)} covers the start; ` +
        `${formatPayrollPeriodRangeLabel(check.toPeriod.from, check.toPeriod.to)} covers the end. ` +
        `Submit separate applications for each period.`
    );
}

// ─── Day Count ───────────────────────────────────────────────────────────────

/**
 * Simple working-day count between two inclusive YYYY-MM-DD strings.
 * Does NOT skip weekends/holidays — mirrors the leave day input from the form
 * (backend validates the real count). This is only used for UI display.
 */
export function calcLeaveDayCount(
    fromYmd: string,
    toYmd: string,
    isHalfDay: boolean
): number {
    if (!fromYmd || !toYmd) return 0;
    if (isHalfDay) return 0.5;
    const a = new Date(fromYmd + 'T00:00:00');
    const b = new Date(toYmd + 'T00:00:00');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return Math.max(1, diff + 1);
}
