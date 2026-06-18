/** Helpers for leave apply dialog — monthly pool + per-type caps (CL / CCL / EL). */

export type LeaveApplyPeriodContextData = {
  monthlyApplyRemaining?: number | null;
  monthlyApplyCeiling?: number | null;
  monthlyApplyConsumed?: number | null;
  monthlyApplyLocked?: number | null;
  hasYearDoc?: boolean;
  hasSlot?: boolean;
  payrollLabel?: string | null;
  scheduledCl?: number | null;
  scheduledCcl?: number | null;
  scheduledEl?: number | null;
  includeELInMonthlyPool?: boolean;
  balances?: { cl?: number | null; ccl?: number | null; el?: number | null };
  selectedType?: {
    remaining?: number | null;
    scheduled?: number | null;
    consumed?: number | null;
    approved?: number | null;
    locked?: number | null;
    balance?: number | null;
    cap?: number | null;
  };
};

export function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

/** Pooled payroll-period credits left (CL + CCL + optional EL), with API fallback. */
export function resolvePooledMonthlyRemaining(d: LeaveApplyPeriodContextData | null | undefined): number | null {
  if (!d) return null;
  if (d.monthlyApplyRemaining != null && Number.isFinite(Number(d.monthlyApplyRemaining))) {
    return Math.max(0, Number(d.monthlyApplyRemaining));
  }
  let ceiling: number | null =
    d.monthlyApplyCeiling != null && Number.isFinite(Number(d.monthlyApplyCeiling))
      ? Number(d.monthlyApplyCeiling)
      : null;
  if (ceiling == null) {
    const elPart = d.includeELInMonthlyPool ? Number(d.scheduledEl) || 0 : 0;
    ceiling = (Number(d.scheduledCl) || 0) + (Number(d.scheduledCcl) || 0) + elPart;
  }
  const consumed =
    d.monthlyApplyConsumed != null && Number.isFinite(Number(d.monthlyApplyConsumed))
      ? Number(d.monthlyApplyConsumed)
      : null;
  if (ceiling != null && consumed != null) {
    return Math.max(0, ceiling - consumed);
  }
  return null;
}

export function capTrackedTypeUsesMonthlyPool(leaveType: string, d: LeaveApplyPeriodContextData): boolean {
  const lt = String(leaveType || '').toUpperCase();
  return lt === 'CL' || lt === 'CCL' || (lt === 'EL' && !!d.includeELInMonthlyPool);
}

/** Days user can still apply: min(month pool, per-type cap, FY balance) when applicable. */
export function computeCapTrackedEffectiveRemaining(
  d: LeaveApplyPeriodContextData | null | undefined,
  leaveType: string
): number | null {
  if (!d) return null;
  const lt = String(leaveType || '').toUpperCase();
  const pooledApplies = capTrackedTypeUsesMonthlyPool(lt, d);
  const pooledRem = pooledApplies ? resolvePooledMonthlyRemaining(d) : null;
  const typeRem =
    d.selectedType?.remaining != null && Number.isFinite(Number(d.selectedType.remaining))
      ? Math.max(0, Number(d.selectedType.remaining))
      : null;

  let effective: number | null = null;
  if (pooledApplies && pooledRem != null) effective = pooledRem;
  if (typeRem != null) {
    effective = effective != null ? Math.min(effective, typeRem) : typeRem;
  }

  let fyBal: number | null = null;
  if (lt === 'CL' && d.balances?.cl != null) fyBal = Number(d.balances.cl);
  else if (lt === 'CCL' && d.balances?.ccl != null) fyBal = Number(d.balances.ccl);
  else if (lt === 'EL' && d.balances?.el != null) fyBal = Number(d.balances.el);
  if (fyBal != null && Number.isFinite(fyBal)) {
    effective = effective != null ? Math.min(effective, fyBal) : fyBal;
  }
  return effective;
}

export function fyBalanceForCapTrackedType(
  d: LeaveApplyPeriodContextData | null | undefined,
  leaveType: string
): number | null {
  if (!d?.balances) return null;
  const lt = String(leaveType || '').toUpperCase();
  if (lt === 'CL' && d.balances.cl != null) return Number(d.balances.cl);
  if (lt === 'CCL' && d.balances.ccl != null) return Number(d.balances.ccl);
  if (lt === 'EL' && d.balances.el != null) return Number(d.balances.el);
  return null;
}
