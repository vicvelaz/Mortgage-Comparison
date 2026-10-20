import { calculateMortgage } from '../src/app/mortgage-calculator';
// Mezcla de «reducir plazo» (mes 12) y «reducir cuota» (mes 60), tipo estable.
const m: any = { id: 'm', name: 'M', bank: 'B', amount: 180000, years: 25, interestRate: 4, rateType: 'fixed', cancellationFees: { partial: [], total: [] }, updatedAt: 'x',
  scenarios: [{ id: 's', name: 'S', mode: 'reduceInstallment', bonuses: [], amortizations: [
    { id: 'a', name: 'a', active: true, type: 'single', reductionType: 'term', amount: 20000, month: 12 },
    { id: 'b', name: 'b', active: true, type: 'single', reductionType: 'payment', amount: 10000, month: 60 }] }] };
const r = calculateMortgage(m, m.scenarios[0]);
console.log('filas', r.rows.length, '| cuota m59', r.rows[58].payment.toFixed(2), '| cuota m61', r.rows[60].payment.toFixed(2), '| intereses', r.totalInterest.toFixed(2));
console.log('esperado: filas 250 | cuota m59 950.11 | cuota m61 877.21 | intereses 73677.06');
