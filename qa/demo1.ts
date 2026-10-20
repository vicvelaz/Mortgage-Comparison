import { calculateMortgage } from '../src/app/mortgage-calculator';
const mk = (events: any[], rateType: any = 'fixed', mode: any = 'reduceInstallment') => {
  const m: any = { id:'m', name:'M', bank:'B', amount:180000, years:25, interestRate:4, rateType, cancellationFees:{partial:[],total:[]}, updatedAt:'x',
    scenarios:[{ id:'s', name:'S', mode, bonuses:[{id:'b',name:'Nómina',active:true,interestReduction:1.5,annualCost:0,startMonth:1,endMonth:36}], amortizations: events }] };
  return calculateMortgage(m, m.scenarios[0]);
};
const am = (amount:number, month:number) => ({ id:'a', name:'a', active:true, type:'single', reductionType:'payment', amount, month });
const show = (label: string, r: any) => console.log(label.padEnd(44), 'cuota m36:', r.rows[35].payment.toFixed(2).padStart(8), '| cuota m37:', r.rows[36].payment.toFixed(2).padStart(8),
  '| nº cuotas:', String(r.rows.length).padStart(3), '| saldo final:', r.remainingCapital.toFixed(2), '| intereses:', r.totalInterest.toFixed(2));
console.log('Hipoteca 180.000 €, 25 años, 4 % fijo, bonificación -1,5 pts hasta el mes 36 (el tipo sube a 4 % en el mes 37)\n');
show('A) sin amortizaciones', mk([]));
show('B) amortización de 1 € en el mes 12', mk([am(1, 12)]));
show('C) amortización de 20.000 € en el mes 12', mk([am(20000, 12)]));
show('D) como C pero con tipo VARIABLE', mk([am(20000, 12)], 'variable'));
show('E) como C pero modo reducir plazo', mk([am(20000, 12)], 'fixed', 'reduceTerm'));
