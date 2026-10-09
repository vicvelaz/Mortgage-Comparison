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
  let previousMonthlyRate: number | null = null;
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= plannedMonths && remaining > 0; month += 1) {
    const { reduction, cost } = bonusForMonth(mortgage, month);
    const annualRate = Math.max(0, mortgage.interestRate - reduction);
    const monthlyRate = annualRate / 100 / 12;
    const interest = remaining * monthlyRate;
    const monthsLeft = plannedMonths - month + 1;
    const rateChanged = previousMonthlyRate !== null && monthlyRate !== previousMonthlyRate;
    const repriceVariableRate = mortgage.rateType === 'variable' && rateChanged;
    const scheduledPayment = Math.min(
      remaining + interest,
      fixedPayment === null || repriceVariableRate
        ? monthlyPayment(remaining, monthlyRate, monthsLeft)
        : Math.max(fixedPayment, interest + Math.min(remaining, 0.01)),
    );
    const scheduledPrincipal = Math.min(remaining, scheduledPayment - interest);
    remaining -= scheduledPrincipal;
    const amortizationEvents: AmortizationEvent[] = [];
    const monthAmortizations = amortizationsForMonth(mortgage, month, includeAmortizations).sort(
      (left, right) => Number(left.reductionType === 'term') - Number(right.reductionType === 'term'),
    );
    let nextPayment: number = fixedPayment ?? scheduledPayment;
    let extraPayment = 0;
    for (const item of monthAmortizations) {
      const amount = Math.min(remaining, Math.max(0, item.amount));
      if (amount <= 0) continue;
      remaining -= amount;
      extraPayment += amount;
      amortizationEvents.push({
        id: item.id,
        name: item.name,
        amount,
      });
      if (item.reductionType === 'payment' && monthsLeft > 1 && remaining > 0) {
        nextPayment = monthlyPayment(remaining, monthlyRate, monthsLeft - 1);
      }
    }
    if (monthAmortizations.length > 0) fixedPayment = nextPayment;
    else if (repriceVariableRate) fixedPayment = scheduledPayment;
    previousMonthlyRate = monthlyRate;
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
  const activeAmortizations = mortgage.amortizations.filter((item) => item.active);
  const orderedAmortizations = activeAmortizations
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      left.item.month - right.item.month ||
      Number(left.item.reductionType === 'term') - Number(right.item.reductionType === 'term') ||
      left.index - right.index,
    );
  const savingsById = new Map<string, number>();
  let previousInterest = withoutAmortizations.totalInterest;
  let remainingSavings = Math.round(Math.max(0, previousInterest - result.totalInterest) * 100) / 100;
  const includedIds = new Set<string>();
  for (const { item } of orderedAmortizations) {
    includedIds.add(item.id);
    const scenario = calculateSchedule(
      {
        ...mortgage,
        amortizations: mortgage.amortizations.map((candidate) => ({
          ...candidate,
          active: candidate.active && includedIds.has(candidate.id),
        })),
      },
      true,
    );
    const marginalSavings = Math.round(Math.max(0, previousInterest - scenario.totalInterest) * 100) / 100;
    const savings = Math.min(remainingSavings, marginalSavings);
    savingsById.set(item.id, savings);
    remainingSavings -= savings;
    previousInterest = scenario.totalInterest;
  }
  const amortizationInterestSavings = activeAmortizations.map((item) => ({
    id: item.id,
    savings: savingsById.get(item.id) ?? 0,
  }));
  return {
    ...result,
    amortizationSavings: Math.max(0, withoutAmortizations.totalInterest - result.totalInterest),
    amortizationInterestSavings,
  };
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
