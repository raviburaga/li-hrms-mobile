/** All display formatting uses Asia/Kolkata (IST). */

const TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';

function toDate(input: unknown): Date | null {
    if (input == null || input === '') return null;
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
    if (typeof input === 'string' || typeof input === 'number') {
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/** Calendar-oriented label for leave/OD fromDate & toDate (handles ISO strings from Mongo). */
export function formatDateOnlyIST(input: unknown): string {
    const d = toDate(input);
    if (!d) return typeof input === 'string' && input ? input.split('T')[0] : '—';
    return d.toLocaleDateString(LOCALE, {
        timeZone: TZ,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/** Range label: "15 Mar 2025 → 18 Mar 2025" */
export function formatDateRangeIST(from: unknown, to: unknown): string {
    const a = formatDateOnlyIST(from);
    const b = formatDateOnlyIST(to);
    if (a === '—' && b === '—') return '—';
    return `${a} → ${b}`;
}

/** Applied/submitted timestamps: date + time in IST (12h). */
export function formatDateTimeIST(input: unknown): string {
    const d = toDate(input);
    if (!d) return typeof input === 'string' ? input : '—';
    return d.toLocaleString(LOCALE, {
        timeZone: TZ,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

/** Today's calendar date in IST as YYYY-MM-DD. */
export function todayYmdIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Move a calendar date by whole days in IST (ymd is YYYY-MM-DD). */
export function addCalendarDaysIST(ymd: string, deltaDays: number): string {
    const t = new Date(`${ymd}T12:00:00+05:30`);
    if (Number.isNaN(t.getTime())) return ymd;
    t.setTime(t.getTime() + deltaDays * 86400000);
    return t.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Calendar year and month (1–12) in Asia/Kolkata. */
export function istYearMonth(): { year: number; month: number } {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(new Date());
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    return { year, month };
}

/** Clock time only (e.g. punch) in IST. */
export function formatTimeIST(input: unknown): string {
    const d = toDate(input);
    if (!d && typeof input === 'string' && /^\d{1,2}:\d{2}/.test(input)) return input;
    if (!d) return typeof input === 'string' ? input : '—';
    return d.toLocaleTimeString(LOCALE, {
        timeZone: TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

/** Short step timestamp under timeline (IST). */
export function formatShortDateTimeIST(input: unknown): string {
    const d = toDate(input);
    if (!d) return '';
    return d.toLocaleString(LOCALE, {
        timeZone: TZ,
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

/** Short calendar label e.g. "15 Mar" from YYYY-MM-DD or ISO. */
export function formatShortDateIST(input: unknown): string {
    const raw = typeof input === 'string' ? input.trim() : input;
    const d = toDate(typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00+05:30` : raw);
    if (!d) return typeof raw === 'string' ? raw : '—';
    return d.toLocaleDateString(LOCALE, {
        timeZone: TZ,
        day: 'numeric',
        month: 'short',
    });
}
