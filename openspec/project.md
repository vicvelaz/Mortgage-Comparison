# Contexto del proyecto

## Propósito
Simulador y comparador de hipotecas para ayudar al cliente a elegir la mejor opción. Permite crear ofertas, simular su cuadro de amortización y compararlas.

## Stack
- Angular 22 (signals, componentes standalone), Angular Material, Chart.js 4, RxJS.
- Tests: Vitest vía `npx ng test --watch=false`. Build: `npx ng build --base-href=/Mortgage-Comparison/`.
- Despliegue: GitHub Pages (SPA con fallback 404.html). Sin backend: los datos viven en `localStorage`.

## Archivos clave
- `src/app/mortgage-calculator.ts`: motor de cálculo (sistema francés).
- `src/app/workspace.ts` / `workspace.html`: un único componente que sirve `/dashboard`, `/mortgages` y `/comparison`.
- `src/app/mortgage-validation.ts`: reglas de validación compartidas (creado al corregir los fallos F1 a F7; **precondición de estos cambios**).

## Convenciones
- Textos de interfaz en español. Código y nombres de tipos en inglés.
- Signals en lugar de observables para estado de UI. Estilo según `.prettierrc`.
- Sin dependencias nuevas.
- **Todo el dinero se calcula y compara en céntimos** (helper `cents`). La igualdad «importe == capital restante» se evalúa en céntimos.
- Un test por cada escenario de especificación, en `src/app/*.spec.ts`.

## Glosario del dominio
- **Cuota ordinaria:** pago mensual contractual (intereses + capital programado).
- **Capital restante de un mes:** capital pendiente **después** de aplicar la cuota ordinaria de ese mes. Es el máximo amortizable en ese mes.
- **Amortización parcial:** pago extra menor que el capital restante.
- **Cancelación total:** pago extra igual al capital restante; la hipoteca termina ese mes.
- **Escenario:** variante de una misma hipoteca con sus propias bonificaciones, amortizaciones y cantidad mensual.
- **Bonificación:** reduce el tipo (puntos porcentuales) a cambio de un coste anual. El tipo efectivo nunca baja de 0 %.

## Valores de referencia que no deben cambiar
- 100.000 €, 30 años, 3 % → cuota 421,60 €.
- 180.000 €, 25 años, 3,10 % → cuota 862,97 €, intereses 78.891,73 €, 300 cuotas.
- 10.000 €, 1 año, 0 % → cuota 833,33 €, 0 € de intereses.

## Orden de los cambios (dependen unos de otros)
1. `add-scenarios-data-model-v2`
2. `add-cancellation-fees-and-total-cancellation`
3. `add-monthly-budget-amortization`
4. `add-payment-breakdown-and-scenario-comparison`
