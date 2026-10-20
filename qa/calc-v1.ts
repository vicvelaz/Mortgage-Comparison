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
  type: 'single' | 'recurring';
  amount: number;
  month: number;
  frequencyMonths?: number;
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
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function monthlyPayment(capital: number, monthlyRate: number, months: number): number {
  if (capital <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return cents(capital / months);
  const factor = Math.pow(1 + monthlyRate, months);
  return cents((capital * monthlyRate * factor) / (factor - 1));
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

function extraPaymentForMonth(mortgage: Mortgage, month: number, enabled: boolean): number {
  if (!enabled) return 0;
  return cents(
    mortgage.amortizations.reduce((total, item) => {
      const applies =
        item.type === 'single'
          ? month === item.month
          : month >= item.month &&
            item.frequencyMonths !== undefined &&
            item.frequencyMonths > 0 &&
            (month - item.month) % item.frequencyMonths === 0;
      return total + (applies ? Math.max(0, item.amount) : 0);
    }, 0),
  );
}

function calculateSchedule(mortgage: Mortgage, includeAmortizations: boolean): Omit<MortgageResult, 'amortizationSavings'> {
  const plannedMonths = Math.max(1, Math.round(mortgage.years * 12));
  let remaining = cents(Math.max(0, mortgage.amount));
  let totalInterest = 0;
  let bonusCost = 0;
  let cumulativePrincipal = 0;
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= plannedMonths && remaining > 0; month += 1) {
    const { reduction, cost } = bonusForMonth(mortgage, month);
    const annualRate = Math.max(0, mortgage.interestRate - reduction);
    const monthlyRate = annualRate / 100 / 12;
    const interest = cents(remaining * monthlyRate);
    const monthsLeft = plannedMonths - month + 1;
    const scheduledPayment = Math.min(remaining + interest, monthlyPayment(remaining, monthlyRate, monthsLeft));
    const scheduledPrincipal = Math.min(remaining, cents(scheduledPayment - interest));
    const extraPayment = Math.min(
      cents(remaining - scheduledPrincipal),
      extraPaymentForMonth(mortgage, month, includeAmortizations),
    );
    const principal = cents(scheduledPrincipal + extraPayment);
    remaining = Math.max(0, cents(remaining - principal));
    totalInterest = cents(totalInterest + interest);
    bonusCost += cost;
    cumulativePrincipal = cents(cumulativePrincipal + principal);

    rows.push({
      month,
      payment: cents(interest + scheduledPrincipal),
      interest,
      principal,
      extraPayment,
      remainingCapital: remaining,
      cumulativeInterest: totalInterest,
      cumulativePrincipal,
    });
  }

  const totalPayments = cents(mortgage.amount - remaining + totalInterest);
  return {
    rows,
    firstPayment: rows[0]?.payment ?? 0,
    totalInterest,
    bonusCost: cents(bonusCost),
    totalCost: cents(totalPayments + bonusCost),
    remainingCapital: remaining,
  };
}

export function calculateMortgage(mortgage: Mortgage): MortgageResult {
  const result = calculateSchedule(mortgage, true);
  const withoutAmortizations = calculateSchedule(mortgage, false);
  return {
    ...result,
    amortizationSavings: cents(Math.max(0, withoutAmortizations.totalCost - result.totalCost)),
  };
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
