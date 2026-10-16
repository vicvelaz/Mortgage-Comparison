import { MAX_TERM_YEARS } from './mortgage-validation';

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

export interface Scenario {
  id: string;
  name: string;
  bonuses: Bonus[];
  amortizations: Amortization[];
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
  scenarios: Scenario[];
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
  rateCapped: boolean;
  annualPercentageRate: number;
}

function monthlyPayment(capital: number, monthlyRate: number, months: number): number {
  if (capital <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return capital / months;
  const denominator = -Math.expm1(-months * Math.log1p(monthlyRate));
  const payment = (capital * monthlyRate) / denominator;
  return Number.isFinite(payment) ? payment : capital * monthlyRate;
}

function bonusForMonth(scenario: Scenario, month: number) {
  return scenario.bonuses.reduce(
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
  scenario: Scenario,
  month: number,
  enabled: boolean,
): Amortization[] {
  if (!enabled) return [];
  return scenario.amortizations.filter((item) => {
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

type ScheduleResult = Omit<
  MortgageResult,
  'amortizationSavings' | 'amortizationInterestSavings' | 'annualPercentageRate'
> & { cashFlows: number[] };

function calculateSchedule(
  mortgage: Mortgage,
  scenario: Scenario,
  includeAmortizations: boolean,
): ScheduleResult {
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
  let rateCapped = false;
  const cashFlows: number[] = [];
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= plannedMonths && remaining > 0; month += 1) {
    const { reduction, cost } = bonusForMonth(scenario, month);
    if (reduction > mortgage.interestRate) rateCapped = true;
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
    const monthAmortizations = amortizationsForMonth(scenario, month, includeAmortizations).sort(
      (left, right) =>
        Number(left.reductionType === 'term') - Number(right.reductionType === 'term'),
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
    cashFlows.push(interest + scheduledPrincipal + extraPayment + cost);

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
    rateCapped,
    cashFlows,
  };
}

export function calculateMortgage(mortgage: Mortgage, scenario: Scenario): MortgageResult {
  if (!isCalculable(mortgage)) return emptyResult();
  const { cashFlows, ...result } = calculateSchedule(mortgage, scenario, true);
  const withoutAmortizations = calculateSchedule(mortgage, scenario, false);
  if (
    !isFiniteResult(result) ||
    !isFiniteResult(withoutAmortizations) ||
    !cashFlows.every((flow) => Number.isFinite(flow))
  ) {
    return emptyResult();
  }
  const activeAmortizations = scenario.amortizations.filter((item) => item.active);
  const orderedAmortizations = activeAmortizations
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        left.item.month - right.item.month ||
        Number(left.item.reductionType === 'term') - Number(right.item.reductionType === 'term') ||
        left.index - right.index,
    );
  const savingsById = new Map<string, number>();
  let previousInterest = withoutAmortizations.totalInterest;
  let remainingSavings =
    Math.round(Math.max(0, previousInterest - result.totalInterest) * 100) / 100;
  const includedIds = new Set<string>();
  for (const { item } of orderedAmortizations) {
    includedIds.add(item.id);
    const partialScenario = calculateSchedule(
      mortgage,
      {
        ...scenario,
        amortizations: scenario.amortizations.map((candidate) => ({
          ...candidate,
          active: candidate.active && includedIds.has(candidate.id),
        })),
      },
      true,
    );
    const marginalSavings =
      Math.round(Math.max(0, previousInterest - partialScenario.totalInterest) * 100) / 100;
    const savings = Math.min(remainingSavings, marginalSavings);
    savingsById.set(item.id, savings);
    remainingSavings -= savings;
    previousInterest = partialScenario.totalInterest;
  }
  const amortizationInterestSavings = activeAmortizations.map((item) => ({
    id: item.id,
    savings: savingsById.get(item.id) ?? 0,
  }));
  return {
    ...result,
    amortizationSavings: Math.max(0, withoutAmortizations.totalInterest - result.totalInterest),
    amortizationInterestSavings,
    annualPercentageRate: annualPercentageRate(mortgage.amount, cashFlows),
  };
}

/**
 * Coste financiero (intereses más bonificaciones) por cada 100 € prestados.
 * Permite comparar ofertas con distinto capital.
 */
export function relativeCostPer100(
  mortgage: Pick<Mortgage, 'amount'>,
  result: Pick<MortgageResult, 'totalInterest' | 'bonusCost'>,
): number {
  if (mortgage.amount <= 0) return 0;
  return ((result.totalInterest + result.bonusCost) / mortgage.amount) * 100;
}

function isCalculable(mortgage: Mortgage): boolean {
  return (
    Number.isFinite(mortgage.amount) &&
    Number.isFinite(mortgage.interestRate) &&
    Number.isFinite(mortgage.years) &&
    mortgage.years >= 1 &&
    mortgage.years <= MAX_TERM_YEARS &&
    Number.isInteger(mortgage.years * 12)
  );
}

function isFiniteResult(
  result: Pick<
    MortgageResult,
    'firstPayment' | 'totalInterest' | 'bonusCost' | 'totalCost' | 'remainingCapital'
  >,
): boolean {
  return [
    result.firstPayment,
    result.totalInterest,
    result.bonusCost,
    result.totalCost,
    result.remainingCapital,
  ].every((value) => Number.isFinite(value));
}

function emptyResult(): MortgageResult {
  return {
    rows: [],
    firstPayment: 0,
    totalInterest: 0,
    bonusCost: 0,
    totalCost: 0,
    remainingCapital: 0,
    amortizationSavings: 0,
    amortizationInterestSavings: [],
    rateCapped: false,
    annualPercentageRate: 0,
  };
}

/**
 * TAE aproximada (en %): tipo mensual que iguala el capital recibido con los
 * flujos mensuales pagados (cuotas, amortizaciones y coste de bonificaciones).
 */
function annualPercentageRate(amount: number, cashFlows: number[]): number {
  if (amount <= 0 || cashFlows.length === 0) return 0;
  const presentValue = (monthlyRate: number): number => {
    let total = 0;
    let discount = 1;
    for (const flow of cashFlows) {
      discount /= 1 + monthlyRate;
      total += flow * discount;
    }
    return total;
  };
  if (presentValue(0) <= amount) return 0;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (presentValue(middle) > amount) low = middle;
    else high = middle;
  }
  const monthlyRate = (low + high) / 2;
  return ((1 + monthlyRate) ** 12 - 1) * 100;
}

export function createId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
