import { Amortization, Bonus, Mortgage } from './mortgage-calculator';
import { validateMortgage } from './mortgage-validation';

export const STORAGE_KEY = 'hipoteca-comparador-v1';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LoadResult {
  mortgages: Mortgage[];
  notice: string | null;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function serializeMortgages(mortgages: Mortgage[]): string {
  return JSON.stringify({ mortgages }, null, 2);
}

export function parseMortgageFile(text: string): ParseResult<Mortgage[]> {
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!isRecord(content) || !Array.isArray(content['mortgages'])) {
    return { ok: false, error: 'El archivo no contiene una lista de ofertas.' };
  }
  const mortgages: Mortgage[] = [];
  for (const [index, item] of content['mortgages'].entries()) {
    const result = parseMortgage(item, index);
    if (!result.ok) return result;
    mortgages.push(result.value);
  }
  if (new Set(mortgages.map((mortgage) => mortgage.id)).size !== mortgages.length) {
    return { ok: false, error: 'Hay ofertas con el mismo identificador.' };
  }
  return { ok: true, value: mortgages };
}

export function loadMortgages(storage: StorageLike, now: number = Date.now()): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { mortgages: [], notice: 'No se pudo acceder al almacenamiento de este dispositivo.' };
  }
  if (raw === null) return { mortgages: [], notice: null };

  const backupKey = `${STORAGE_KEY}-backup-${now}`;
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['mortgages'])) {
    keepBackup(storage, backupKey, raw);
    return {
      mortgages: [],
      notice: 'No se pudo leer los datos guardados. Se guardó una copia de seguridad.',
    };
  }

  const total = parsed['mortgages'].length;
  const mortgages: Mortgage[] = [];
  const seenIds = new Set<string>();
  parsed['mortgages'].forEach((item, index) => {
    const result = parseMortgage(item, index);
    if (result.ok && !seenIds.has(result.value.id)) {
      seenIds.add(result.value.id);
      mortgages.push(result.value);
    }
  });
  if (mortgages.length === total) return { mortgages, notice: null };

  keepBackup(storage, backupKey, raw);
  try {
    storage.setItem(STORAGE_KEY, serializeMortgages(mortgages));
  } catch {
    // La copia de seguridad ya está guardada; la lista recuperada se usa en memoria.
  }
  const noun = total === 1 ? 'oferta' : 'ofertas';
  return {
    mortgages,
    notice: `Se recuperaron ${mortgages.length} de ${total} ${noun}. Se guardó una copia de seguridad.`,
  };
}

function parseMortgage(value: unknown, position: number): ParseResult<Mortgage> {
  if (!isRecord(value) || typeof value['id'] !== 'string' || value['id'].trim() === '') {
    return { ok: false, error: `Oferta inválida en la posición ${position + 1}: falta el identificador.` };
  }
  const label =
    typeof value['name'] === 'string' && value['name'].trim()
      ? value['name'].trim()
      : `#${position + 1}`;
  const invalid = (reason: string): ParseResult<Mortgage> => ({
    ok: false,
    error: `Oferta inválida «${label}»: ${reason}`,
  });

  if (!Array.isArray(value['bonuses']) || !Array.isArray(value['amortizations'])) {
    return invalid('faltan las listas de bonificaciones o amortizaciones.');
  }

  const bonuses: Bonus[] = [];
  for (const item of value['bonuses']) {
    if (!isRecord(item) || typeof item['id'] !== 'string' || typeof item['active'] !== 'boolean') {
      return invalid('una bonificación no tiene el formato esperado.');
    }
    bonuses.push({
      id: item['id'],
      name: item['name'] as string,
      active: item['active'],
      interestReduction: item['interestReduction'] as number,
      annualCost: item['annualCost'] as number,
      ...(item['startMonth'] != null ? { startMonth: item['startMonth'] as number } : {}),
      ...(item['endMonth'] != null ? { endMonth: item['endMonth'] as number } : {}),
    });
  }

  const amortizations: Amortization[] = [];
  for (const [index, item] of value['amortizations'].entries()) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      (item['type'] !== 'single' && item['type'] !== 'recurring')
    ) {
      return invalid('una amortización no tiene el formato esperado.');
    }
    amortizations.push({
      id: item['id'],
      name:
        typeof item['name'] === 'string' && item['name'].trim()
          ? item['name'].trim()
          : `Amortización ${index + 1}`,
      active: typeof item['active'] === 'boolean' ? item['active'] : true,
      type: item['type'],
      reductionType: item['reductionType'] === 'term' ? 'term' : 'payment',
      amount: item['amount'] as number,
      month: item['month'] as number,
      ...(typeof item['frequencyMonths'] === 'number'
        ? { frequencyMonths: item['frequencyMonths'] }
        : {}),
    });
  }

  const candidate: Mortgage = {
    id: value['id'],
    name: value['name'] as string,
    bank: value['bank'] as string,
    amount: value['amount'] as number,
    years: value['years'] as number,
    interestRate: value['interestRate'] as number,
    rateType: value['rateType'] === 'variable' ? 'variable' : 'fixed',
    ...(typeof value['startDate'] === 'string' ? { startDate: value['startDate'] } : {}),
    bonuses,
    amortizations,
    updatedAt:
      typeof value['updatedAt'] === 'string' ? value['updatedAt'] : new Date().toISOString(),
  };

  const error = validateMortgage(candidate);
  return error ? invalid(error) : { ok: true, value: candidate };
}

function keepBackup(storage: StorageLike, key: string, raw: string): void {
  try {
    storage.setItem(key, raw);
  } catch {
    // Sin espacio disponible no hay copia; el aviso al usuario se mantiene.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
