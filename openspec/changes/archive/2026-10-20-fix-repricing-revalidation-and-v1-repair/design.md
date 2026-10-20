# Diseño

## Contexto

Véase [proposal.md](proposal.md) para la motivación y las especificaciones delta para el contrato observable. El cálculo, la validación y la migración comparten el modelo de escenarios; toda comparación monetaria debe seguir usando céntimos.

## Objetivos / No objetivos

**Objetivos:** mantener coherentes las cuotas tras cambios de tipo, impedir cambios de formulario que invaliden amortizaciones puntuales y preservar ofertas v1 reparables con copia de seguridad.

**No objetivos:** modificar el formato v2, ajustar amortizaciones v2 inválidas automáticamente ni cambiar el comportamiento de la cuota cuando no cambia el tipo.

## Decisiones

- **Reprecio ante cualquier cambio del tipo efectivo.** La decisión de recalcular no dependerá del tipo nominal ni del modo. El último mes programará el saldo completo más sus intereses para evitar vencimientos con deuda residual. Alternativa descartada: conservar el pago fijado para tipo fijo en «Reducir cuota», que hace depender la cuota del historial de amortizaciones.
- **Filtrado por saldo final en los KPI.** Los cuatro indicadores de mejor resultado usarán solo resultados cuyo saldo final no supere 0,01 €. La advertencia seguirá visible junto al resultado no cancelado. Alternativa descartada: ocultarlo de la lista, porque el usuario debe poder inspeccionar el escenario.
- **Validación cruzada sin bloquear estados de edición.** Para presupuesto y modo, primero se valida la estructura del presupuesto; solo si es válida se ejecuta la validación completa del escenario. Al rechazar, se restaura el control y se utiliza el contexto de validación para el mensaje de cambio en cadena, sin inventar un identificador de amortización. Los campos transitoriamente vacíos siguen siendo corregibles y `saveMortgage()` continúa siendo la defensa final.
- **Reparación solo para esquema v1.** Se procesan amortizaciones puntuales activas en orden de mes. Cada máximo se calcula con los eventos anteriores ya aceptados; importe mayor se ajusta al máximo y máximo cero desactiva el evento. Las recurrentes se mantienen. La validación completa posterior sigue descartando ofertas con otros errores. v2 continúa estricta. Alternativa descartada: reparar al validar cualquier versión, porque ocultaría datos v2 inválidos.
- **Cambios de tipo en «Reducir plazo».** Se conserva el comportamiento actual: la nueva cuota se calcula sobre el saldo pendiente y los meses restantes del plazo original. Esto puede recuperar parte del plazo reducido; se acepta como decisión de diseño, no como error comprobado.

## Riesgos / compensaciones

- [Un cálculo de máximo durante la migración puede incluir eventos del mismo mes] → activar solo las amortizaciones puntuales previamente aceptadas al calcular cada máximo; verificar orden y resultados con pruebas de referencia.
- [Un control puede quedar visualmente distinto del estado del escenario tras el rechazo] → restaurar explícitamente `checked`, `value` o `select.value` y cubrirlo con pruebas de componente.
- [La advertencia de saldo pendiente puede confundirse con un resultado utilizable] → filtrar cada KPI y mostrar el texto de advertencia junto al resultado afectado.

## Plan de migración

No cambia el esquema persistido. Al arrancar con v1 sin v2, conservar la copia cruda y la clave v1, reparar ofertas antes de validarlas y guardar las aceptadas en v2. Un rollback consiste en volver a la versión anterior de la aplicación: la clave v1 y su copia siguen intactas. La lectura e importación v2 no reciben reparación.