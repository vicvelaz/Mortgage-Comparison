## MODIFIED Requirements

### Requirement: Modo de amortización
El sistema SHALL ofrecer los modos «Reducir cuota» y «Reducir plazo» y SHALL recalcular la cuota ordinaria siempre que cambie el tipo efectivo, independientemente de la modalidad del tipo y del modo. En el último mes del plazo, la cuota programada SHALL liquidar todo el capital pendiente.

#### Scenario: Reducir cuota
- **WHEN** el modo es «Reducir cuota» y hay amortizaciones extra
- **THEN** el número de cuotas coincide con el plazo y la cuota ordinaria disminuye tras cada amortización

#### Scenario: Reducir plazo
- **WHEN** el modo es «Reducir plazo» y hay amortizaciones extra
- **THEN** la cuota ordinaria se mantiene constante, la hipoteca termina antes del plazo y el capital final es 0

#### Scenario: Cambio de tipo en modo reducir plazo
- **WHEN** una bonificación cambia el tipo en un mes y el modo es «Reducir plazo»
- **THEN** la cuota se recalcula sobre el saldo y los meses restantes del plazo original y se mantiene constante hasta el siguiente cambio de tipo

#### Scenario: Cambio de tipo tras una amortización en tipo fijo
- **WHEN** una bonificación cambia el tipo en el mes 37 y existe una amortización previa en un préstamo de tipo fijo en modo «Reducir cuota»
- **THEN** la cuota del mes 37 se recalcula sobre el saldo y los meses restantes y el capital pendiente final es 0

#### Scenario: Cuota que baja al empezar una bonificación
- **WHEN** una bonificación empieza en el mes 48 tras una amortización en el mes 12
- **THEN** la cuota del mes 48 es menor que la del mes 47

#### Scenario: Liquidación del último mes
- **WHEN** queda capital pendiente al comenzar el último mes del plazo
- **THEN** la cuota programada cubre el capital y los intereses pendientes y el capital final es 0