# Diseño

## Desglose
Cada fila del cuadro ya trae `interest`, `principal` (capital ordinario) y `extraPayment`. El % de intereses de la cuota es `interest / payment × 100` y el de capital es `principal_ordinario / payment × 100`. La amortización extra se muestra aparte y no entra en la cuota ordinaria.

## Gráfico apilado
Chart.js `bar` con `stacked: true`. Series: intereses, capital ordinario, amortización extra. Agregación anual: suma de los 12 meses; el último año puede tener menos meses. Conmutador anual o mensual.

## Comparación por escenario
- Elemento comparable: par `(mortgageId, scenarioId)`. Etiqueta «Hipoteca · Escenario».
- «Mismo origen»: todos los seleccionados pertenecen a la misma hipoteca.
- Diferencias frente al base (primer escenario de esa hipoteca): ahorro de intereses, diferencia de coste total, meses ahorrados, diferencia de cuota inicial.
- El aviso «capital o plazo distintos» (F3) solo se muestra si algún par de seleccionados difiere en `amount` o `years`.

## Etiquetas del gráfico de capital pendiente
`labels` = meses de la serie más larga: `Math.max(...rows.map(r => r.result.rows.length))`. Las series más cortas se rellenan con `null` o se dejan terminar sin extrapolar.

## Comisiones en tabla y gráfico
Nueva columna «Comisiones» y nueva barra en el desglose «Coste total / Intereses / Bonificaciones / Comisiones».
