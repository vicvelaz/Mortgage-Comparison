# Diseño

## Contexto

Véase [proposal.md](proposal.md) para la motivación y las especificaciones para los requisitos observables. El motor aplica la cuota programada antes de los eventos de amortización y comparte `calculateSchedule` con el cálculo de máximos y la validación. La importación valida y parsea el archivo antes de modificar el estado del espacio de trabajo.

## Objetivos / No objetivos

**Objetivos:** conservar el horizonte reducido a través de recálculos de cuota, redondear comisiones de manera determinista en céntimos y evitar reemplazos de datos no confirmados.

**No objetivos:** modificar el redondeo monetario general, los escenarios sin amortizaciones de «Reducir plazo», los flujos de cuota originales ni el formato persistido.

## Decisiones

- **Representar el plazo vigente como mes final efectivo.** Inicializarlo con el plazo contractual y calcular los meses restantes a partir de ese mes final. Tras aplicar uno o más eventos de «Reducir plazo», estimar el número de cuotas restantes con el saldo, tipo mensual y cuota que se mantiene, limitando el nuevo final al plazo contractual. Las amortizaciones de «Reducir cuota» y los cambios de tipo solo recalculan la cuota sobre el horizonte vigente. Si la cuota no cubre los intereses, el cálculo del horizonte devuelve infinito y conserva el límite contractual. Alternativa descartada: restar meses de manera fija por cada amortización, porque no refleja el capital y la cuota reales.
- **Redondear las comisiones en céntimos.** Convertir primero el importe amortizado a céntimos, aplicar el porcentaje y redondear los céntimos con «medio hacia arriba» y una tolerancia pequeña para el error binario. Mantener los helpers generales de redondeo sin cambios. Alternativa descartada: añadir epsilon al importe en euros o cambiar el redondeo global, porque afectaría cálculos no relacionados.
- **Confirmar después de validar el archivo.** Parsear el archivo y rechazar errores antes de mostrar el diálogo; si hay ofertas actuales, pedir confirmación justo antes de sustituirlas. Cancelar conserva el estado y comunica la decisión. La limpieza del selector sigue en `finally`. Alternativa descartada: preguntar antes de validar, porque se interrumpiría innecesariamente al usuario para archivos inválidos.
- **Reutilizar la validación y el cálculo existentes.** `maxAmortizableAt` y `validateScenario` heredan el horizonte efectivo mediante `calculateSchedule`; mantener pruebas sobre límites de amortización para asegurar que cálculo y validación coinciden.

## Riesgos / compensaciones

- [El redondeo al estimar el mes de cancelación puede afectar el horizonte en un mes límite] → cubrir los casos con referencia independiente y mantener la defensa de liquidación del último mes contractual.
- [El redondeo half-up puede diferir de `Math.round` en importes exactos a medio céntimo] → limitar el nuevo comportamiento a comisiones y comprobar la tabla de casos de referencia.
- [Un usuario puede cancelar una importación válida por error] → no alterar estado ni almacenamiento al cancelar, mostrar el estado de cancelación y permitir volver a seleccionar el archivo.

## Plan de migración

No hay migración de datos ni cambio de esquema. El despliegue solo cambia cálculos futuros y la interacción de importación. Para revertir, basta con volver a la versión anterior; los archivos importados y los datos existentes mantienen el formato v2.
