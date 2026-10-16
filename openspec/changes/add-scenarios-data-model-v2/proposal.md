# Cambio: modelo de datos v2 con escenarios

## Por qué
Hoy cada oferta tiene un único conjunto de bonificaciones y amortizaciones. Para comparar la misma hipoteca con distintas bonificaciones o amortizaciones hay que duplicarla entera, repitiendo importe, plazo y tipo. Además, el aviso de comparación engañosa (capital o plazo distintos) aparecería sin necesidad.

## Qué cambia
- Una hipoteca guarda lo común (importe, plazo, tipo, modalidad, fecha de inicio) y contiene uno o más **escenarios**.
- Cada escenario guarda sus bonificaciones y amortizaciones.
- `calculateMortgage` pasa a recibir `(mortgage, scenario)`.
- Acciones de escenario: crear, duplicar, renombrar, eliminar.
- Esquema de almacenamiento `v2` con migración automática desde `v1` y copia de seguridad.
- Importación de JSON v1 y v2. Exportación siempre v2 con `schemaVersion: 2`.
- Los registros inválidos se descartan de forma individual en lugar de vaciar todos los datos.

## Impacto
- Specs nuevas: `mortgage-scenarios`, `data-persistence`.
- Código: `mortgage-calculator.ts`, `workspace.ts`, `workspace.html`, función de validación compartida.
- **Sin cambio numérico** para hipotecas existentes: tras migrar, los resultados son idénticos.

## Depende de
Corrección de fallos F1 a F7 (módulo de validación compartida).
