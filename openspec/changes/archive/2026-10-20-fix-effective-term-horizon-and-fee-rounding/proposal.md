# Propuesta

## Por qué

Una amortización de «Reducir plazo» no conserva hoy su horizonte acortado cuando cambia el tipo o se aplica después una amortización de «Reducir cuota». Además, las comisiones con medio céntimo exacto pueden redondearse a la baja por la representación binaria de los importes. La importación también sustituye ofertas sin confirmación, con riesgo de pérdida accidental de datos.

## Qué cambia

- Mantener un mes final efectivo tras las amortizaciones de «Reducir plazo» y usarlo para recalcular cuotas.
- Redondear cada comisión a céntimos con «medio hacia arriba», tolerando errores de coma flotante.
- Pedir confirmación antes de sustituir ofertas existentes al importar un archivo válido.
- Añadir pruebas de regresión para cálculo, comisiones, validación de amortizaciones e importación.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `monthly-budget`: conservar el plazo vigente al cambiar el tipo o aplicar amortizaciones de «Reducir cuota» tras «Reducir plazo».
- `amortization-fees`: redondear las comisiones parciales y totales a céntimos con «medio hacia arriba».
- `data-persistence`: confirmar la sustitución de ofertas actuales al importar.

## Impacto

Afecta al motor de cálculo, a la importación del espacio de trabajo, a sus pruebas y a las especificaciones OpenSpec. No añade dependencias ni cambia el formato de persistencia.
