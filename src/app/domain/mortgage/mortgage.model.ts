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
