export function formatInr(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSectionValue(value: string | number, section: 'attendance' | 'earnings' | 'deductions'): string {
    if (section === 'attendance') {
        if (typeof value === 'number') {
            return Number.isInteger(value) ? String(value) : value.toFixed(2);
        }
        return String(value ?? '—');
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value ?? '—');
    return formatInr(n);
}

export function defaultPayslipListMonth(): string {
    const today = new Date();
    if (today.getDate() > 15) {
        return today.toISOString().substring(0, 7);
    }
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return prev.toISOString().substring(0, 7);
}
