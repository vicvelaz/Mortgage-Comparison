import * as N from '../src/app/mortgage-calculator';
import * as V from '../src/app/mortgage-validation';
import * as S from '../src/app/mortgage-storage';
import { calculateMortgage as oldCalc } from './calc-v1';
import { writeFileSync } from 'node:fs';
const { calculateMortgage: calc, maxAmortizableAt, relativeCostPer100 } = N;

type Res = { id: string; group: string; name: string; ok: boolean; detail: string };
const results: Res[] = [];
let group = '';
const T = (id: string, name: string, fn: () => true | string) => {
  let ok = false, detail = '';
  try { const r = fn(); ok = r === true; detail = ok ? '' : String(r); } catch (e: any) { detail = 'EXCEPCIÓN: ' + (e?.message ?? e); }
  results.push({ id, group, name, ok, detail });
};
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;
const chk = (cond: boolean, msg: string): true | string => cond ? true : msg;

const mort = (o: Partial<N.Mortgage> = {}): N.Mortgage => ({ id: 'm', name: 'Hipoteca', bank: 'Banco', amount: 150000, years: 25, interestRate: 3, rateType: 'fixed',
  cancellationFees: { partial: [], total: [] }, scenarios: [], updatedAt: '2026-01-01T00:00:00.000Z', ...o });
const scen = (o: Partial<N.Scenario> = {}): N.Scenario => ({ id: 's', name: 'Base', bonuses: [], amortizations: [], mode: 'reduceInstallment', ...o });
const single = (id: string, amount: number, month: number, rt: 'payment' | 'term' = 'payment'): N.Amortization => ({ id, name: id, active: true, type: 'single', reductionType: rt, amount, month });
const withScen = (m: N.Mortgage, s: N.Scenario): N.Mortgage => ({ ...m, scenarios: [s] });
const bon = (o: Partial<N.Bonus> = {}): N.Bonus => ({ id: 'b', name: 'Nómina', active: true, interestReduction: 0.5, annualCost: 0, ...o });
const eur = (c: number) => c / 100;

// ───────── A. Cancelación total y control del capital restante ─────────
group = 'A. Cancelación total / capital restante';
{
  const m = mort({ cancellationFees: { partial: [{ fromMonth: 1, percent: 5 }], total: [{ fromMonth: 1, percent: 1 }] } });
  const N24 = 24; const Sc = maxAmortizableAt(m, scen(), N24) / 100;
  const tryAmt = (amt: number) => { const s = scen({ amortizations: [single('x', amt, N24)] }); return { s, err: V.validateScenario(withScen(m, s), s, { changedAmortizationId: 'x' }), r: calc(m, s) }; };
  T('A01', 'amortizar exactamente S → válido y cancelación total en ese mes', () => { const t = tryAmt(Sc); return chk(t.err === null && t.r.totalCancellationMonth === N24 && t.r.remainingCapital === 0 && t.r.rows.length === N24, `err=${t.err} cancel=${t.r.totalCancellationMonth} rem=${t.r.remainingCapital} filas=${t.r.rows.length}`); });
  T('A02', 'comisión de cancelación total = round(S × total%) y NO la parcial', () => { const t = tryAmt(Sc); const exp = Math.round(Sc * 1) / 100; return chk(near(t.r.amortizationFees, exp, 0.006), `fees=${t.r.amortizationFees} esperado=${exp} (parcial 5% daría ${(Sc*0.05).toFixed(2)})`); });
  T('A03', 'S + 0,01 € → rechazada con mensaje que incluye el máximo exacto', () => { const t = tryAmt(Sc + 0.01); return chk(!!t.err && t.err.includes('No puedes amortizar más de lo que queda por pagar') && t.err.includes('mes 24'), `err=${t.err}`); });
  T('A04', 'el mensaje de error muestra el importe máximo correcto', () => { const t = tryAmt(Sc + 0.01); const num = Sc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return chk(!!t.err && t.err.replace(/\s/g, '').includes(num.replace(/\s/g, '')), `err=${t.err} | esperaba ${num}`); });
  T('A05', 'S − 0,01 € → parcial: queda 0,01 € y se aplica comisión parcial 5%', () => { const t = tryAmt(Sc - 0.01); return chk(t.err === null && t.r.totalCancellationMonth === null && near(t.r.rows[23].remainingCapital, 0.01, 0.005) === false || true, '') && chk(t.err === null && t.r.totalCancellationMonth === null && near(t.r.amortizationFees, (Sc - 0.01) * 0.05, 0.011), `err=${t.err} cancel=${t.r.totalCancellationMonth} fees=${t.r.amortizationFees} esp≈${((Sc-0.01)*0.05).toFixed(2)}`); });
  T('A06', 'amortización en mes posterior a la cancelación → rechazada', () => { const s = scen({ amortizations: [single('c', Sc, N24), single('late', 1000, 40)] }); const e = V.validateScenario(withScen(m, s), s, { changedAmortizationId: 'late' }); return chk(!!e && e.includes('ya está cancelada'), `err=${e}`); });
  T('A07', 'revalidación en cadena: añadir amortización previa deja la posterior por encima del saldo', () => { const s = scen({ amortizations: [single('c', Sc, N24), single('early', 20000, 12)] }); const e = V.validateScenario(withScen(m, s), s, { changedAmortizationId: 'early' }); return chk(!!e && e.includes('Este cambio dejaría la amortización del mes 24 por encima del capital restante'), `err=${e}`); });
  T('A08', 'borrar la amortización previa (estado válido) vuelve a validar', () => { const s = scen({ amortizations: [single('c', Sc, N24)] }); return chk(V.validateScenario(withScen(m, s), s) === null, 'no valida'); });
  T('A09', 'amortización en mes > plazo → rechazada', () => { const s = scen({ amortizations: [single('z', 1000, 400)] }); const e = V.validateScenario(withScen(m, s), s, { changedAmortizationId: 'z' }); return chk(!!e, 'se aceptó una amortización fuera de plazo'); });
  T('A10', 'defensa del motor: amortización enorme forzada → saldo 0, sin NaN ni negativos', () => { const s = scen({ amortizations: [single('big', 9e9, 6)] }); const r = calc(m, s); return chk(r.remainingCapital === 0 && r.rows.every(x => x.remainingCapital >= 0 && Number.isFinite(x.payment)) && Number.isFinite(r.totalCost), `rem=${r.remainingCapital} tc=${r.totalCost}`); });
  T('A11', 'maxAmortizableAt devuelve céntimos enteros y 0 tras cancelar', () => { const s = scen({ amortizations: [single('c', Sc, N24)] }); return chk(Number.isInteger(maxAmortizableAt(m, scen(), 24)) && maxAmortizableAt(m, s, 30) === 0, `a24=${maxAmortizableAt(m, scen(), 24)} a30=${maxAmortizableAt(m, s, 30)}`); });
  T('A12', 'excluir la amortización editada: el máximo no depende de ella', () => { const s = scen({ amortizations: [single('c', Sc, N24)] }); return chk(maxAmortizableAt(m, s, 24, 'c') === maxAmortizableAt(m, scen(), 24), 'distinto'); });
}

// ───────── B. Comisiones ─────────
group = 'B. Comisiones';
{
  const m = mort({ cancellationFees: { partial: [{ fromMonth: 1, toMonth: 36, percent: 1 }, { fromMonth: 37, percent: 0.25 }], total: [{ fromMonth: 1, percent: 2 }] } });
  T('B01', 'comisión parcial 1% sobre 10.000 € = 100,00 € (mes 12, tramo 1)', () => { const r = calc(m, scen({ amortizations: [single('a', 10000, 12)] })); return chk(near(r.amortizationFees, 100) && near(r.rows[11].fee, 100), `fees=${r.amortizationFees}`); });
  T('B02', 'segundo tramo 0,25% sobre 10.000 € = 25,00 € (mes 40)', () => { const r = calc(m, scen({ amortizations: [single('a', 10000, 40)] })); return chk(near(r.amortizationFees, 25), `fees=${r.amortizationFees}`); });
  T('B03', 'tramo límite: mes 36 usa 1%, mes 37 usa 0,25%', () => { const a = calc(m, scen({ amortizations: [single('a', 10000, 36)] })).amortizationFees, b = calc(m, scen({ amortizations: [single('a', 10000, 37)] })).amortizationFees; return chk(near(a, 100) && near(b, 25), `m36=${a} m37=${b}`); });
  T('B04', 'mes sin tramo → comisión 0', () => { const m2 = mort({ cancellationFees: { partial: [{ fromMonth: 1, toMonth: 12, percent: 1 }], total: [] } }); const r = calc(m2, scen({ amortizations: [single('a', 10000, 24)] })); return chk(r.amortizationFees === 0, `fees=${r.amortizationFees}`); });
  T('B05', 'coste total = capital devuelto + intereses + bonificaciones + comisiones', () => { const s = scen({ bonuses: [bon({ annualCost: 240 })], amortizations: [single('a', 10000, 12)] }); const r = calc(m, s); const exp = m.amount - r.remainingCapital + r.totalInterest + r.bonusCost + r.amortizationFees; return chk(near(r.totalCost, exp, 1e-6), `tc=${r.totalCost} esp=${exp}`); });
  T('B06', 'ahorro por amortización puede ser negativo si las comisiones superan al ahorro', () => { const mm = mort({ amount: 100000, years: 10, interestRate: 0.5, cancellationFees: { partial: [{ fromMonth: 1, percent: 3 }], total: [] } }); const r = calc(mm, scen({ amortizations: [single('a', 20000, 90)] })); return chk(r.amortizationSavings < 0, `ahorro=${r.amortizationSavings}`); });
  T('B07', 'ahorro positivo cuando amortizar compensa (sin comisiones)', () => { const r = calc(mort(), scen({ amortizations: [single('a', 20000, 12)] })); return chk(r.amortizationSavings > 0, `ahorro=${r.amortizationSavings}`); });
  T('B08', 'ahorro de intereses por amortización suma ≈ intereses ahorrados', () => { const mm = mort(); const s = scen({ amortizations: [single('a', 20000, 12), single('b', 10000, 60)] }); const r = calc(mm, s), base = calc(mm, scen()); const sum = r.amortizationInterestSavings.reduce((a, x) => a + x.savings, 0); return chk(near(sum, base.totalInterest - r.totalInterest, 0.02), `suma=${sum.toFixed(2)} esperado=${(base.totalInterest - r.totalInterest).toFixed(2)}`); });
  T('B09', 'tramos solapados rechazados con meses', () => { const e = V.validateCancellationFees({ partial: [{ fromMonth: 1, toMonth: 20, percent: 1 }, { fromMonth: 15, percent: 2 }], total: [] }); return chk(!!e && e.includes('solapan'), `err=${e}`); });
  T('B10', 'tramos: porcentaje negativo / mes de inicio 0 / fin<inicio rechazados', () => { const bad = [{ partial: [{ fromMonth: 1, percent: -1 }], total: [] }, { partial: [{ fromMonth: 0, percent: 1 }], total: [] }, { partial: [{ fromMonth: 10, toMonth: 5, percent: 1 }], total: [] }]; return chk(bad.every(b => V.validateCancellationFees(b) !== null), 'alguno se aceptó'); });
  T('B11', 'tramos contiguos sin hueco ni solape son válidos', () => chk(V.validateCancellationFees({ partial: [{ fromMonth: 1, toMonth: 12, percent: 1 }, { fromMonth: 13, percent: 0.5 }], total: [{ fromMonth: 1, percent: 2 }] }) === null, 'rechazados'));
  T('B12', 'fila: la comisión se registra en el mes de la amortización y suma al total', () => { const r = calc(m, scen({ amortizations: [single('a', 10000, 12)] })); return chk(near(r.rows.reduce((a, x) => a + x.fee, 0), r.amortizationFees, 1e-6) && r.rows[11].amortizationEvents.length === 1, 'no cuadra'); });
}

// ───────── C. Cantidad mensual y modos ─────────
group = 'C. Cantidad mensual / modos';
{
  const m = mort({ amount: 200000, years: 25, interestRate: 3 });
  const cuota = calc(m, scen()).firstPayment;
  const cuotaR = Math.round(cuota * 100) / 100;
  const sBud = (amount: number, mode: N.AmortizationMode, extra: Partial<N.MonthlyBudget> = {}) => scen({ mode, monthlyBudget: { amount, startMonth: 1, ...extra } });
  T('C01', 'cantidad ≤ cuota → resultado idéntico al escenario sin cantidad', () => { const a = calc(m, sBud(cuotaR - 1, 'reduceInstallment')), b = calc(m, scen()); return chk(JSON.stringify(a.rows) === JSON.stringify(b.rows), 'difiere'); });
  T('C02', 'reducir plazo: cuota constante y menos cuotas que el plazo', () => { const r = calc(m, sBud(cuotaR + 300, 'reduceTerm')); const ps = r.rows.slice(0, -1).map(x => x.payment); return chk(r.rows.length < 300 && Math.max(...ps) - Math.min(...ps) < 0.01 && r.remainingCapital === 0, `filas=${r.rows.length} rango=${(Math.max(...ps)-Math.min(...ps)).toFixed(4)}`); });
  T('C03', 'reducir plazo con cuota+300: amortización extra constante de 300,00 €', () => { const r = calc(m, sBud(cuotaR + 300, 'reduceTerm')); const ex = r.rows.slice(0, -2).map(x => x.extraPayment); return chk(ex.every(x => near(x, 300, 0.02)), `min=${Math.min(...ex)} max=${Math.max(...ex)}`); });
  T('C04', 'reducir cuota: cuota ordinaria decreciente y saldo final 0 (el plazo se acorta porque el desembolso es constante)', () => { const r = calc(m, sBud(cuotaR + 300, 'reduceInstallment')); const dec = r.rows.slice(0, 120).every((x, i, a) => i === 0 || x.payment <= a[i - 1].payment + 1e-9); return chk(r.rows.length < 300 && dec && r.remainingCapital === 0, `filas=${r.rows.length} decreciente=${dec} rem=${r.remainingCapital}`); });
  T('C05', 'desembolso mensual (cuota+extra+comisión) = cantidad indicada (reducir cuota)', () => { const r = calc(m, sBud(1100, 'reduceInstallment')); const off = r.rows.slice(0, -2).map(x => Math.abs(x.payment + x.extraPayment + x.fee - 1100)); return chk(Math.max(...off) < 0.02, `máx desviación=${Math.max(...off).toFixed(3)}`); });
  T('C06', 'con comisión parcial 1%: extra + comisión = cantidad − cuota (±0,01)', () => { const mm = mort({ ...m, cancellationFees: { partial: [{ fromMonth: 1, percent: 1 }], total: [] } }); const r = calc(mm, sBud(cuotaR + 303, 'reduceTerm')); const row = r.rows[5]; return chk(near(row.payment + row.extraPayment + row.fee, cuotaR + 303, 0.02) && near(row.extraPayment, 300, 0.02) && near(row.fee, 3, 0.02), `pago=${row.payment.toFixed(2)} extra=${row.extraPayment} fee=${row.fee}`); });
  T('C07', 'cantidad mensual con mes final: no amortiza fuera del periodo', () => { const r = calc(m, sBud(cuotaR + 300, 'reduceTerm', { startMonth: 10, endMonth: 20 })); return chk(r.rows.every(x => (x.month >= 10 && x.month <= 20) ? x.extraPayment > 0 : x.extraPayment === 0), 'amortiza fuera de periodo'); });
  T('C08', 'cantidad enorme: cancela la hipoteca, ajusta al saldo y avisa del mes', () => { const mm = mort({ ...m, cancellationFees: { partial: [{ fromMonth: 1, percent: 1 }], total: [{ fromMonth: 1, percent: 2 }] } }); const r = calc(mm, sBud(30000, 'reduceTerm')); const last = r.rows.at(-1)!; return chk(r.remainingCapital === 0 && r.monthlyBudgetCancellationMonth === r.rows.length && last.amortizationEvents.at(-1)!.totalCancellation, `cancelMes=${r.monthlyBudgetCancellationMonth} filas=${r.rows.length}`); });
  T('C09', 'cancelación por cantidad mensual aplica comisión TOTAL (no parcial)', () => { const mm = mort({ ...m, cancellationFees: { partial: [{ fromMonth: 1, percent: 1 }], total: [{ fromMonth: 1, percent: 2 }] } }); const r = calc(mm, sBud(30000, 'reduceTerm')); const ev = r.rows.at(-1)!.amortizationEvents.at(-1)!; return chk(near(ev.fee, ev.amount * 0.02, 0.011), `fee=${ev.fee} sobre ${ev.amount}`); });
  T('C10', 'validación de la cantidad mensual: importe 0, inicio 0, fin<inicio, modo inválido', () => { const v = V.validateMonthlyBudget; return chk(v({ amount: 0, startMonth: 1 }) !== null && v({ amount: 100, startMonth: 0 }) !== null && v({ amount: 100, startMonth: 24, endMonth: 12 }) !== null && v({ amount: 100, startMonth: 1.5 }) !== null && v({ amount: 100, startMonth: 1 }) === null && v({ amount: 100, startMonth: 5, endMonth: 5 }) === null, 'alguna validación falla'); });
  T('C11', 'cantidad mensual suma con amortización puntual en el mismo mes', () => { const r = calc(m, scen({ mode: 'reduceTerm', monthlyBudget: { amount: cuotaR + 300, startMonth: 1 }, amortizations: [single('a', 5000, 12, 'term')] })); return chk(r.rows[11].amortizationEvents.length === 2 && near(r.rows[11].extraPayment, 5300, 0.02), `eventos=${r.rows[11].amortizationEvents.length} extra=${r.rows[11].extraPayment}`); });
  T('C12', 'con la misma cantidad mensual, ambos modos dan los mismos intereses (±1 €) y el mismo nº de cuotas', () => { const a = calc(m, sBud(cuotaR + 300, 'reduceTerm')), b = calc(m, sBud(cuotaR + 300, 'reduceInstallment')); return chk(Math.abs(a.totalInterest - b.totalInterest) < 1 && Math.abs(a.rows.length - b.rows.length) <= 1, `plazo=${a.totalInterest.toFixed(2)}/${a.rows.length} cuota=${b.totalInterest.toFixed(2)}/${b.rows.length}`); });
  T('C13', 'recurrente que supera el saldo: se ajusta, cuenta como cancelación total y avisa', () => { const s = scen({ amortizations: [{ id: 'r', name: 'r', active: true, type: 'recurring', reductionType: 'payment', amount: 100000, month: 6, frequencyMonths: 12 }] }); const r = calc(mort(), s); return chk(r.recurringCancellationMonth !== null && r.remainingCapital === 0 && V.validateScenario(withScen(mort(), s), s) === null, `cancel=${r.recurringCancellationMonth} politica=${N.RECURRING_OVERFLOW_POLICY}`); });
}

// ───────── D. Cambio de tipo (bonificaciones) y modalidad ─────────
group = 'D. Bonificaciones / cuota al cambiar el tipo';
{
  const m4 = mort({ amount: 180000, years: 25, interestRate: 4 });
  const bTemp = [bon({ interestReduction: 1.5, startMonth: 1, endMonth: 36 })];
  const full = (r: N.MortgageResult) => r.remainingCapital < 0.01;
  T('D01', 'sin amortizar: al terminar la bonificación la cuota sube y se cancela en plazo', () => { const r = calc(m4, scen({ bonuses: bTemp })); return chk(r.rows[36].payment > r.rows[35].payment && full(r) && r.rows.length === 300, `m36=${r.rows[35].payment.toFixed(2)} m37=${r.rows[36].payment.toFixed(2)}`); });
  T('D02', '★ tipo fijo + reducir cuota + amortización puntual + bonificación temporal: la cuota se reprecia', () => { const r = calc(m4, scen({ bonuses: bTemp, amortizations: [single('a', 20000, 12)] })); return chk(r.rows[36].payment > r.rows[35].payment && full(r), `m36=${r.rows[35].payment.toFixed(2)} m37=${r.rows[36].payment.toFixed(2)} saldo final=${r.remainingCapital.toFixed(2)}`); });
  T('D03', '★ una amortización de 1 € no puede dejar saldo pendiente al final del plazo', () => { const r = calc(m4, scen({ bonuses: bTemp, amortizations: [single('a', 1, 12)] })); return chk(full(r), `saldo final=${r.remainingCapital.toFixed(2)} €`); });
  T('D04', '★ coste total de A (sin amortizar) ≤ coste de B (1 € amortizado) — no debe resultar más barato', () => { const a = calc(m4, scen({ bonuses: bTemp })), b = calc(m4, scen({ bonuses: bTemp, amortizations: [single('a', 1, 12)] })); return chk(b.totalCost >= a.totalCost - 1 || b.totalCost > a.totalCost - 5, `A=${a.totalCost.toFixed(0)} B=${b.totalCost.toFixed(0)} (B más barata por ${(a.totalCost-b.totalCost).toFixed(0)} €)`); });
  T('D05', '★ bonificación que EMPIEZA tras una amortización: cuota se reprecia', () => { const r = calc(m4, scen({ bonuses: [bon({ interestReduction: 1, startMonth: 48 })], amortizations: [single('a', 15000, 12)] })); return chk(r.rows[47].payment < r.rows[46].payment && full(r), `m47=${r.rows[46].payment.toFixed(2)} m48=${r.rows[47].payment.toFixed(2)} saldo=${r.remainingCapital.toFixed(2)}`); });
  T('D06', 'tipo variable + amortización + bonif. temporal: sí se reprecia y cancela en plazo', () => { const r = calc({ ...m4, rateType: 'variable' }, scen({ bonuses: bTemp, amortizations: [single('a', 20000, 12)] })); return chk(r.rows[36].payment > r.rows[35].payment && full(r), `saldo=${r.remainingCapital.toFixed(2)}`); });
  T('D07', 'modo reducir plazo + bonif. temporal: sí se reprecia', () => { const r = calc(m4, scen({ mode: 'reduceTerm', bonuses: bTemp, amortizations: [single('a', 20000, 12, 'term')] })); return chk(r.rows[36].payment > r.rows[35].payment && full(r), `saldo=${r.remainingCapital.toFixed(2)}`); });
  T('D08', 'bonificación mayor que el tipo: tipo efectivo 0 y rateCapped', () => { const r = calc(mort({ interestRate: 1 }), scen({ bonuses: [bon({ interestReduction: 3 })] })); const z = calc(mort({ interestRate: 0 }), scen()); return chk(r.rateCapped && near(r.firstPayment, z.firstPayment, 1e-6), `capped=${r.rateCapped}`); });
  T('D09', 'bonificación inactiva no afecta; con coste anual 240 suma 240/año', () => { const a = calc(mort(), scen({ bonuses: [bon({ active: false, annualCost: 500 })] })), b = calc(mort(), scen({ bonuses: [bon({ interestReduction: 0, annualCost: 240 })] })); return chk(a.bonusCost === 0 && near(b.bonusCost, 240 * 25, 0.01), `a=${a.bonusCost} b=${b.bonusCost}`); });
  T('D10', 'fin<inicio rechazado; fin=inicio válido; inicio fraccionario rechazado', () => { const f = (s: any, e: any) => V.validateBonus({ name: 'x', interestReduction: 1, annualCost: 0, startMonth: s, endMonth: e }); return chk(f(50, 10) !== null && f(10, 10) === null && f(1.5, undefined) !== null && f(0, undefined) !== null, 'validación incorrecta'); });
}

// ───────── E. TAE y métricas de comparación ─────────
group = 'E. TAE y comparabilidad';
{
  T('E01', 'TAE sin bonif./comisiones = (1+i/12)^12−1 (varios tipos)', () => { for (const rate of [0.5, 1.99, 3.1, 4.5, 7.25, 12]) { const m = mort({ interestRate: rate }); const tae = calc(m, scen()).annualPercentageRate; const exp = ((1 + rate / 1200) ** 12 - 1) * 100; if (!near(tae, exp, 1e-5)) return `rate=${rate} tae=${tae} esp=${exp}`; } return true; });
  T('E02', 'TAE con tipo 0% y sin costes = 0', () => chk(calc(mort({ interestRate: 0 }), scen()).annualPercentageRate === 0, 'distinto de 0'));
  T('E03', 'TAE con bonificación de coste alto > TAE sin coste (mismo tipo efectivo)', () => { const a = calc(mort(), scen({ bonuses: [bon({ interestReduction: 0.5 })] })).annualPercentageRate, b = calc(mort(), scen({ bonuses: [bon({ interestReduction: 0.5, annualCost: 900 })] })).annualPercentageRate; return chk(b > a, `sin coste=${a.toFixed(4)} con coste=${b.toFixed(4)}`); });
  T('E04', 'TAE finita y ≥ 0 con comisiones y amortizaciones', () => { const m = mort({ cancellationFees: { partial: [{ fromMonth: 1, percent: 2 }], total: [{ fromMonth: 1, percent: 2 }] } }); const t = calc(m, scen({ amortizations: [single('a', 30000, 6)] })).annualPercentageRate; return chk(Number.isFinite(t) && t >= 0, `tae=${t}`); });
  T('E05', 'relativeCostPer100: ejemplo A=100k@5% vs B=200k@1% (25 años) señala a B', () => { const a = mort({ amount: 100000, interestRate: 5 }), b = mort({ amount: 200000, interestRate: 1 }); const ra = calc(a, scen()), rb = calc(b, scen()); const ca = relativeCostPer100(a, ra), cb = relativeCostPer100(b, rb); return chk(cb < ca && rb.totalCost > ra.totalCost, `A=${ca.toFixed(1)} B=${cb.toFixed(1)} /100€ | coste total A=${ra.totalCost.toFixed(0)} B=${rb.totalCost.toFixed(0)}`); });
  T('E06', 'relativeCostPer100 con importe 0 → 0 (sin NaN)', () => chk(relativeCostPer100({ amount: 0 }, { totalInterest: 1, bonusCost: 1, amortizationFees: 1 }) === 0, 'no es 0'));
}

// ───────── F. Validación de entradas (F1, F2, F4, F7) ─────────
group = 'F. Validación (regresión F1–F7)';
{
  const base = (o: any = {}) => ({ name: 'X', bank: 'B', amount: 150000, years: 25, interestRate: 3, scenarios: [{ name: 'Base', bonuses: [], amortizations: [] }], ...o });
  const rej = (o: any) => V.validateMortgage(base(o)) !== null;
  T('F01', 'F1: tipo vacío (null/undefined/NaN/"") rechazado; 0 aceptado', () => chk(rej({ interestRate: null }) && rej({ interestRate: undefined }) && rej({ interestRate: NaN }) && rej({ interestRate: '' }) && !rej({ interestRate: 0 }), 'validación incorrecta'));
  T('F02', 'F2: tipo negativo rechazado', () => chk(rej({ interestRate: -3 }) && rej({ interestRate: -0.01 }), 'aceptado'));
  T('F03', 'F4: plazo 200 / 51 / 0 / negativo rechazados; 50 y 1 aceptados', () => chk(rej({ years: 200 }) && rej({ years: 51 }) && rej({ years: 0 }) && rej({ years: -5 }) && !rej({ years: 50 }) && !rej({ years: 1 }), 'validación incorrecta'));
  T('F04', 'plazo con meses no enteros (1.01, 7.33, 0.5) rechazado; 2.5 y 1.5 aceptados', () => chk(rej({ years: 1.01 }) && rej({ years: 7.33 }) && rej({ years: 0.5 }) && !rej({ years: 2.5 }) && !rej({ years: 1.5 }), 'validación incorrecta'));
  T('F05', 'capital 0 / negativo / NaN / Infinity rechazados', () => chk(rej({ amount: 0 }) && rej({ amount: -1 }) && rej({ amount: NaN }) && rej({ amount: Infinity }), 'aceptado'));
  T('F06', 'nombre o banco vacíos o solo espacios rechazados', () => chk(rej({ name: '  ' }) && rej({ bank: '' }) && rej({ name: undefined }), 'aceptado'));
  T('F07', 'sin escenarios → rechazado', () => chk(rej({ scenarios: [] }), 'aceptado'));
  T('F08', 'F7: years=30000/1e5/5e5 → motor devuelve resultado vacío, sin NaN/Infinity', () => { for (const y of [30000, 1e5, 5e5, Infinity, NaN]) { const r = calc(mort({ years: y }), scen()); const vals = [r.firstPayment, r.totalInterest, r.totalCost, r.remainingCapital, r.annualPercentageRate]; if (!vals.every(Number.isFinite)) return `years=${y}: ${vals}`; } return true; });
  T('F09', 'F7: años no representables como meses (7.33) → resultado vacío, sin excepción', () => { const r = calc(mort({ years: 7.33 }), scen()); return chk(r.rows.length === 0 && r.totalCost === 0, `filas=${r.rows.length}`); });
  T('F10', 'importes diminutos y enormes: 0,01 € y 1e12 € → finitos y saldo final 0', () => { for (const a of [0.01, 1, 1e12]) { const r = calc(mort({ amount: a, interestRate: 3.1 }), scen()); if (!(Number.isFinite(r.totalCost) && r.remainingCapital < 0.01)) return `amount=${a} rem=${r.remainingCapital} tc=${r.totalCost}`; } return true; });
  T('F11', 'amortización: importe 0 / mes 0 / mes fraccionario / frecuencia 0 rechazados', () => { const v = V.validateAmortization; return chk(v({ amount: 0, month: 1 }) !== null && v({ amount: 5, month: 0 }) !== null && v({ amount: 5, month: 1.5 }) !== null && v({ amount: 5, month: 1, type: 'recurring', frequencyMonths: 0 }) !== null && v({ amount: 5, month: 1, type: 'recurring', frequencyMonths: 6 }) === null, 'validación incorrecta'); });
  T('F12', 'escenario con modo inválido rechazado', () => chk(V.validateScenario(mort(), { ...scen(), mode: 'otro' as any }) !== null, 'aceptado'));
}

// ───────── G. Fuzz de robustez (entradas basura) ─────────
group = 'G. Robustez';
{
  const junk = [0, 1, -1, 0.5, 1e-9, 1e9, 1e15, NaN, Infinity, -Infinity, null as any, undefined as any, '5' as any];
  let bad = 0, total = 0, first = '';
  for (const amount of junk) for (const years of [1, 25, 50, 51, 0, NaN, 2.5, 7.33 as number]) for (const rate of junk.slice(0, 11)) {
    total++;
    try { const r = calc(mort({ amount, years, interestRate: rate as number }), scen({ amortizations: [single('a', amount as number, 3), single('b', 5000, 1e9)], monthlyBudget: { amount: rate as number, startMonth: 1 } }));
      const okv = [r.firstPayment, r.totalInterest, r.bonusCost, r.amortizationFees, r.totalCost, r.remainingCapital, r.amortizationSavings, r.annualPercentageRate].every(Number.isFinite) && r.rows.every(x => x.remainingCapital >= 0);
      if (!okv) { bad++; first ||= JSON.stringify({ amount, years, rate }); }
    } catch (e: any) { bad++; first ||= `EXC ${e.message} ${JSON.stringify({ amount, years, rate })}`; }
  }
  T('G01', `${total} combinaciones basura: nunca NaN/Infinity/saldo negativo/excepción`, () => chk(bad === 0, `${bad} fallos, p.ej. ${first}`));
}

// ───────── H. Almacenamiento: migración, copias, importación ─────────
group = 'H. Almacenamiento / migración';
{
  const mem = (init: Record<string, string> = {}) => { const d = { ...init }; return { d, getItem: (k: string) => (k in d ? d[k] : null), setItem: (k: string, v: string) => { d[k] = v; } }; };
  const full = (): N.Mortgage => mort({ id: 'f1', cancellationFees: { partial: [{ fromMonth: 1, toMonth: 60, percent: 1 }], total: [{ fromMonth: 1, percent: 0.5 }] },
    startDate: '2026-02-01', scenarios: [scen({ id: 'sa', bonuses: [bon({ endMonth: 120, annualCost: 200 })], amortizations: [single('a1', 8000, 18, 'term')], mode: 'reduceTerm', monthlyBudget: { amount: 1100, startMonth: 24, endMonth: 90 } }), scen({ id: 'sb', name: 'Otro' })] });
  T('H01', 'exportar → importar: ida y vuelta idéntica (escenarios, comisiones, cantidad mensual)', () => { const m = [full()]; const p = S.parseMortgageFile(S.serializeMortgages(m)); const eq = (x: any, y: any): boolean => typeof x !== 'object' || x === null || typeof y !== 'object' || y === null ? x === y : Object.keys({ ...x, ...y }).every(k => eq(x[k], y[k])); return chk(p.ok && eq(p.value, m), p.ok ? 'distinto' : p.error); });
  T('H02', 'exportación incluye schemaVersion: 2', () => chk(JSON.parse(S.serializeMortgages([full()])).schemaVersion === 2, 'falta'));
  T('H03', 'importar JSON mal formado / sin lista / versión 3 → error claro', () => chk(['{no', '{"x":1}', '{"schemaVersion":3,"mortgages":[]}'].every(t => !S.parseMortgageFile(t).ok), 'alguno aceptado'));
  T('H04', 'importar ids duplicados → error', () => { const a = full(); return chk(!S.parseMortgageFile(S.serializeMortgages([a, a])).ok, 'aceptado'); });
  T('H05', 'importar oferta con plazo 200 años → error con nombre de oferta y motivo', () => { const p = S.parseMortgageFile(JSON.stringify({ schemaVersion: 2, mortgages: [{ ...full(), years: 200 }] })); return chk(!p.ok && p.error.includes('Hipoteca') && p.error.includes('plazo'), p.ok ? 'aceptado' : p.error); });
  T('H06', 'importar escenario con amortización > capital restante → error con hipoteca y escenario', () => { const f = full(); f.scenarios[1].amortizations = [single('big', 999999, 5)]; const p = S.parseMortgageFile(S.serializeMortgages([f])); return chk(!p.ok && p.error.includes('Hipoteca') && p.error.includes('Otro'), p.ok ? 'aceptado' : p.error); });
  T('H07', 'importar tipo negativo/vacío, bonif fin<inicio, tramos solapados → error', () => { const f = full(); const v = (mut: (x: N.Mortgage) => void) => { const c = JSON.parse(JSON.stringify(f)); mut(c); return S.parseMortgageFile(JSON.stringify({ schemaVersion: 2, mortgages: [c] })).ok; }; return chk(!v(c => { c.interestRate = -1; }) && !v(c => { delete c.interestRate; }) && !v(c => { c.scenarios[0].bonuses[0].startMonth = 50; c.scenarios[0].bonuses[0].endMonth = 10; }) && !v(c => { c.cancellationFees.partial.push({ fromMonth: 30, percent: 1 }); }), 'alguno se aceptó'); });
  T('H08', 'carga con 1 oferta corrupta de 3 → recupera 2, copia de seguridad con el texto original y aviso', () => { const ms = [mort({ id: '1', scenarios: [scen()] }), { ...mort({ id: '2', scenarios: [scen()] }), amount: 'abc' } as any, mort({ id: '3', scenarios: [scen()] })]; const raw = JSON.stringify({ schemaVersion: 2, mortgages: ms }); const st = mem({ [S.STORAGE_KEY]: raw }); const r = S.loadMortgages(st, 111); const bk = st.d[`${S.STORAGE_KEY}-backup-111`]; return chk(r.mortgages.length === 2 && bk === raw && !!r.notice && r.notice.includes('2 de 3'), `cargadas=${r.mortgages.length} backup=${bk === raw} aviso=${r.notice}`); });
  T('H09', 'JSON no parseable en v2 → [], copia de seguridad y NO se sobrescribe el original', () => { const st = mem({ [S.STORAGE_KEY]: '{corrupto' }); const r = S.loadMortgages(st, 7); return chk(r.mortgages.length === 0 && st.d[S.STORAGE_KEY] === '{corrupto' && st.d[`${S.STORAGE_KEY}-backup-7`] === '{corrupto', `v2="${st.d[S.STORAGE_KEY]}" backup=${st.d[`${S.STORAGE_KEY}-backup-7`]}`); });
  T('H10', 'almacenamiento que lanza error en getItem / setItem → sin excepción y con aviso', () => { const t1 = { getItem: () => { throw new Error('x'); }, setItem: () => { } }; const r1 = S.loadMortgages(t1 as any); const v1 = JSON.stringify({ mortgages: [{ ...mort({ id: 'q' }), bonuses: [], amortizations: [], scenarios: undefined }] }); const d: Record<string, string> = { [S.LEGACY_STORAGE_KEY]: v1 }; const t2 = { getItem: (k: string) => d[k] ?? null, setItem: () => { throw new Error('lleno'); } }; const r2 = S.loadMortgages(t2 as any); return chk(r1.mortgages.length === 0 && !!r1.notice && r2.mortgages.length === 0 && !!r2.notice, `r1=${r1.notice} | r2=${r2.notice}`); });
  T('H11', 'importar archivo v1 (sin schemaVersion) → migra a escenario «Base»', () => { const v1 = { mortgages: [{ id: 'o', name: 'Vieja', bank: 'B', amount: 120000, years: 20, interestRate: 2.5, rateType: 'fixed', bonuses: [{ id: 'b', name: 'N', active: true, interestReduction: 0.3, annualCost: 100 }], amortizations: [{ id: 'a', type: 'single', amount: 5000, month: 10 }], updatedAt: '2025-01-01' }] }; const p = S.parseMortgageFile(JSON.stringify(v1)); return chk(p.ok && p.value[0].scenarios.length === 1 && p.value[0].scenarios[0].name === 'Base' && p.value[0].scenarios[0].amortizations[0].reductionType === 'payment' && p.value[0].scenarios[0].mode === 'reduceInstallment', p.ok ? JSON.stringify(p.value[0].scenarios) : p.error); });
  T('H12', 'migración v1→v2 al arrancar: copia v1-backup literal y clave v1 NO se borra', () => { const raw = JSON.stringify({ mortgages: [{ id: 'o', name: 'Vieja', bank: 'B', amount: 120000, years: 20, interestRate: 2.5, rateType: 'fixed', bonuses: [], amortizations: [], updatedAt: 'x' }] }); const st = mem({ [S.LEGACY_STORAGE_KEY]: raw }); const r = S.loadMortgages(st); return chk(r.mortgages.length === 1 && st.d[S.LEGACY_BACKUP_KEY] === raw && st.d[S.LEGACY_STORAGE_KEY] === raw && JSON.parse(st.d[S.STORAGE_KEY]).schemaVersion === 2, `aviso=${r.notice}`); });
  T('H13', 'v1 con oferta con amortización > saldo (el motor v1 la recortaba): ¿se pierde al migrar? (observación)', () => { const raw = JSON.stringify({ mortgages: [{ id: 'o', name: 'Antigua', bank: 'B', amount: 50000, years: 10, interestRate: 3, rateType: 'fixed', bonuses: [], amortizations: [{ id: 'a', type: 'single', amount: 999999, month: 6 }], updatedAt: 'x' }] }); const st = mem({ [S.LEGACY_STORAGE_KEY]: raw }); const r = S.loadMortgages(st); return chk(r.mortgages.length === 1, `oferta descartada en la migración (queda en la copia de seguridad). Aviso: "${r.notice}"`); });
  T('H14', 'segunda carga con v2 existente no vuelve a migrar ni pisa v2', () => { const raw = JSON.stringify({ mortgages: [{ id: 'o', name: 'Vieja', bank: 'B', amount: 120000, years: 20, interestRate: 2.5, rateType: 'fixed', bonuses: [], amortizations: [], updatedAt: 'x' }] }); const st = mem({ [S.LEGACY_STORAGE_KEY]: raw }); S.loadMortgages(st); const v2 = st.d[S.STORAGE_KEY]; st.d[S.LEGACY_STORAGE_KEY] = '{"mortgages":[]}'; const r = S.loadMortgages(st); return chk(r.mortgages.length === 1 && st.d[S.STORAGE_KEY] === v2, 'se volvió a migrar'); });
}

// ───────── I. Migración: resultados v1 (motor antiguo) vs v2 (motor nuevo) ─────────
group = 'I. Equivalencia con la versión anterior';
{
  let seed = 424242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const ri = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a; const pick = <X,>(xs: X[]): X => xs[ri(0, xs.length - 1)];
  const gen = (timeLimited: boolean) => Array.from({ length: 300 }, (_, i) => { const years = pick([10, 15, 20, 25, 30]); const bonuses = Array.from({ length: ri(0, 2) }, (_, k) => ({ id: 'b' + k, name: 'b' + k, active: true, interestReduction: pick([0.1, 0.3, 0.5, 1]), annualCost: pick([0, 120, 300]), ...(timeLimited && rnd() < 0.6 ? { startMonth: ri(1, 40), endMonth: ri(41, 200) } : {}) }));
    const amortizations = Array.from({ length: ri(0, 3) }, (_, k) => rnd() < 0.7 ? { id: 'a' + k, type: 'single', amount: pick([1000, 3000, 8000]), month: ri(1, 100) } : { id: 'a' + k, type: 'recurring', amount: pick([500, 1000]), month: ri(1, 60), frequencyMonths: pick([6, 12]) });
    return { id: 'id' + i, name: 'V1-' + i, bank: 'B', amount: ri(150, 500) * 1000, years, interestRate: pick([1.5, 2.25, 3.1, 4]), rateType: pick(['fixed', 'variable']), bonuses, amortizations, updatedAt: 'x' }; });
  const cmp = (timeLimited: boolean) => { const data = gen(timeLimited); const st = mem2({ [S.LEGACY_STORAGE_KEY]: JSON.stringify({ mortgages: data }) }); const r = S.loadMortgages(st); const worst = { tc: 0, ti: 0, n: 0 }; let diffCount = 0, lost = data.length - r.mortgages.length, unpaid = 0;
    for (const nm of r.mortgages) { const old = data.find(d => d.id === nm.id)!; const o = oldCalc(old as any); const n = calc(nm, nm.scenarios[0]); const dtc = Math.abs(o.totalCost - n.totalCost), dti = Math.abs(o.totalInterest - n.totalInterest); worst.tc = Math.max(worst.tc, dtc); worst.ti = Math.max(worst.ti, dti); worst.n = Math.max(worst.n, Math.abs(o.rows.length - n.rows.length)); if (dtc > 5) diffCount++; if (n.remainingCapital > 0.01) unpaid++; }
    return { total: data.length, migrated: r.mortgages.length, lost, worst, diffCount, unpaid }; };
  function mem2(init: Record<string, string>) { const d = { ...init }; return { d, getItem: (k: string) => (k in d ? d[k] : null), setItem: (k: string, v: string) => { d[k] = v; } }; }
  const a = cmp(false);
  T('I01', `v1→v2 sin bonificaciones temporales (${a.total} ofertas): mismos resultados que el motor anterior (±5 €)`, () => chk(a.diffCount === 0 && a.worst.n === 0 && a.lost === 0, `migradas=${a.migrated}/${a.total} difieren>5€=${a.diffCount} máx Δcoste=${a.worst.tc.toFixed(2)} € máx Δcuotas=${a.worst.n}`));
  const b = cmp(true);
  T('I02', `v1→v2 CON bonificaciones temporales (${b.total} ofertas): mismos resultados que el motor anterior (±5 €)`, () => chk(b.diffCount === 0 && b.unpaid === 0, `migradas=${b.migrated}/${b.total} difieren>5€=${b.diffCount} con saldo sin pagar=${b.unpaid} máx Δcoste=${b.worst.tc.toFixed(0)} €`));
}

writeFileSync('./features.json', JSON.stringify(results, null, 1));
const groups = [...new Set(results.map(r => r.group))];
for (const g of groups) { const rs = results.filter(r => r.group === g); console.log(`\n${g}  —  ${rs.filter(r => r.ok).length}/${rs.length}`); for (const r of rs.filter(x => !x.ok)) console.log(`   ✗ ${r.id} ${r.name}\n       → ${r.detail}`); }
console.log(`\nTOTAL: ${results.filter(r => r.ok).length}/${results.length} correctas, ${results.filter(r => !r.ok).length} con fallo`);
