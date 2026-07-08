function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1Based: number): number {
    return new Date(year, month1Based, 0).getDate();
}

function formatYmd(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export type PayPeriodRange = { from: string; to: string };

export type PayPeriodOption = {
    value: string;
    label: string;
    range: PayPeriodRange;
};

export function getDefaultLeaveODDateRange(startDay = 1): PayPeriodRange {
    const now = new Date();
    const today = now.getDate();
    const startDate = new Date(now);

    if (startDay > 1 && today < startDay) {
        startDate.setMonth(startDate.getMonth() - 1);
    }
    startDate.setDate(startDay);

    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 2);
    endDate.setDate(0);

    return { from: formatYmd(startDate), to: formatYmd(endDate) };
}

export function getPayPeriodRangeForCalendarMonth(
    year: number,
    month1Based: number,
    payrollCycleStartDay: number,
    payrollCycleEndDay: number | null | undefined
): PayPeriodRange {
    const startDay = payrollCycleStartDay >= 1 && payrollCycleStartDay <= 31 ? payrollCycleStartDay : 1;
    const rawEnd = payrollCycleEndDay;
    const endDay =
        rawEnd != null && !Number.isNaN(Number(rawEnd)) && Number(rawEnd) >= 1 && Number(rawEnd) <= 31
            ? Number(rawEnd)
            : startDay > 1
              ? startDay - 1
              : 31;

    if (startDay <= 1) {
        const actualEnd = Math.min(endDay, lastDayOfMonth(year, month1Based));
        return {
            from: `${year}-${pad2(month1Based)}-01`,
            to: `${year}-${pad2(month1Based)}-${pad2(actualEnd)}`,
        };
    }

    let startYear = year;
    let startMonth = month1Based - 1;
    if (startMonth < 1) {
        startMonth = 12;
        startYear -= 1;
    }

    const endDateObj = new Date(year, month1Based - 1, endDay);
    return {
        from: `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`,
        to: `${endDateObj.getFullYear()}-${pad2(endDateObj.getMonth() + 1)}-${pad2(endDateObj.getDate())}`,
    };
}

export function buildPayPeriodOptions(args: {
    payrollCycleStartDay: number;
    payrollCycleEndDay: number | null | undefined;
    monthsBack?: number;
    getDefaultRange: () => PayPeriodRange;
}): PayPeriodOption[] {
    const { payrollCycleStartDay, payrollCycleEndDay, monthsBack = 18, getDefaultRange } = args;
    const options: PayPeriodOption[] = [
        { value: '__default__', label: 'This period', range: getDefaultRange() },
    ];
    const seen = new Set(options.map((o) => o.value));
    const now = new Date();

    for (let i = 0; i < monthsBack; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const value = `full:${y}-${pad2(m)}`;
        if (seen.has(value)) continue;
        seen.add(value);
        options.push({
            value,
            label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
            range: getPayPeriodRangeForCalendarMonth(y, m, payrollCycleStartDay, payrollCycleEndDay),
        });
    }

    return options;
}

export function matchPayPeriodValue(range: PayPeriodRange, options: PayPeriodOption[], getDefaultRange: () => PayPeriodRange): string {
    const def = getDefaultRange();
    if (range.from === def.from && range.to === def.to) return '__default__';
    const found = options.find((o) => o.value !== '__default__' && o.range.from === range.from && o.range.to === range.to);
    return found?.value || '__custom__';
}
