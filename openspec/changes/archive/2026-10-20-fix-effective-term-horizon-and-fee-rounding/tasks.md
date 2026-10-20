# Tareas

## 1. Plazo efectivo

- [x] 1.1 Mantener el mes final efectivo tras amortizaciones «Reducir plazo» y recalcular sobre el plazo vigente; comprobar los casos A1–A3, B1–B2 y la coherencia de `maxAmortizableAt`/`validateScenario` con `npx ng test --watch=false --include src/app/monthly-budget.spec.ts`.

## 2. Redondeo de comisiones

- [x] 2.1 Redondear cada comisión a céntimos con «medio hacia arriba» sin alterar el redondeo general; comprobar la tabla de importes y las 159 comisiones mensuales con la misma prueba de cálculo.

## 3. Confirmación de importación

- [x] 3.1 Confirmar la sustitución solo tras validar el archivo y conservar el estado al cancelar; comprobar confirmación, cancelación, ausencia de ofertas y rechazo de archivo inválido con `npx ng test --watch=false --include src/app/qa.spec.ts`.

## 4. Integración y cierre

- [x] 4.1 Actualizar U38 y ejecutar la batería independiente de `qa/`, incluidos los 4.000 escenarios aleatorios y las reproducciones demo2/demo3; guardar los resultados sin dejar artefactos generados.
- [x] 4.2 Ejecutar `npx ng test --watch=false`, `npx ng build --configuration development --base-href=/Mortgage-Comparison/` y `openspec validate fix-effective-term-horizon-and-fee-rounding --strict`.

## Workflow follow-up

- Archivar el cambio después de validar las especificaciones y las pruebas.
