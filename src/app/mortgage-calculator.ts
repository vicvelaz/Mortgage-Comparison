export interface Bonus {
  id: string;
  name: string;
  active: boolean;
  interestReduction: number;
  annualCost: number;
  startMonth?: number;
  endMonth?: number;
}

export interface Amortization {
  id: string;
  name: string;
  active: boolean;
  type: 'single' | 'recurring';
  reductionType: 'term' | 'payment';
  amount: number;
  month: number;
  frequencyMonths?: number;
}

export interface AmortizationEvent {
  id: string;
  name: string;
  amount: number;
}

export interface Mortgage {
  id: string;
  name: string;
  bank: string;
  amount: number;
  years: number;
  interestRate: number;
  rateType: 'fixed' | 'variable';
  startDate?: string;
  bonuses: Bonus[];
  amortizations: Amortization[];
  updatedAt: string;
}

export interface AmortizationRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  extraPayment: number;
  amortizationEvents: AmortizationEvent[];
  remainingCapital: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

export interface MortgageResult {
  rows: AmortizationRow[];
  firstPayment: number;
  totalInterest: number;
  bonusCost: number;
  totalCost: number;
  remainingCapital: number;
  amortizationSavings: number;
  amortizationInterestSavings: { id: string; savings: number }[];
}

function monthlyPayment(capital: number, monthlyRate: number, months: number): number {
  if (capital <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return capital / months;
  const denominator = -Math.expm1(-months * Math.log1p(monthlyRate));
  return (capital * monthlyRate) / denominator;
}

function bonusForMonth(mortgage: Mortgage, month: number) {
  return mortgage.bonuses.reduce(
    (result, bonus) => {
      const inPeriod = month >= (bonus.startMonth ?? 1) && month <= (bonus.endMonth ?? Infinity);
      if (!bonus.active || !inPeriod) return result;
      result.reduction += bonus.interestReduction;
      result.cost += bonus.annualCost / 12;
      return result;
    },
    { reduction: 0, cost: 0 },
  );
}

function amortizationsForMonth(
  mortgage: Mortgage,
  month: number,
  enabled: boolean,
): Amortization[] {
  if (!enabled) return [];
  return mortgage.amortizations.filter((item) => {
    if (!item.active) return false;
    const applies =
      item.type === 'single'
        ? month === item.month
        : month >= item.month &&
          item.frequencyMonths !== undefined &&
          item.frequencyMonths > 0 &&
          (month - item.month) % item.frequencyMonths === 0;
    return applies;
  });
}

function calculateSchedule(
  mortgage: Mortgage,
  includeAmortizations: boolean,
): Omit<MortgageResult, 'amortizationSavings' | 'amortizationInterestSavings'> {
  const plannedMonths = mortgage.years * 12;
  if (!Number.isInteger(plannedMonths) || plannedMonths < 1) {
    throw new RangeError('Mortgage term must contain a whole number of months');
  }
  let remaining = Math.max(0, mortgage.amount);
  let totalInterest = 0;
  let bonusCost = 0;
  let cumulativePrincipal = 0;
  let fixedPayment: number | null = null;
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= plannedMonths && remaining > 0; month += 1) {
    const { reduction, cost } = bonusForMonth(mortgage, month);
    const annualRate = Math.max(0, mortgage.interestRate - reduction);
    const monthlyRate = annualRate / 100 / 12;
    const interest = remaining * monthlyRate;
    const monthsLeft = plannedMonths - month + 1;
    const scheduledPayment = Math.min(
      remaining + interest,
      fixedPayment === null
        ? monthlyPayment(remaining, monthlyRate, monthsLeft)
        : Math.max(fixedPayment, interest + Math.min(remaining, 0.01)),
    );
    const scheduledPrincipal = Math.min(remaining, scheduledPayment - interest);
    remaining -= scheduledPrincipal;
    const amortizationEvents: AmortizationEvent[] = [];
    const monthAmortizations = amortizationsForMonth(mortgage, month, includeAmortizations);
    let reducesTerm = false;
    let reducesPayment = false;
    let extraPayment = 0;
    for (const item of monthAmortizations) {
      const amount = Math.min(remaining, Math.max(0, item.amount));
      if (amount <= 0) continue;
      remaining -= amount;
      extraPayment += amount;
      reducesTerm ||= item.reductionType === 'term';
      reducesPayment ||= item.reductionType === 'payment';
      amortizationEvents.push({
        id: item.id,
        name: item.name,
        amount,
      });
    }
    if (reducesTerm) fixedPayment = scheduledPayment;
    else if (reducesPayment) fixedPayment = null;
    const principal = scheduledPrincipal + extraPayment;
    remaining = Math.max(0, remaining);
    totalInterest += interest;
    bonusCost += cost;
    cumulativePrincipal += principal;

    rows.push({
      month,
      payment: interest + scheduledPrincipal,
      interest,
      principal,
      extraPayment,
      amortizationEvents,
      remainingCapital: remaining,
      cumulativeInterest: totalInterest,
      cumulativePrincipal,
    });
  }

  return {
    rows,
    firstPayment: rows[0]?.payment ?? 0,
    totalInterest,
    bonusCost,
    totalCost: mortgage.amount - remaining + totalInterest + bonusCost,
    remainingCapital: remaining,
  };
}

export function calculateMortgage(mortgage: Mortgage): MortgageResult {
  const result = calculateSchedule(mortgage, true);
  const withoutAmortizations = calculateSchedule(mortgage, false);
  const amortizationInterestSavings = mortgage.amortizations
    .filter((item) => item.active)
    .map((item) => {
      const withoutAmortization = calculateSchedule(
        {
          ...mortgage,
          amortizations: mortgage.amortizations.map((candidate) =>
            candidate.id === item.id ? { ...candidate, active: false } : candidate,
          ),
        },
        true,
      );
      return {
        id: item.id,
        savings: Math.max(0, withoutAmortization.totalInterest - result.totalInterest),
      };
    });
  return {
    ...result,
    amortizationSavings: Math.max(0, withoutAmortizations.totalCost - result.totalCost),
    amortizationInterestSavings,
  };
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
