import { Mortgage } from './mortgage-calculator';
import { STORAGE_KEY, loadMortgages, parseMortgageFile, serializeMortgages } from './mortgage-storage';

const base: Mortgage = {
  id: 'oferta-1',
  name: 'Fija bonificada',
  bank: 'Banco Central',
  amount: 180000,
  years: 25,
  interestRate: 3.1,
  rateType: 'fixed',
  startDate: '2026-01-01',
  bonuses: [
    { id: 'b1', name: 'Nómina', active: true, interestReduction: 0.5, annualCost: 120, startMonth: 1, endMonth: 120 },
    { id: 'b2', name: 'Seguro hogar', active: false, interestReduction: 0.2, annualCost: 0 },
  ],
  amortizations: [
    { id: 'a1', name: 'Extra', active: true, type: 'single', reductionType: 'term', amount: 5000, month: 24 },
    { id: 'a2', name: 'Anual', active: true, type: 'recurring', reductionType: 'payment', amount: 1000, month: 12, frequencyMonths: 12 },
  ],
  updatedAt: '2026-02-01T10:00:00.000Z',
};

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('mortgage-storage: ida y vuelta de exportación (F5)', () => {
  it('reimporta exactamente lo que se exporta', () => {
    const result = parseMortgageFile(serializeMortgages([base]));

    expect(result).toEqual({ ok: true, value: [base] });
  });

  it('reimporta ofertas con bonificaciones de fin y amortizaciones recurrentes', () => {
    const offers = [base, { ...base, id: 'oferta-2', name: 'Variable', rateType: 'variable' as const }];

    expect(parseMortgageFile(serializeMortgages(offers))).toEqual({ ok: true, value: offers });
  });

  it('distingue un JSON mal formado de una oferta inválida', () => {
    const result = parseMortgageFile('{ esto no es json');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no es un JSON válido');
  });

  it('explica qué oferta es inválida y por qué', () => {
    const broken = {
      ...base,
      name: 'Mi oferta',
      bonuses: [{ ...base.bonuses[0], startMonth: 50, endMonth: 10 }],
    };
    const result = parseMortgageFile(serializeMortgages([broken]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Oferta inválida «Mi oferta»');
      expect(result.error).toContain('Nómina');
    }
  });

  it('rechaza un plazo mayor de 50 años al importar', () => {
    const result = parseMortgageFile(serializeMortgages([{ ...base, years: 200 }]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Oferta inválida «Fija bonificada»');
  });

  it('rechaza identificadores duplicados', () => {
    const result = parseMortgageFile(serializeMortgages([base, { ...base, name: 'Otra' }]));

    expect(result.ok).toBe(false);
  });
});

describe('mortgage-storage: carga desde localStorage (F6)', () => {
  const now = 1_700_000_000_000;
  const backupKey = `${STORAGE_KEY}-backup-${now}`;

  it('carga las ofertas válidas, descarta la corrupta y guarda una copia de seguridad', () => {
    const corrupt = { ...base, id: 'oferta-3', amount: 'abc' };
    const raw = JSON.stringify({ mortgages: [base, { ...base, id: 'oferta-2' }, corrupt] });
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages.map((item) => item.id)).toEqual(['oferta-1', 'oferta-2']);
    expect(loaded.notice).toBe('Se recuperaron 2 de 3 ofertas. Se guardó una copia de seguridad.');
    expect(storage.data.get(backupKey)).toBe(raw);
  });

  it('conserva la copia cuando el JSON completo no se puede leer', () => {
    const raw = '{ "mortgages": [ roto';
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([]);
    expect(loaded.notice).toBe('No se pudo leer los datos guardados. Se guardó una copia de seguridad.');
    expect(storage.data.get(backupKey)).toBe(raw);
  });

  it('no crea copia de seguridad si todas las ofertas son válidas', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: serializeMortgages([base]) });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([base]);
    expect(loaded.notice).toBeNull();
    expect(storage.data.has(backupKey)).toBe(false);
  });

  it('devuelve una lista vacía sin avisos cuando no hay datos guardados', () => {
    expect(loadMortgages(fakeStorage(), now)).toEqual({ mortgages: [], notice: null });
  });
});
