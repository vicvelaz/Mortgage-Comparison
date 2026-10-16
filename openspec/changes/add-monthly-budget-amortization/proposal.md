# Cambio: cantidad mensual dedicada a la hipoteca

## Por qué
Los usuarios piensan en «cuánto puedo dedicar al mes a la hipoteca», no en una lista de amortizaciones sueltas. Hoy tienen que calcular a mano la diferencia con la cuota y crear una amortización recurrente, que además queda desfasada cuando la cuota cambia por una bonificación.

## Qué cambia
- Cada escenario puede tener una **cantidad mensual dedicada** (importe, mes inicial, mes final opcional).
- En cada mes del periodo, la amortización extra es la diferencia entre esa cantidad y la cuota ordinaria, descontando la comisión parcial, de modo que el desembolso del mes es exactamente la cantidad indicada.
- Si la cantidad es menor o igual que la cuota, no hay amortización extra.
- Selector de **modo de amortización** por escenario: «Reducir cuota» (comportamiento actual, por defecto) o «Reducir plazo».
- El último mes, la amortización se ajusta al capital restante y cuenta como cancelación total.

## Impacto
- Spec nueva: `monthly-budget`.
- Código: `mortgage-calculator.ts` (motor), `mortgage-validation.ts`, `workspace.ts`, `workspace.html`.
- Sin cambio numérico para escenarios sin cantidad mensual y en modo «Reducir cuota».

## Depende de
`add-scenarios-data-model-v2` y `add-cancellation-fees-and-total-cancellation` (la comisión sale de la cantidad mensual y la última ocurrencia es una cancelación total).
