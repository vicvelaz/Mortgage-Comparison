import { calculateMortgage } from '../src/app/mortgage-calculator';
const mk = (events: any[], bonuses: any[], mode: any = 'reduceTerm', rateType: any = 'fixed') => {
  const m: any = { id:'m', name:'M', bank:'B', amount:180000, years:25, interestRate:4, rateType, cancellationFees:{partial:[],total:[]}, updatedAt:'x',
    scenarios:[{ id:'s', name:'S', mode, bonuses, amortizations: events }] };
  return calculateMortgage(m, m.scenarios[0]);
};
const bon = (end?: number) => [{ id:'b', name:'N', active:true, interestReduction:1.5, annualCost:0, startMonth:1, ...(end ? { endMonth: end } : {}) }];
const am = { id:'a', name:'a', active:true, type:'single', reductionType:'term', amount:20000, month:12 };
const show = (l: string, r: any) => console.log(l.padEnd(62), 'cuotas:', String(r.rows.length).padStart(3), '| cuota m36:', r.rows[35].payment.toFixed(2), '| cuota m37:', r.rows[36].payment.toFixed(2), '| intereses:', r.totalInterest.toFixed(0));
console.log('180.000 €, 25 años, 4 % fijo; bonificación -1,5 pts hasta el mes 36; amortización de 20.000 € en el mes 12 con "reducir plazo"\n');
show('1) con bonificación PERMANENTE (el tipo nunca cambia)', mk([am], bon()));
show('2) con bonificación que TERMINA en el mes 36', mk([am], bon(36)));
show('3) sin amortizar, bonificación que termina en el mes 36', mk([], bon(36)));
