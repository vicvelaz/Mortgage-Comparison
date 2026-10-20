import { calculateMortgage } from '../src/app/mortgage-calculator';
import type { Mortgage, Scenario, Bonus, Amortization } from '../src/app/mortgage-calculator';
import { writeFileSync } from 'node:fs';

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(Number(process.env.SEED ?? 20261018));
const ri = (a: number, b: number) => Math.floor(R() * (b - a + 1)) + a;
const pick = <T,>(xs: T[]): T => xs[ri(0, xs.length - 1)];

const base = (o: Partial<Mortgage> = {}): Mortgage => ({ id: 'm', name: 'M', bank: 'B', amount: 180000, years: 25, interestRate: 3.1, rateType: 'fixed',
  cancellationFees: { partial: [], total: [] }, scenarios: [], updatedAt: 'x', ...o });
const scen = (o: Partial<Scenario> = {}): Scenario => ({ id: 's', name: 'S', bonuses: [], amortizations: [], mode: 'reduceInstallment', ...o });

type Case = { tag: string; m: Mortgage; s: Scenario; r: any };
const cases: Case[] = [];
const run = (tag: string, m: Mortgage, s: Scenario) => {
  const r = calculateMortgage(m, s);
  cases.push({ tag, m, s, r: {
    n: r.rows.length, first: r.firstPayment, ti: r.totalInterest, bc: r.bonusCost, fees: r.amortizationFees, tc: r.totalCost,
    rem: r.remainingCapital, sav: r.amortizationSavings, tae: r.annualPercentageRate, cancel: r.totalCancellationMonth,
    path: r.rows.map(x => x.remainingCapital), pay: r.rows.map(x => x.payment), extra: r.rows.map(x => x.extraPayment), fee: r.rows.map(x => x.fee) } });
};

// 1) Cuadrícula sin eventos
for (const amount of [50000, 180000, 750000, 3000000])
  for (const years of [1, 5, 15, 25, 30, 40, 50])
    for (const rate of [0, 0.01, 0.5, 1.99, 3.1, 4.5, 7.25, 12])
      for (const rateType of ['fixed', 'variable'] as const)
        run('grid', base({ amount, years, interestRate: rate, rateType }), scen());

// 2) Fuzz completo
const bonus = (i: number): Bonus => { const s = ri(1, 3) === 1 ? 1 : ri(1, 200); return { id: 'b' + i, name: 'b' + i, active: R() > 0.1,
  interestReduction: pick([0.1, 0.25, 0.5, 1, 2, 6]), annualCost: pick([0, 120, 300, 600]), startMonth: s, endMonth: R() < 0.5 ? undefined : s + ri(0, 150) }; };
const amort = (i: number, months: number): Amortization => { const type = pick(['single', 'single', 'recurring'] as const);
  return { id: 'a' + i, name: 'a' + i, active: R() > 0.1, type, reductionType: pick(['payment', 'term'] as const),
    amount: pick([500, 2000, 5000, 12000, 30000]), month: ri(1, Math.max(1, months - 1)), frequencyMonths: type === 'recurring' ? pick([1, 3, 6, 12]) : undefined }; };
const tiers = (months: number) => { if (R() < 0.4) return []; const cut = ri(6, Math.max(7, months - 2)); return R() < 0.5
  ? [{ fromMonth: 1, toMonth: cut, percent: pick([0.25, 0.5, 1, 2]) }, { fromMonth: cut + 1, percent: pick([0, 0.15, 0.5]) }]
  : [{ fromMonth: 1, percent: pick([0.25, 1, 2]) }]; };
for (let i = 0; i < Number(process.env.FUZZ ?? 2500); i++) {
  const years = pick([5, 8, 10, 15, 20, 25, 30, 35, 40]); const months = years * 12;
  const m = base({ amount: ri(30, 700) * 1000 + pick([0, 0, 250, 499, 750]), years, interestRate: pick([0, 0.5, 1.5, 2.25, 3.1, 4.75, 6.5, 9]),
    rateType: pick(['fixed', 'variable'] as const), cancellationFees: { partial: tiers(months), total: tiers(months) } });
  const s = scen({ mode: pick(['reduceInstallment', 'reduceTerm'] as const),
    bonuses: Array.from({ length: ri(0, 3) }, (_, k) => bonus(k)), amortizations: Array.from({ length: ri(0, 4) }, (_, k) => amort(k, months)) });
  if (R() < 0.35) { const start = ri(1, Math.max(1, months - 12)); s.monthlyBudget = { amount: ri(5, 40) * 100, startMonth: start, endMonth: R() < 0.5 ? undefined : start + ri(0, 120) }; }
  run('fuzz', m, s);
}
writeFileSync('./cases.json', JSON.stringify(cases));
console.log('casos:', cases.length);
