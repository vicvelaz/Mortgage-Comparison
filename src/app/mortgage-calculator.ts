import { MAX_TERM_YEARS } from './mortgage-constants';

export const RECURRING_OVERFLOW_POLICY: 'cap' | 'error' = 'cap';

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

export interface FeeTier {
  fromMonth: number;
  toMonth?: number;
  percent: number;
}

export interface CancellationFees {
  partial: FeeTier[];
  total: FeeTier[];
}

export interface MonthlyBudget {
  amount: number;
  startMonth: number;
  endMonth?: number;
}

export type AmortizationMode = 'reduceInstallment' | 'reduceTerm';

export interface AmortizationEvent {
  id: string;
  name: string;
  amount: number;
  fee: number;
  totalCancellation: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  bonuses: Bonus[];
  amortizations: Amortization[];
  monthlyBudget?: MonthlyBudget;
  mode: AmortizationMode;
}

export interface Mortgage {
  id: string;
  name: string;
  bank: string;
  amount: number;
  years: number;
  interestRate: number;
  rateType: 'fixed' | 'variable';
  cancellationFees: CancellationFees;
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
  fee: number;
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
  amortizationFees: number;
  totalCost: number;
  remainingCapital: number;
  amortizationSavings: number;
  totalCancellationMonth: number | null;
  recurringCancellationMonth: number | null;
  monthlyBudgetCancellationMonth: number | null;
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
  excludedAmortizationId?: string,
): Amortization[] {
  if (!enabled) return [];
  return scenario.amortizations.filter((item) => {
    if (!item.active || item.id === excludedAmortizationId) return false;
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

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(value * 100);
  return Number.isFinite(cents) ? cents : Math.sign(value) * Number.MAX_SAFE_INTEGER;
}

function fromCents(value: number): number {
  return value / 100;
}

function roundCents(value: number): number {
  return fromCents(toCents(value));
}

function feePercent(mortgage: Mortgage, month: number, total: boolean): number {
  const tiers = total ? mortgage.cancellationFees?.total : mortgage.cancellationFees?.partial;
  const tier = tiers?.find(
    (item) => month >= item.fromMonth && month <= (item.toMonth ?? Infinity),
  );
  return tier && Number.isFinite(tier.percent) && tier.percent >= 0 ? tier.percent : 0;
}

type ScheduleResult = Omit<
  MortgageResult,
  'amortizationSavings' | 'amortizationInterestSavings' | 'annualPercentageRate'
> & { cashFlows: number[] };

function calculateSchedule(
  mortgage: Mortgage,
  scenario: Scenario,
  includeAmortizations: boolean,
  maxMonth: number = mortgage.years * 12,
  excludedAmortizationId?: string,
): ScheduleResult {
  const plannedMonths = mortgage.years * 12;
  if (!Number.isInteger(plannedMonths) || plannedMonths < 1) {
    throw new RangeError('Mortgage term must contain a whole number of months');
  }
  let remaining = Math.max(0, mortgage.amount);
  let totalInterest = 0;
  let bonusCost = 0;
  let amortizationFees = 0;
  let cumulativePrincipal = 0;
  let fixedPayment: number | null = null;
  let previousMonthlyRate: number | null = null;
  let rateCapped = false;
  let totalCancellationMonth: number | null = null;
  let recurringCancellationMonth: number | null = null;
  let monthlyBudgetCancellationMonth: number | null = null;
  let monthlyBudgetApplied = false;
  const cashFlows: number[] = [];
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= Math.min(plannedMonths, maxMonth) && remaining > 0; month += 1) {
    const { reduction, cost } = bonusForMonth(scenario, month);
    if (reduction > mortgage.interestRate) rateCapped = true;
    const annualRate = Math.max(0, mortgage.interestRate - reduction);
    const monthlyRate = annualRate / 100 / 12;
    const interest = remaining * monthlyRate;
    const monthsLeft = plannedMonths - month + 1;
    const rateChanged = previousMonthlyRate !== null && monthlyRate !== previousMonthlyRate;
    const repricePayment =
      rateChanged && (mortgage.rateType === 'variable' || scenario.mode === 'reduceTerm');
    const scheduledPayment = Math.min(
      remaining + interest,
      fixedPayment === null || repricePayment
        ? monthlyPayment(remaining, monthlyRate, monthsLeft)
        : Math.max(fixedPayment, interest + Math.min(remaining, 0.01)),
    );
    const scheduledPrincipal = Math.min(remaining, scheduledPayment - interest);
    remaining -= scheduledPrincipal;
    const amortizationEvents: AmortizationEvent[] = [];
    const monthAmortizations = amortizationsForMonth(
      scenario,
      month,
      includeAmortizations,
      excludedAmortizationId,
    );
    const budget = scenario.monthlyBudget;
    if (
      includeAmortizations &&
      budget &&
      month >= budget.startMonth &&
      month <= (budget.endMonth ?? Infinity)
    ) {
      const availableCents = toCents(budget.amount) - toCents(interest + scheduledPrincipal);
      if (availableCents > 0 && toCents(remaining) > 0) {
        const partialFeePercent = feePercent(mortgage, month, false);
        const principalCents = Math.round(availableCents / (1 + partialFeePercent / 100));
        if (principalCents > 0) {
          monthAmortizations.push({
            id: 'monthly-budget',
            name: 'Cantidad mensual dedicada',
            active: true,
            type: 'single',
            reductionType: scenario.mode === 'reduceTerm' ? 'term' : 'payment',
            amount: fromCents(principalCents),
            month,
          });
        }
      }
    }
    monthAmortizations.sort(
      (left, right) =>
        Number(left.reductionType === 'term') - Number(right.reductionType === 'term'),
    );
    let nextPayment: number =
      fixedPayment === null || repricePayment ? scheduledPayment : fixedPayment;
    let extraPayment = 0;
    let fee = 0;
    for (const item of monthAmortizations) {
      const requestedCents = toCents(item.amount);
      const balanceCents = toCents(remaining);
      if (requestedCents <= 0 || balanceCents <= 0) continue;
      const totalCancellation = requestedCents >= balanceCents;
      const amount = totalCancellation ? remaining : Math.min(remaining, fromCents(requestedCents));
      if (amount <= 0) continue;
      const percent = feePercent(mortgage, month, totalCancellation);
      const eventFee = roundCents((amount * percent) / 100);
      remaining = totalCancellation ? 0 : Math.max(0, remaining - amount);
      if (item.id === 'monthly-budget') monthlyBudgetApplied = true;
      extraPayment += amount;
      fee += eventFee;
      amortizationEvents.push({
        id: item.id,
        name: item.name,
        amount,
        fee: eventFee,
        totalCancellation,
      });
      if (totalCancellation) {
        totalCancellationMonth ??= month;
        if (item.type === 'recurring') recurringCancellationMonth ??= month;
        if (item.id === 'monthly-budget') monthlyBudgetCancellationMonth ??= month;
      }
      if (item.reductionType === 'payment' && monthsLeft > 1 && remaining > 0) {
        nextPayment = monthlyPayment(remaining, monthlyRate, monthsLeft - 1);
      }
    }
    if (monthAmortizations.length > 0) fixedPayment = nextPayment;
    else if (repricePayment) fixedPayment = scheduledPayment;
    previousMonthlyRate = monthlyRate;
    const principal = scheduledPrincipal + extraPayment;
    remaining = Math.max(0, remaining);
    if (remaining < 1e-8) remaining = 0;
    if (remaining === 0 && monthlyBudgetApplied) {
      monthlyBudgetCancellationMonth ??= month;
    }
    totalInterest += interest;
    bonusCost += cost;
    amortizationFees += fee;
    cumulativePrincipal += principal;
    cashFlows.push(interest + scheduledPrincipal + extraPayment + cost + fee);

    rows.push({
      month,
      payment: interest + scheduledPrincipal,
      interest,
      principal,
      extraPayment,
      fee,
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
    amortizationFees,
    totalCost: mortgage.amount - remaining + totalInterest + bonusCost + amortizationFees,
    remainingCapital: remaining,
    totalCancellationMonth,
    recurringCancellationMonth,
    monthlyBudgetCancellationMonth,
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
    amortizationSavings: withoutAmortizations.totalCost - result.totalCost,
    amortizationInterestSavings,
    annualPercentageRate: annualPercentageRate(mortgage.amount, cashFlows),
  };
}

export function maxAmortizableAt(
  mortgage: Mortgage,
  scenario: Scenario,
  month: number,
  excludingAmortizationId?: string,
): number {
  if (!isCalculable(mortgage) || !Number.isInteger(month) || month < 1) return 0;
  const result = calculateSchedule(mortgage, scenario, true, month, excludingAmortizationId);
  const row = result.rows.find((item) => item.month === month);
  return row ? toCents(row.remainingCapital) : 0;
}

/**
 * Coste financiero (intereses más bonificaciones) por cada 100 € prestados.
 * Permite comparar ofertas con distinto capital.
 */
export function relativeCostPer100(
  mortgage: Pick<Mortgage, 'amount'>,
  result: Pick<MortgageResult, 'totalInterest' | 'bonusCost' | 'amortizationFees'>,
): number {
  if (mortgage.amount <= 0) return 0;
  return (
    ((result.totalInterest + result.bonusCost + result.amortizationFees) / mortgage.amount) * 100
  );
}

function isCalculable(mortgage: Mortgage): boolean {
  return (
    Number.isFinite(mortgage.amount) &&
    Number.isFinite(mortgage.interestRate) &&
    Number.isFinite(mortgage.years) &&
    mortgage.amount >= 0 &&
    mortgage.interestRate >= 0 &&
    mortgage.years >= 1 &&
    mortgage.years <= MAX_TERM_YEARS &&
    Number.isInteger(mortgage.years * 12)
  );
}

function isFiniteResult(
  result: Pick<
    MortgageResult,
    | 'firstPayment'
    | 'totalInterest'
    | 'bonusCost'
    | 'amortizationFees'
    | 'totalCost'
    | 'remainingCapital'
  >,
): boolean {
  return [
    result.firstPayment,
    result.totalInterest,
    result.bonusCost,
    result.amortizationFees,
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
    amortizationFees: 0,
    totalCost: 0,
    remainingCapital: 0,
    amortizationSavings: 0,
    totalCancellationMonth: null,
    recurringCancellationMonth: null,
    monthlyBudgetCancellationMonth: null,
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
