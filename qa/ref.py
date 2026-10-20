import json, math, collections
from decimal import Decimal as D, getcontext, ROUND_HALF_UP
getcontext().prec = 50
INF = 10**9

def c(x):  # a céntimos, half-up como Math.round
    return int((D(x)*100).to_integral_value(rounding=ROUND_HALF_UP))
def rc(x): return D(c(x))/100

def annuity(rem, r, k):
    if rem <= 0 or k <= 0: return D(0)
    return rem/k if r == 0 else rem*r/(1-(1+r)**(-k))

def tier(tiers, month):
    for t in tiers:
        if t['fromMonth'] <= month <= t.get('toMonth', INF) if t.get('toMonth') is not None else t['fromMonth'] <= month: return D(str(t['percent']))
    return D(0)

def simulate(m, s, with_events=True):
    n = int(round(m['years']*12)); rem = D(str(m['amount'])); ti = bc = fees = D(0)
    fixed = None; prev = None; path=[]; pays=[]; extras=[]; cancel=None; first=None; cash=[]
    for k in range(1, n+1):
        if rem <= D('1e-8'): break
        red = D(0); cost = D(0)
        for b in s['bonuses']:
            st = b.get('startMonth', 1) or 1; en = b.get('endMonth'); en = INF if en is None else en
            if b['active'] and st <= k <= en: red += D(str(b['interestReduction'])); cost += D(str(b['annualCost']))/12
        rate = max(D(0), D(str(m['interestRate'])) - red)/1200
        interest = rem*rate; left = n-k+1
        changed = prev is not None and rate != prev
        pay = annuity(rem, rate, left) if (fixed is None or changed) else fixed
        pay = min(rem+interest, pay)
        principal = min(rem, pay-interest)
        rem -= principal
        ev = []
        if with_events:
            for a in s['amortizations']:
                if not a['active']: continue
                if a['type'] == 'single': hit = (k == a['month'])
                else: hit = k >= a['month'] and a.get('frequencyMonths') and (k-a['month']) % a['frequencyMonths'] == 0
                if hit: ev.append((a['reductionType'], D(str(a['amount']))))
            b = s.get('monthlyBudget')
            if b and k >= b['startMonth'] and k <= (INF if b.get('endMonth') is None else b['endMonth']):
                avail = c(D(str(b['amount']))) - c(interest+principal)
                if avail > 0 and c(rem) > 0:
                    p = tier(m['cancellationFees']['partial'], k)
                    pc = int((D(avail)/(1+p/100)).to_integral_value(rounding=ROUND_HALF_UP))
                    if pc > 0: ev.append(('term' if s['mode']=='reduceTerm' else 'payment', D(pc)/100))
        ev.sort(key=lambda e: 1 if e[0]=='term' else 0)
        nxt = pay if (fixed is None or changed) else fixed
        extra = D(0); fee = D(0)
        for rt, amt in ev:
            req = c(amt); bal = c(rem)
            if req <= 0 or bal <= 0: continue
            total = req >= bal
            a = rem if total else D(req)/100
            pct = tier(m['cancellationFees']['total' if total else 'partial'], k)
            ef = rc(a*pct/100)
            rem = D(0) if total else rem-a
            extra += a; fee += ef
            if total and cancel is None: cancel = k
            if rt == 'payment' and left > 1 and rem > 0: nxt = annuity(rem, rate, left-1)
        if ev: fixed = nxt
        elif changed: fixed = pay
        prev = rate
        if rem < D('1e-8'): rem = D(0)
        ti += interest; bc += cost; fees += fee
        if first is None: first = interest+principal
        path.append(rem); pays.append(interest+principal); extras.append(extra)
    tc = D(str(m['amount'])) - rem + ti + bc + fees
    return dict(n=len(path), first=first or D(0), ti=ti, bc=bc, fees=fees, tc=tc, rem=rem, cancel=cancel, path=path, pays=pays, extras=extras)

cases = json.load(open('cases.json'))
stats = collections.defaultdict(lambda: dict(n=0, fail=0, maxd=0.0))
bad = []
for i, cs in enumerate(cases):
    m, s, r = cs['m'], cs['s'], cs['r']
    x = simulate(m, s, True); y = simulate(m, s, False)
    sav = y['tc'] - x['tc']
    pd = max((abs(float(a)-b) for a, b in zip(x['path'], r['path'])), default=0.0) if x['n']==r['n'] else 1e9
    d = dict(first=abs(float(x['first'])-r['first']), ti=abs(float(x['ti'])-r['ti']), bc=abs(float(x['bc'])-r['bc']),
             fees=abs(float(x['fees'])-r['fees']), tc=abs(float(x['tc'])-r['tc']), sav=abs(float(sav)-r['sav']), path=pd)
    ok = x['n'] == r['n'] and x['cancel'] == r['cancel'] and all(v <= 0.02 for v in d.values())
    st = stats[cs['tag']]; st['n'] += 1; st['maxd'] = max(st['maxd'], max(d.values()) if x['n']==r['n'] else 1e9)
    if not ok:
        st['fail'] += 1
        bad.append((i, cs['tag'], m['rateType'], s['mode'], x['n'], r['n'], x['cancel'], r['cancel'], {k: round(v,3) for k, v in d.items()}))
print(f"{'grupo':8}{'casos':>7}{'fallos':>8}{'desv.max(€)':>14}")
for t, st in stats.items(): print(f"{t:8}{st['n']:>7}{st['fail']:>8}{st['maxd']:>14.4f}")
json.dump(bad, open('bad.json', 'w'))
print('TOTAL', len(cases), 'fallos', len(bad))
