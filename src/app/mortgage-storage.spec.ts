import { Mortgage, Scenario, calculateMortgage, maxAmortizableAt } from './mortgage-calculator';
import {
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  loadMortgages,
  parseMortgageFile,
  serializeMortgages,
} from './mortgage-storage';

const base: Mortgage = {
  id: 'oferta-1',
  name: 'Fija bonificada',
  bank: 'Banco Central',
  amount: 180000,
  years: 25,
  interestRate: 3.1,
  rateType: 'fixed',
  cancellationFees: { partial: [], total: [] },
  startDate: '2026-01-01',
  scenarios: [
    {
      id: 'scenario-1',
      name: 'Base',
      bonuses: [
        {
          id: 'b1',
          name: 'Nómina',
          active: true,
          interestReduction: 0.5,
          annualCost: 120,
          startMonth: 1,
          endMonth: 120,
        },
        { id: 'b2', name: 'Seguro hogar', active: false, interestReduction: 0.2, annualCost: 0 },
      ],
      mode: 'reduceInstallment',
      amortizations: [
        {
          id: 'a1',
          name: 'Extra',
          active: true,
          type: 'single',
          reductionType: 'term',
          amount: 5000,
          month: 24,
        },
        {
          id: 'a2',
          name: 'Anual',
          active: true,
          type: 'recurring',
          reductionType: 'payment',
          amount: 1000,
          month: 12,
          frequencyMonths: 12,
        },
      ],
    },
  ],
  updatedAt: '2026-02-01T10:00:00.000Z',
};

const legacyBase = {
  id: base.id,
  name: base.name,
  bank: base.bank,
  amount: base.amount,
  years: base.years,
  interestRate: base.interestRate,
  rateType: base.rateType,
  startDate: base.startDate,
  bonuses: base.scenarios[0].bonuses,
  amortizations: base.scenarios[0].amortizations,
  updatedAt: base.updatedAt,
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
    const offers = [
      base,
      { ...base, id: 'oferta-2', name: 'Variable', rateType: 'variable' as const },
    ];

    expect(parseMortgageFile(serializeMortgages(offers))).toEqual({ ok: true, value: offers });
  });

  it('importa un archivo v1 y lo convierte a un escenario Base', () => {
    const result = parseMortgageFile(JSON.stringify({ mortgages: [legacyBase] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].scenarios).toHaveLength(1);
      expect(result.value[0].scenarios[0]).toMatchObject({
        name: 'Base',
        bonuses: legacyBase.bonuses,
        amortizations: legacyBase.amortizations,
      });
    }
  });

  it('añade comisiones vacías al importar datos v2 anteriores a la configuración', () => {
    const oldVersionTwo = {
      ...base,
      cancellationFees: undefined,
    };
    const result = parseMortgageFile(
      JSON.stringify({ schemaVersion: 2, mortgages: [oldVersionTwo] }),
    );

    expect(result).toEqual({
      ok: true,
      value: [{ ...base, cancellationFees: { partial: [], total: [] } }],
    });
  });

  it('rechaza importaciones con amortizaciones excesivas e identifica el escenario', () => {
    const invalid = {
      ...base,
      scenarios: [
        {
          ...base.scenarios[0],
          name: 'Escenario excesivo',
          amortizations: [
            ...base.scenarios[0].amortizations,
            {
              id: 'too-much',
              name: 'Exceso',
              active: true,
              type: 'single' as const,
              reductionType: 'payment' as const,
              amount: 1_000_000,
              month: 36,
            },
          ],
        },
      ],
    };
    const result = parseMortgageFile(serializeMortgages([invalid]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Oferta inválida «Fija bonificada»');
      expect(result.error).toContain('En el escenario «Escenario excesivo»');
    }
  });

  it('siempre exporta la versión 2', () => {
    expect(JSON.parse(serializeMortgages([base]))).toMatchObject({
      schemaVersion: 2,
      mortgages: [base],
    });
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
      scenarios: [
        {
          ...base.scenarios[0],
          bonuses: [{ ...base.scenarios[0].bonuses[0], startMonth: 50, endMonth: 10 }],
        },
      ],
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
    const raw = JSON.stringify({
      schemaVersion: 2,
      mortgages: [base, { ...base, id: 'oferta-2' }, corrupt],
    });
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages.map((item) => item.id)).toEqual(['oferta-1', 'oferta-2']);
    expect(loaded.notice).toBe('Se recuperaron 2 de 3 ofertas. Se guardó una copia de seguridad.');
    expect(storage.data.get(backupKey)).toBe(raw);
  });

  it('descarta y respalda ofertas cargadas con amortizaciones inválidas', () => {
    const invalid = {
      ...base,
      scenarios: [
        {
          ...base.scenarios[0],
          amortizations: [
            ...base.scenarios[0].amortizations,
            {
              id: 'too-much',
              name: 'Exceso',
              active: true,
              type: 'single' as const,
              reductionType: 'payment' as const,
              amount: 1_000_000,
              month: 36,
            },
          ],
        },
      ],
    };
    const raw = serializeMortgages([invalid]);
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([]);
    expect(loaded.notice).toContain('Se recuperaron 0 de 1 oferta');
    expect(storage.data.get(backupKey)).toBe(raw);
  });

  it('conserva la copia cuando el JSON completo no se puede leer', () => {
    const raw = '{ "mortgages": [ roto';
    const storage = fakeStorage({ [STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([]);
    expect(loaded.notice).toBe(
      'No se pudo leer los datos guardados. Se guardó una copia de seguridad.',
    );
    expect(storage.data.get(backupKey)).toBe(raw);
    expect(storage.data.get(STORAGE_KEY)).toBe(raw);
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

  it('migra automáticamente v1, crea la copia requerida y conserva la clave original', () => {
    const raw = JSON.stringify({ mortgages: [legacyBase] });
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages[0].scenarios[0]).toMatchObject({
      name: 'Base',
      bonuses: legacyBase.bonuses,
      amortizations: legacyBase.amortizations,
    });
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toMatchObject({ schemaVersion: 2 });
    expect(storage.data.get(LEGACY_BACKUP_KEY)).toBe(raw);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(calculateMortgage(base, base.scenarios[0])).toEqual(
      calculateMortgage(loaded.mortgages[0], loaded.mortgages[0].scenarios[0]),
    );
  });

  it('repairs an excessive v1 amortization, reports it, and preserves both legacy keys', () => {
    const legacy = {
      ...legacyBase,
      id: 'legacy-excess',
      name: 'Antigua',
      amount: 50000,
      years: 10,
      interestRate: 3,
      bonuses: [],
      amortizations: [
        {
          id: 'excessive',
          name: 'Extra',
          active: true,
          type: 'single' as const,
          reductionType: 'payment' as const,
          amount: 999999,
          month: 6,
        },
      ],
    };
    const legacyMortgage: Mortgage = {
      ...base,
      id: legacy.id,
      name: legacy.name,
      amount: legacy.amount,
      years: legacy.years,
      interestRate: legacy.interestRate,
      scenarios: [
        {
          id: 'reference',
          name: 'Base',
          bonuses: [],
          amortizations: [],
          mode: 'reduceInstallment',
        },
      ],
    };
    const expectedAmount = maxAmortizableAt(legacyMortgage, legacyMortgage.scenarios[0], 6) / 100;
    const raw = JSON.stringify({ mortgages: [legacy] });
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toHaveLength(1);
    expect(loaded.mortgages[0].scenarios[0].amortizations[0].amount).toBe(expectedAmount);
    expect(loaded.mortgages[0].scenarios[0].amortizations[0].active).toBe(true);
    expect(loaded.notice).toContain('Se migró 1 oferta');
    expect(loaded.notice).toContain('amortización «Extra» de «Antigua»');
    expect(loaded.notice).toContain(
      new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(expectedAmount),
    );
    expect(storage.data.get(LEGACY_BACKUP_KEY)).toBe(raw);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(raw);

    const migrated = loaded.mortgages[0];
    const referenceScenario: Scenario = {
      ...migrated.scenarios[0],
      amortizations: [{ ...migrated.scenarios[0].amortizations[0], amount: expectedAmount }],
    };
    expect(calculateMortgage(migrated, migrated.scenarios[0])).toEqual(
      calculateMortgage(migrated, referenceScenario),
    );
  });

  it('deactivates a v1 amortization after an earlier total cancellation', () => {
    const legacy = {
      ...legacyBase,
      amount: 50000,
      years: 10,
      bonuses: [],
      amortizations: [
        {
          id: 'cancel',
          name: 'Cancelación',
          active: true,
          type: 'single' as const,
          reductionType: 'payment' as const,
          amount: 999999,
          month: 6,
        },
        {
          id: 'late',
          name: 'Posterior',
          active: true,
          type: 'single' as const,
          reductionType: 'payment' as const,
          amount: 1000,
          month: 12,
        },
      ],
    };
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify({ mortgages: [legacy] }) });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toHaveLength(1);
    expect(loaded.mortgages[0].scenarios[0].amortizations.map((item) => item.active)).toEqual([
      true,
      false,
    ]);
    expect(loaded.notice).toContain('Posterior');
  });

  it('discards invalid v1 terms after repair and reports the rejected offer', () => {
    const invalid = { ...legacyBase, id: 'legacy-invalid', name: 'Plazo inválido', years: 200 };
    const raw = JSON.stringify({ mortgages: [invalid] });
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([]);
    expect(loaded.notice).toContain('Se descartó 1 oferta');
    expect(loaded.notice).toContain('Plazo inválido');
    expect(storage.data.get(LEGACY_BACKUP_KEY)).toBe(raw);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(raw);
  });

  it('migrates 100 deterministic v1 offers with excessive and out-of-term amortizations', () => {
    const offers = Array.from({ length: 100 }, (_value, index) => {
      const years = 5 + (index % 16);
      return {
        ...legacyBase,
        id: `legacy-${index}`,
        name: `Antigua ${index}`,
        amount: 40000 + index * 1000,
        years,
        interestRate: 1 + (index % 5) * 0.5,
        bonuses: [],
        amortizations: [
          {
            id: `excess-${index}`,
            name: 'Excesiva',
            active: true,
            type: 'single' as const,
            reductionType: 'payment' as const,
            amount: 1_000_000,
            month: 6 + (index % 12),
          },
          {
            id: `late-${index}`,
            name: 'Fuera de plazo',
            active: true,
            type: 'single' as const,
            reductionType: 'payment' as const,
            amount: 1000,
            month: years * 12 + 1,
          },
        ],
      };
    });
    const raw = JSON.stringify({ mortgages: offers });
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: raw });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toHaveLength(100);
    for (const [index, migrated] of loaded.mortgages.entries()) {
      const [excessive, outOfTerm] = migrated.scenarios[0].amortizations;
      const referenceScenario: Scenario = {
        ...migrated.scenarios[0],
        amortizations: [{ ...excessive }, { ...outOfTerm, active: false }],
      };
      expect(excessive.amount, `offer ${index}`).toBeLessThan(1_000_000);
      expect(outOfTerm.active, `offer ${index}`).toBe(false);
      expect(calculateMortgage(migrated, migrated.scenarios[0]).remainingCapital).toBe(0);
      expect(calculateMortgage(migrated, migrated.scenarios[0])).toEqual(
        calculateMortgage(migrated, referenceScenario),
      );
    }
  });

  it('no migra v1 cuando ya existe una clave v2', () => {
    const rawV1 = JSON.stringify({ mortgages: [legacyBase] });
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: rawV1,
      [STORAGE_KEY]: serializeMortgages([base]),
    });

    const loaded = loadMortgages(storage, now);

    expect(loaded.mortgages).toEqual([base]);
    expect(storage.data.has(LEGACY_BACKUP_KEY)).toBe(false);
  });
});
