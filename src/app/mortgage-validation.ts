import { maxAmortizableAt, RECURRING_OVERFLOW_POLICY } from './mortgage-calculator';
import type { Mortgage, Scenario } from './mortgage-calculator';
import { MAX_TERM_YEARS } from './mortgage-constants';

export { MAX_TERM_YEARS } from './mortgage-constants';

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
  cancellationFees?: unknown;
  scenarios?: readonly ScenarioFields[];
}

export interface ScenarioFields {
  name: unknown;
  bonuses?: readonly BonusFields[];
  amortizations?: readonly AmortizationFields[];
  monthlyBudget?: unknown;
  mode?: unknown;
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
  if (mortgage.cancellationFees !== undefined) {
    const error = validateCancellationFees(mortgage.cancellationFees);
    if (error) return error;
  }
  if (!mortgage.scenarios?.length) return 'La hipoteca debe tener al menos un escenario.';
  for (const scenario of mortgage.scenarios) {
    if (!text(scenario.name)) return 'Indica un nombre para cada escenario.';
    if (!Array.isArray(scenario.bonuses) || !Array.isArray(scenario.amortizations)) {
      return `El escenario «${text(scenario.name)}» debe incluir las listas de bonificaciones y amortizaciones.`;
    }
    for (const bonus of scenario.bonuses ?? []) {
      const error = validateBonus(bonus);
      if (error) return error;
    }
    for (const item of scenario.amortizations ?? []) {
      const error = validateAmortization(item);
      if (error) return error;
    }
    const error = validateScenario(mortgage as Mortgage, scenario as Scenario);
    if (error) return `En el escenario «${text(scenario.name)}»: ${error}`;
  }
  return null;
}

export function validateCancellationFees(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value['partial']) || !Array.isArray(value['total'])) {
    return 'Las comisiones deben incluir tramos parciales y totales.';
  }
  for (const [label, tiers] of [
    ['parciales', value['partial']],
    ['totales', value['total']],
  ] as const) {
    const ordered: { fromMonth: number; toMonth: number }[] = [];
    for (const tier of tiers) {
      if (!isRecord(tier)) return `Un tramo de comisiones ${label} no tiene un formato válido.`;
      const { fromMonth, toMonth, percent } = tier;
      if (!isWholeNumber(fromMonth, 1)) {
        return `El mes de inicio de un tramo de comisiones ${label} debe ser un entero de 1 o más.`;
      }
      if (toMonth !== undefined && toMonth !== null && !isWholeNumber(toMonth, 1)) {
        return `El mes final de un tramo de comisiones ${label} debe ser un entero de 1 o más, o quedar vacío.`;
      }
      if (!isNonNegative(percent)) {
        return `El porcentaje de un tramo de comisiones ${label} debe ser igual o superior a 0.`;
      }
      if (toMonth !== undefined && toMonth !== null && toMonth < fromMonth) {
        return `El mes final de un tramo de comisiones ${label} no puede ser anterior al de inicio.`;
      }
      ordered.push({ fromMonth, toMonth: toMonth ?? Infinity });
    }
    ordered.sort((left, right) => left.fromMonth - right.fromMonth);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (current.fromMonth <= previous.toMonth) {
        const end = Math.min(current.toMonth, previous.toMonth);
        const overlap =
          current.fromMonth === end
            ? `el mes ${current.fromMonth}`
            : `los meses ${current.fromMonth}–${Number.isFinite(end) ? end : 'fin'}`;
        return `Los tramos de comisiones ${label} se solapan en ${overlap}.`;
      }
    }
  }
  return null;
}

export function validateScenario(
  mortgage: Mortgage,
  scenario: Scenario,
  changedAmortizationId?: string,
): string | null {
  if (
    scenario.mode !== undefined &&
    scenario.mode !== 'reduceInstallment' &&
    scenario.mode !== 'reduceTerm'
  ) {
    return 'El modo de amortización no es válido.';
  }
  if (scenario.monthlyBudget !== undefined) {
    const error = validateMonthlyBudget(scenario.monthlyBudget);
    if (error) return error;
  }
  const singles = scenario.amortizations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.active && item.type === 'single')
    .sort(
      (left, right) =>
        left.item.month - right.item.month ||
        Number(left.item.reductionType === 'term') - Number(right.item.reductionType === 'term') ||
        left.index - right.index,
    );
  const acceptedIds = new Set<string>();

  for (const { item } of singles) {
    const precedingEvents: Scenario = {
      ...scenario,
      amortizations: scenario.amortizations.map((candidate) => ({
        ...candidate,
        active:
          candidate.active && (candidate.type === 'recurring' || acceptedIds.has(candidate.id)),
      })),
    };
    const maximumCents = maxAmortizableAt(mortgage, precedingEvents, item.month, item.id);
    const requestedCents = moneyToCents(item.amount);
    if (maximumCents === 0 && requestedCents > 0) {
      return `La hipoteca ya está cancelada o termina antes del mes ${item.month}.`;
    }
    if (requestedCents > maximumCents) {
      if (changedAmortizationId === item.id) {
        return `No puedes amortizar más de lo que queda por pagar. Capital restante en el mes ${item.month}: ${formatEuros(maximumCents)}.`;
      }
      if (changedAmortizationId) {
        return `Este cambio dejaría la amortización del mes ${item.month} por encima del capital restante.`;
      }
      return `La amortización del mes ${item.month} supera el capital restante (${formatEuros(maximumCents)}).`;
    }
    acceptedIds.add(item.id);
  }

  if (RECURRING_OVERFLOW_POLICY === 'error') {
    for (const item of scenario.amortizations) {
      if (!item.active || item.type !== 'recurring') continue;
      const frequency = isWholeNumber(item.frequencyMonths, 1)
        ? item.frequencyMonths
        : mortgage.years * 12 + 1;
      for (let month = item.month; month <= mortgage.years * 12; month += frequency) {
        const precedingEvents: Scenario = {
          ...scenario,
          amortizations: scenario.amortizations.map((candidate) => ({
            ...candidate,
            ...(candidate.id === item.id ? { month: month + frequency } : {}),
            active:
              candidate.active &&
              (candidate.id === item.id ||
                (candidate.type === 'single' && acceptedIds.has(candidate.id))),
          })),
        };
        const maximumCents = maxAmortizableAt(mortgage, precedingEvents, month);
        if (moneyToCents(item.amount) > maximumCents) {
          return `La amortización periódica supera el capital restante en el mes ${month}.`;
        }
      }
    }
  }
  return null;
}

export function validateMonthlyBudget(value: unknown): string | null {
  if (!isRecord(value)) return 'La cantidad mensual dedicada no tiene un formato válido.';
  if (!isPositive(value['amount'])) {
    return 'La cantidad mensual dedicada debe ser un número mayor que 0.';
  }
  if (!isWholeNumber(value['startMonth'], 1)) {
    return 'El mes inicial de la cantidad mensual debe ser un número entero de 1 o más.';
  }
  const endMonth = value['endMonth'];
  if (endMonth === undefined || endMonth === null) return null;
  if (!isWholeNumber(endMonth, 1)) {
    return 'El mes final de la cantidad mensual debe ser un número entero de 1 o más, o quedar vacío.';
  }
  if (endMonth < value['startMonth']) {
    return 'El mes final de la cantidad mensual no puede ser anterior al mes inicial.';
  }
  return null;
}

function moneyToCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
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
  if (!isPositive(item.amount))
    return 'El importe de la amortización debe ser un número mayor que 0.';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
