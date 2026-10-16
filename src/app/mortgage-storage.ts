import {
  Amortization,
  Bonus,
  CancellationFees,
  FeeTier,
  Mortgage,
  Scenario,
  createId,
} from './mortgage-calculator';
import { validateCancellationFees, validateMortgage } from './mortgage-validation';

export const STORAGE_KEY = 'hipoteca-comparador-v2';
export const LEGACY_STORAGE_KEY = 'hipoteca-comparador-v1';
export const LEGACY_BACKUP_KEY = 'hipoteca-comparador-v1-backup';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LoadResult {
  mortgages: Mortgage[];
  notice: string | null;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

interface StoredEnvelope {
  schemaVersion: 1 | 2;
  mortgages: unknown[];
}

export function serializeMortgages(mortgages: Mortgage[]): string {
  return JSON.stringify({ schemaVersion: 2, mortgages }, null, 2);
}

export function parseMortgageFile(text: string): ParseResult<Mortgage[]> {
  const envelope = parseEnvelope(text);
  if (!envelope.ok) return envelope;

  const mortgages: Mortgage[] = [];
  const seenIds = new Set<string>();
  for (const [index, item] of envelope.value.mortgages.entries()) {
    const result = parseMortgage(item, index, envelope.value.schemaVersion);
    if (!result.ok) return result;
    if (seenIds.has(result.value.id)) {
      return { ok: false, error: 'Hay ofertas con el mismo identificador.' };
    }
    seenIds.add(result.value.id);
    mortgages.push(result.value);
  }
  return { ok: true, value: mortgages };
}

export function loadMortgages(storage: StorageLike, now: number = Date.now()): LoadResult {
  let currentRaw: string | null;
  try {
    currentRaw = storage.getItem(STORAGE_KEY);
  } catch {
    return { mortgages: [], notice: 'No se pudo acceder al almacenamiento de este dispositivo.' };
  }
  if (currentRaw !== null) {
    return loadCurrentVersion(storage, currentRaw, now);
  }

  let legacyRaw: string | null;
  try {
    legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { mortgages: [], notice: 'No se pudo acceder al almacenamiento de este dispositivo.' };
  }
  if (legacyRaw === null) return { mortgages: [], notice: null };

  if (!keepBackup(storage, LEGACY_BACKUP_KEY, legacyRaw)) {
    return {
      mortgages: [],
      notice: 'No se pudo guardar una copia de seguridad de los datos v1; no se migraron.',
    };
  }
  const migrated = parseStoredMortgages(legacyRaw, now);
  if (!migrated.ok) {
    return {
      mortgages: [],
      notice: 'No se pudieron leer los datos v1. Se conservó una copia de seguridad.',
    };
  }
  try {
    storage.setItem(STORAGE_KEY, serializeMortgages(migrated.mortgages));
  } catch {
    return {
      mortgages: migrated.mortgages,
      notice: 'Los datos v1 se leyeron, pero no se pudo guardar la migración a v2.',
    };
  }
  if (migrated.rejected > 0) {
    const noun = migrated.total === 1 ? 'oferta' : 'ofertas';
    return {
      mortgages: migrated.mortgages,
      notice: `Se recuperaron ${migrated.mortgages.length} de ${migrated.total} ${noun}. Se guardó una copia de seguridad.`,
    };
  }
  return {
    mortgages: migrated.mortgages,
    notice: 'Datos migrados a v2. Se guardó una copia de seguridad.',
  };
}

function loadCurrentVersion(storage: StorageLike, raw: string, now: number): LoadResult {
  const parsed = parseStoredMortgages(raw, now);
  if (!parsed.ok) {
    const backedUp = keepBackup(storage, `${STORAGE_KEY}-backup-${now}`, raw);
    return {
      mortgages: [],
      notice: backedUp
        ? 'No se pudo leer los datos guardados. Se guardó una copia de seguridad.'
        : 'No se pudo leer los datos guardados y no se pudo guardar una copia de seguridad; el original se conserva.',
    };
  }
  if (parsed.rejected === 0) return { mortgages: parsed.mortgages, notice: null };

  if (!keepBackup(storage, `${STORAGE_KEY}-backup-${now}`, raw)) {
    const noun = parsed.total === 1 ? 'oferta' : 'ofertas';
    return {
      mortgages: parsed.mortgages,
      notice: `Se recuperaron ${parsed.mortgages.length} de ${parsed.total} ${noun}, pero no se pudo guardar una copia de seguridad; el original se conserva.`,
    };
  }
  try {
    storage.setItem(STORAGE_KEY, serializeMortgages(parsed.mortgages));
  } catch {
    // La copia original se conserva; la lista recuperada se usa en memoria.
  }
  const noun = parsed.total === 1 ? 'oferta' : 'ofertas';
  return {
    mortgages: parsed.mortgages,
    notice: `Se recuperaron ${parsed.mortgages.length} de ${parsed.total} ${noun}. Se guardó una copia de seguridad.`,
  };
}

function parseStoredMortgages(
  raw: string,
  now: number,
): { ok: true; mortgages: Mortgage[]; total: number; rejected: number } | { ok: false } {
  const envelope = parseEnvelope(raw);
  if (!envelope.ok) return { ok: false };

  const total = envelope.value.mortgages.length;
  const mortgages: Mortgage[] = [];
  const seenIds = new Set<string>();
  for (const [index, item] of envelope.value.mortgages.entries()) {
    const result = parseMortgage(item, index, envelope.value.schemaVersion, now);
    if (!result.ok || seenIds.has(result.value.id)) continue;
    seenIds.add(result.value.id);
    mortgages.push(result.value);
  }
  return { ok: true, mortgages, total, rejected: total - mortgages.length };
}

function parseEnvelope(text: string): ParseResult<StoredEnvelope> {
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!isRecord(content) || !Array.isArray(content['mortgages'])) {
    return { ok: false, error: 'El archivo no contiene una lista de ofertas.' };
  }
  const declaredVersion = content['schemaVersion'];
  const schemaVersion = declaredVersion === undefined ? 1 : declaredVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    return { ok: false, error: 'La versión del esquema no es compatible.' };
  }
  return { ok: true, value: { schemaVersion, mortgages: content['mortgages'] } };
}

function parseMortgage(
  value: unknown,
  position: number,
  schemaVersion: 1 | 2,
  now: number = Date.now(),
): ParseResult<Mortgage> {
  if (!isRecord(value) || typeof value['id'] !== 'string' || value['id'].trim() === '') {
    return {
      ok: false,
      error: `Oferta inválida en la posición ${position + 1}: falta el identificador.`,
    };
  }
  const label =
    typeof value['name'] === 'string' && value['name'].trim()
      ? value['name'].trim()
      : `#${position + 1}`;
  const invalid = (reason: string): ParseResult<Mortgage> => ({
    ok: false,
    error: `Oferta inválida «${label}»: ${reason}`,
  });

  let rawScenarios: unknown[];
  if (schemaVersion === 1) {
    if (!Array.isArray(value['bonuses']) || !Array.isArray(value['amortizations'])) {
      return invalid('faltan las listas de bonificaciones o amortizaciones.');
    }
    rawScenarios = [
      {
        id: createId(),
        name: 'Base',
        bonuses: value['bonuses'],
        amortizations: value['amortizations'],
      },
    ];
  } else if (Array.isArray(value['scenarios'])) {
    rawScenarios = value['scenarios'];
  } else {
    return invalid('falta la lista de escenarios.');
  }
  if (rawScenarios.length === 0) return invalid('debe contener al menos un escenario.');

  const scenarios: Scenario[] = [];
  const seenScenarioIds = new Set<string>();
  for (const [index, item] of rawScenarios.entries()) {
    const result = parseScenario(item, index, label);
    if (!result.ok) return result;
    if (seenScenarioIds.has(result.value.id))
      return invalid('hay escenarios con el mismo identificador.');
    seenScenarioIds.add(result.value.id);
    scenarios.push(result.value);
  }
  if (
    typeof value['name'] !== 'string' ||
    typeof value['bank'] !== 'string' ||
    typeof value['amount'] !== 'number' ||
    typeof value['years'] !== 'number' ||
    typeof value['interestRate'] !== 'number' ||
    (value['rateType'] !== 'fixed' && value['rateType'] !== 'variable')
  ) {
    return invalid('los datos comunes no tienen el formato esperado.');
  }

  const cancellationFees = parseCancellationFees(value['cancellationFees']);
  if (!cancellationFees.ok) return invalid(cancellationFees.error);
  const candidate: Mortgage = {
    id: value['id'],
    name: value['name'],
    bank: value['bank'],
    amount: value['amount'],
    years: value['years'],
    interestRate: value['interestRate'],
    rateType: value['rateType'],
    cancellationFees: cancellationFees.value,
    ...(typeof value['startDate'] === 'string' ? { startDate: value['startDate'] } : {}),
    scenarios,
    updatedAt:
      typeof value['updatedAt'] === 'string' ? value['updatedAt'] : new Date(now).toISOString(),
  };
  const error = validateMortgage(candidate);
  return error ? invalid(error) : { ok: true, value: candidate };
}

function parseCancellationFees(value: unknown): ParseResult<CancellationFees> {
  if (value === undefined) return { ok: true, value: { partial: [], total: [] } };
  if (!isRecord(value) || !Array.isArray(value['partial']) || !Array.isArray(value['total'])) {
    return { ok: false, error: 'las comisiones no tienen el formato esperado.' };
  }
  const parseTiers = (raw: unknown[]): ParseResult<FeeTier[]> => {
    const tiers: FeeTier[] = [];
    for (const item of raw) {
      if (
        !isRecord(item) ||
        typeof item['fromMonth'] !== 'number' ||
        typeof item['percent'] !== 'number' ||
        (item['toMonth'] !== undefined &&
          item['toMonth'] !== null &&
          typeof item['toMonth'] !== 'number')
      ) {
        return { ok: false, error: 'un tramo de comisiones no tiene el formato esperado.' };
      }
      tiers.push({
        fromMonth: item['fromMonth'],
        percent: item['percent'],
        ...(typeof item['toMonth'] === 'number' ? { toMonth: item['toMonth'] } : {}),
      });
    }
    return { ok: true, value: tiers };
  };
  const partial = parseTiers(value['partial']);
  if (!partial.ok) return partial;
  const total = parseTiers(value['total']);
  if (!total.ok) return total;
  const fees = { partial: partial.value, total: total.value };
  const error = validateCancellationFees(fees);
  return error ? { ok: false, error } : { ok: true, value: fees };
}

function parseScenario(
  value: unknown,
  position: number,
  mortgageName: string,
): ParseResult<Scenario> {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    value['id'].trim() === '' ||
    typeof value['name'] !== 'string' ||
    !Array.isArray(value['bonuses']) ||
    !Array.isArray(value['amortizations'])
  ) {
    return {
      ok: false,
      error: `Oferta inválida «${mortgageName}»: el escenario ${position + 1} no tiene el formato esperado.`,
    };
  }

  const bonuses: Bonus[] = [];
  for (const item of value['bonuses']) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['name'] !== 'string' ||
      typeof item['active'] !== 'boolean' ||
      typeof item['interestReduction'] !== 'number' ||
      typeof item['annualCost'] !== 'number' ||
      (item['startMonth'] !== undefined &&
        item['startMonth'] !== null &&
        typeof item['startMonth'] !== 'number') ||
      (item['endMonth'] !== undefined &&
        item['endMonth'] !== null &&
        typeof item['endMonth'] !== 'number')
    ) {
      return {
        ok: false,
        error: `Oferta inválida «${mortgageName}»: una bonificación no tiene el formato esperado.`,
      };
    }
    bonuses.push({
      id: item['id'],
      name: item['name'],
      active: item['active'],
      interestReduction: item['interestReduction'],
      annualCost: item['annualCost'],
      ...(typeof item['startMonth'] === 'number' ? { startMonth: item['startMonth'] } : {}),
      ...(typeof item['endMonth'] === 'number' ? { endMonth: item['endMonth'] } : {}),
    });
  }

  const amortizations: Amortization[] = [];
  for (const [index, item] of value['amortizations'].entries()) {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      (item['type'] !== 'single' && item['type'] !== 'recurring') ||
      typeof item['amount'] !== 'number' ||
      typeof item['month'] !== 'number' ||
      (item['frequencyMonths'] !== undefined && typeof item['frequencyMonths'] !== 'number')
    ) {
      return {
        ok: false,
        error: `Oferta inválida «${mortgageName}»: una amortización no tiene el formato esperado.`,
      };
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
      amount: item['amount'],
      month: item['month'],
      ...(typeof item['frequencyMonths'] === 'number'
        ? { frequencyMonths: item['frequencyMonths'] }
        : {}),
    });
  }
  return { ok: true, value: { id: value['id'], name: value['name'], bonuses, amortizations } };
}

function keepBackup(storage: StorageLike, key: string, raw: string): boolean {
  try {
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
