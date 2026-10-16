export const MAX_TERM_YEARS = 50;

export interface BonusFields {
  name: unknown;
  interestReduction: unknown;
  annualCost: unknown;
  startMonth?: unknown;
  endMonth?: unknown;
}

export interface AmortizationFields {
  amount: unknown;
  month: unknown;
  type?: unknown;
  frequencyMonths?: unknown;
}

export interface MortgageFields {
  name: unknown;
  bank: unknown;
  amount: unknown;
  years: unknown;
  interestRate: unknown;
  bonuses?: readonly BonusFields[];
  amortizations?: readonly AmortizationFields[];
}

export function validateMortgage(mortgage: MortgageFields): string | null {
  if (!text(mortgage.name)) return 'Indica un nombre para la oferta.';
  if (!text(mortgage.bank)) return 'Indica la entidad financiera.';
  if (!isPositive(mortgage.amount)) return 'El capital solicitado debe ser un número mayor que 0.';
  if (
    !isFiniteNumber(mortgage.years) ||
    mortgage.years < 1 ||
    mortgage.years > MAX_TERM_YEARS ||
    !Number.isInteger(mortgage.years * 12)
  ) {
    return `El plazo debe estar entre 1 y ${MAX_TERM_YEARS} años, con un número entero de meses.`;
  }
  if (!isNonNegative(mortgage.interestRate)) {
    return 'Indica un tipo de interés igual o superior a 0.';
  }
  for (const bonus of mortgage.bonuses ?? []) {
    const error = validateBonus(bonus);
    if (error) return error;
  }
  for (const item of mortgage.amortizations ?? []) {
    const error = validateAmortization(item);
    if (error) return error;
  }
  return null;
}

export function validateBonus(bonus: BonusFields): string | null {
  const name = text(bonus.name);
  if (!name) return 'Indica el nombre de la bonificación.';
  if (!isNonNegative(bonus.interestReduction)) {
    return `La reducción de «${name}» debe ser un número igual o superior a 0.`;
  }
  if (!isNonNegative(bonus.annualCost)) {
    return `El coste anual de «${name}» debe ser un número igual o superior a 0.`;
  }
  const start = bonus.startMonth === undefined ? 1 : bonus.startMonth;
  if (!isWholeNumber(start, 1)) {
    return `El mes de inicio de «${name}» debe ser un número entero de 1 o más.`;
  }
  if (bonus.endMonth === undefined || bonus.endMonth === null) return null;
  if (!isWholeNumber(bonus.endMonth, 1)) {
    return `El mes final de «${name}» debe ser un número entero de 1 o más, o quedar vacío.`;
  }
  if (bonus.endMonth < start) {
    return `El mes final de «${name}» no puede ser anterior al mes de inicio.`;
  }
  return null;
}

export function validateAmortization(item: AmortizationFields): string | null {
  if (!isPositive(item.amount)) return 'El importe de la amortización debe ser un número mayor que 0.';
  if (!isWholeNumber(item.month, 1)) {
    return 'El primer mes de la amortización debe ser un número entero de 1 o más.';
  }
  if (item.type === 'recurring' && !isWholeNumber(item.frequencyMonths, 1)) {
    return 'La frecuencia de la amortización periódica debe ser un número entero de meses de 1 o más.';
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}
