# Cambio: desglose de la mensualidad y comparación de escenarios

## Por qué
El usuario no ve cuánto de cada cuota va a intereses y cuánto a capital, y no puede comparar de forma directa la misma hipoteca con distintas bonificaciones o amortizaciones. Además, el gráfico de capital pendiente toma las etiquetas de la primera serie y puede cortar las más largas.

## Qué cambia
- Desglose de cada mensualidad en intereses, capital ordinario y amortización extra, con porcentajes.
- Gráfico de barras apiladas por año con conmutador anual o mensual.
- Selección en `/comparison` por **escenario**, con tabla de diferencias frente al escenario base.
- El aviso de capital o plazo distintos solo aparece si las hipotecas comparadas difieren en capital o plazo.
- El gráfico de capital pendiente usa como etiquetas la serie más larga.
- Línea de comisiones en la tabla y el gráfico de desglose.

## Impacto
- Specs nuevas: `payment-breakdown`, `scenario-comparison`.
- Código: `workspace.ts`, `workspace.html`. Sin cambios en el motor salvo exponer datos ya calculados.

## Depende de
Los tres cambios anteriores.
