# Spec Delta

## MODIFIED Requirements

### Requirement: Modo de amortización
El sistema SHALL ofrecer en cada escenario los modos «Reducir cuota» (por defecto) y «Reducir plazo», SHALL recalcular la cuota ordinaria siempre que cambie el tipo efectivo, independientemente de la modalidad del tipo y del modo, SHALL mantener el plazo vigente tras «Reducir plazo» en posteriores cambios de tipo o amortizaciones de «Reducir cuota», y SHALL liquidar todo el capital pendiente en la cuota programada del último mes del plazo.

#### Scenario: Reducir cuota
- **WHEN** el modo es «Reducir cuota» y hay amortizaciones extra
- **THEN** el número de cuotas coincide con el plazo y la cuota ordinaria disminuye tras cada amortización

#### Scenario: Reducir plazo
- **WHEN** el modo es «Reducir plazo» y hay amortizaciones extra
- **THEN** la cuota ordinaria se mantiene constante, la hipoteca termina antes del plazo y el capital final es 0

#### Scenario: Cambio de tipo en modo reducir plazo
- **WHEN** una bonificación cambia el tipo en un mes y el modo es «Reducir plazo»
- **THEN** la cuota se recalcula sobre el saldo pendiente y los meses que quedan del plazo vigente, y se mantiene constante hasta el siguiente cambio de tipo

#### Scenario: Cambio de tipo tras una amortización en tipo fijo
- **WHEN** una bonificación cambia el tipo en el mes 37 y existe una amortización previa en un préstamo de tipo fijo en modo «Reducir cuota»
- **THEN** la cuota del mes 37 se recalcula sobre el saldo y los meses restantes y el capital pendiente final es 0

#### Scenario: Cuota que baja al empezar una bonificación
- **WHEN** una bonificación empieza en el mes 48 tras una amortización en el mes 12
- **THEN** la cuota del mes 48 es menor que la del mes 47

#### Scenario: Liquidación del último mes
- **WHEN** queda capital pendiente al comenzar el último mes del plazo
- **THEN** la cuota programada cubre el capital y los intereses pendientes y el capital final es 0

#### Scenario: Cambio de tipo tras reducir plazo
- **WHEN** una amortización de «Reducir plazo» deja la hipoteca en 257 cuotas y después una bonificación termina en el mes 36
- **THEN** la cuota se recalcula sobre el plazo vigente y la hipoteca sigue terminando en 257 cuotas

#### Scenario: Reducir cuota tras reducir plazo
- **WHEN** existe una amortización de «Reducir plazo» y después una de «Reducir cuota»
- **THEN** la segunda reduce la cuota manteniendo el plazo ya reducido
