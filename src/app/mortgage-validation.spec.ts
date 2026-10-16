import {
  validateAmortization,
  validateBonus,
  validateCancellationFees,
  validateMortgage,
} from './mortgage-validation';

const validMortgage = {
  name: 'Fija',
  bank: 'Banco',
  amount: 100000,
  years: 25,
  interestRate: 3,
  scenarios: [{ name: 'Base', bonuses: [], amortizations: [] }],
};

describe('mortgage-validation', () => {
  it('acepta una oferta válida', () => {
    expect(validateMortgage(validMortgage)).toBeNull();
  });

  it.each([
    ['nombre vacío', { name: '   ' }],
    ['entidad vacía', { bank: '' }],
    ['capital 0', { amount: 0 }],
    ['capital negativo', { amount: -1 }],
    ['capital NaN', { amount: NaN }],
    ['plazo 0', { years: 0 }],
    ['plazo 51', { years: 51 }],
    ['plazo 200', { years: 200 }],
    ['plazo con meses no enteros', { years: 1.05 }],
    ['tipo null', { interestRate: null }],
    ['tipo undefined', { interestRate: undefined }],
    ['tipo NaN', { interestRate: NaN }],
    ['tipo negativo', { interestRate: -3 }],
  ])('rechaza %s', (_label, overrides) => {
    expect(validateMortgage({ ...validMortgage, ...overrides })).toEqual(expect.any(String));
  });

  it.each([
    ['plazo 1', { years: 1 }],
    ['plazo 50', { years: 50 }],
    ['plazo 1,5 (18 meses)', { years: 1.5 }],
    ['tipo 0', { interestRate: 0 }],
  ])('acepta %s', (_label, overrides) => {
    expect(validateMortgage({ ...validMortgage, ...overrides })).toBeNull();
  });

  it('usa el mensaje de tipo de interés pedido', () => {
    expect(validateMortgage({ ...validMortgage, interestRate: null })).toBe(
      'Indica un tipo de interés igual o superior a 0.',
    );
  });

  describe('comisiones por amortización anticipada', () => {
    it('acepta tramos válidos y el fin abierto', () => {
      expect(
        validateCancellationFees({
          partial: [
            { fromMonth: 1, toMonth: 24, percent: 1 },
            { fromMonth: 25, percent: 0.5 },
          ],
          total: [],
        }),
      ).toBeNull();
    });

    it('rechaza tramos solapados e informa los meses', () => {
      expect(
        validateCancellationFees({
          partial: [
            { fromMonth: 1, toMonth: 24, percent: 1 },
            { fromMonth: 20, percent: 0.5 },
          ],
          total: [],
        }),
      ).toContain('se solapan en los meses 20–24');
    });

    it('rechaza porcentajes negativos y límites de meses inválidos', () => {
      expect(
        validateCancellationFees({
          partial: [{ fromMonth: 1, percent: -1 }],
          total: [],
        }),
      ).toContain('igual o superior a 0');
      expect(
        validateCancellationFees({
          partial: [{ fromMonth: 12, toMonth: 3, percent: 0 }],
          total: [],
        }),
      ).toContain('no puede ser anterior');
    });
  });

  describe('bonificaciones', () => {
    const bonus = {
      name: 'Seguro',
      interestReduction: 0.2,
      annualCost: 0,
      startMonth: 1,
      endMonth: 120,
    };

    it('acepta una bonificación válida', () => {
      expect(validateBonus(bonus)).toBeNull();
    });

    it('acepta mes final vacío (null o undefined) como «hasta el final»', () => {
      expect(validateBonus({ ...bonus, endMonth: null })).toBeNull();
      expect(validateBonus({ ...bonus, endMonth: undefined })).toBeNull();
    });

    it('acepta mes final igual al de inicio', () => {
      expect(validateBonus({ ...bonus, startMonth: 5, endMonth: 5 })).toBeNull();
    });

    it.each([
      ['sin nombre', { name: ' ' }],
      ['reducción negativa', { interestReduction: -1 }],
      ['reducción vacía', { interestReduction: null }],
      ['coste negativo', { annualCost: -1 }],
      ['mes de inicio 0', { startMonth: 0 }],
      ['mes de inicio vacío', { startMonth: null }],
      ['mes de inicio decimal', { startMonth: 1.5 }],
      ['mes final anterior al inicio', { startMonth: 50, endMonth: 10 }],
      ['mes final decimal', { endMonth: 10.5 }],
    ])('rechaza %s', (_label, overrides) => {
      expect(validateBonus({ ...bonus, ...overrides })).toEqual(expect.any(String));
    });
  });

  describe('amortizaciones', () => {
    const single = { amount: 1000, month: 12, type: 'single' };

    it('acepta una amortización puntual válida', () => {
      expect(validateAmortization(single)).toBeNull();
    });

    it('acepta una periódica con frecuencia entera de al menos 1', () => {
      expect(
        validateAmortization({ ...single, type: 'recurring', frequencyMonths: 12 }),
      ).toBeNull();
    });

    it.each([
      ['importe 0', { amount: 0 }],
      ['importe NaN', { amount: NaN }],
      ['mes 0', { month: 0 }],
      ['mes decimal', { month: 1.5 }],
      ['periódica con frecuencia 0', { type: 'recurring', frequencyMonths: 0 }],
      ['periódica sin frecuencia', { type: 'recurring' }],
    ])('rechaza %s', (_label, overrides) => {
      expect(validateAmortization({ ...single, ...overrides })).toEqual(expect.any(String));
    });
  });

  it('valida las bonificaciones y amortizaciones de la oferta', () => {
    expect(
      validateMortgage({
        ...validMortgage,
        scenarios: [
          {
            name: 'Base',
            bonuses: [
              { name: 'Mal', interestReduction: 0, annualCost: 0, startMonth: 50, endMonth: 10 },
            ],
            amortizations: [],
          },
        ],
      }),
    ).toEqual(expect.any(String));
    expect(
      validateMortgage({
        ...validMortgage,
        scenarios: [
          {
            name: 'Base',
            bonuses: [],
            amortizations: [{ amount: 0, month: 1, type: 'single' }],
          },
        ],
      }),
    ).toEqual(expect.any(String));
  });

  it('exige al menos un escenario con nombre', () => {
    expect(validateMortgage({ ...validMortgage, scenarios: [] })).toContain(
      'al menos un escenario',
    );
    expect(
      validateMortgage({
        ...validMortgage,
        scenarios: [{ name: '  ', bonuses: [], amortizations: [] }],
      }),
    ).toContain('nombre para cada escenario');
  });
});
