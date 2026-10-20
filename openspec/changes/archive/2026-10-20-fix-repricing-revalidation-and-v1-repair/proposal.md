# Propuesta

## Por qué

La segunda ronda de pruebas detectó escenarios que no cancelan dentro del plazo por mantener una cuota obsoleta, cambios de presupuesto que dejan amortizaciones inválidas y ofertas v1 que se pierden al migrar. Corregirlo protege la comparación y conserva datos legados sin relajar la validación de datos v2.

## Qué cambia

- Recalcular la cuota ante cada cambio del tipo efectivo y liquidar el saldo pendiente en el último mes.
- Excluir de los indicadores de mejor oferta los resultados con capital pendiente al final del plazo y advertirlo en la interfaz.
- Revalidar cambios de cantidad mensual y modo contra todas las amortizaciones puntuales, rechazando el cambio e informando al usuario cuando corresponda.
- Reparar amortizaciones puntuales excesivas o posteriores a la cancelación durante la migración v1; mantener estricta la carga e importación v2.
- Añadir pruebas de regresión para cálculo, controles del formulario, ranking y migración.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `monthly-budget`: recálculo de cuota al cambiar el tipo efectivo, liquidación final y revalidación de presupuesto/modo.
- `amortization-validation`: revalidación en cadena al editar presupuesto y modo.
- `payment-breakdown`: advertencia y exclusión de resultados que no cancelan dentro del plazo.
- `data-persistence`: reparación de amortizaciones puntuales solo al migrar desde v1.

## Impacto

Afecta al motor y pruebas de cálculo, al formulario de escenarios, a los KPIs y tabla comparativa, al parser/migrador de almacenamiento y a sus pruebas. No añade dependencias ni cambia el formato v2.