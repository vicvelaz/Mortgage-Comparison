# monthly-budget Specification

## Purpose
TBD - created by archiving change add-monthly-budget-amortization. Update Purpose after archive.

## Requirements

### Requirement: Cantidad mensual dedicada
El sistema SHALL permitir definir en cada escenario una cantidad mensual dedicada a la hipoteca con importe mayor que 0, mes inicial entero mayor o igual que 1 y mes final opcional entero mayor o igual que el inicial.

#### Scenario: Configuración válida
- **WHEN** el usuario define 1.000 € desde el mes 1 sin mes final
- **THEN** la cantidad mensual se guarda y se aplica hasta cancelar la hipoteca o terminar el plazo

#### Scenario: Mes final anterior al inicial
- **WHEN** el usuario define mes inicial 24 y mes final 12
- **THEN** el sistema rechaza la configuración con un mensaje de error

### Requirement: Amortización extra como diferencia con la cuota
El sistema SHALL calcular la amortización extra de cada mes del periodo como la diferencia entre la cantidad mensual y la cuota ordinaria de ese mes, y SHALL NOT amortizar extra en los meses en que la cantidad sea menor o igual que la cuota.

#### Scenario: Cantidad igual o menor que la cuota
- **WHEN** la cantidad mensual es menor o igual que la cuota ordinaria
- **THEN** no hay amortización extra y el resultado es idéntico al del escenario sin cantidad mensual

#### Scenario: Cantidad superior a la cuota
- **WHEN** la cantidad mensual es la cuota ordinaria más 300 € y la comisión parcial es 0 %
- **THEN** cada mes del periodo se amortizan exactamente 300 € extra

### Requirement: La comisión sale de la cantidad mensual
El sistema SHALL descontar la comisión parcial de la cantidad mensual de modo que la amortización extra más la comisión sea igual a la diferencia entre la cantidad y la cuota, con tolerancia de 0,01 € por redondeo.

#### Scenario: Comisión parcial del 1 %
- **WHEN** la cantidad mensual es la cuota más 303 € y la comisión parcial es 1 %
- **THEN** la amortización extra es 300,00 €, la comisión es 3,00 € y el desembolso del mes es la cantidad mensual

### Requirement: Último mes de la hipoteca
El sistema SHALL ajustar la amortización del último mes al capital restante cuando la diferencia con la cuota lo supere, tratarla como cancelación total con comisión total y avisar de la fecha de cancelación.

#### Scenario: Cancelación por cantidad mensual
- **WHEN** la amortización calculada para un mes supera el capital restante
- **THEN** se amortiza solo el capital restante con comisión total, el capital final es 0 y se muestra «Con esta configuración la hipoteca quedará cancelada en el mes N»

### Requirement: Modo de amortización
El sistema SHALL ofrecer en cada escenario los modos «Reducir cuota» (por defecto) y «Reducir plazo», SHALL recalcular la cuota ordinaria siempre que cambie el tipo efectivo, independientemente de la modalidad del tipo y del modo, y SHALL liquidar todo el capital pendiente en la cuota programada del último mes del plazo.

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

### Requirement: Compatibilidad con otras amortizaciones
El sistema SHALL sumar la cantidad mensual dedicada a las amortizaciones puntuales y recurrentes del escenario y SHALL aplicar a estas la validación contra el capital restante.

#### Scenario: Cantidad mensual con amortización puntual
- **WHEN** un escenario tiene cantidad mensual y una amortización puntual en el mes 12
- **THEN** en el mes 12 se aplican ambas y el capital pendiente refleja la suma

### Requirement: Sin cambio para escenarios sin cantidad mensual
El sistema SHALL producir resultados idénticos a los anteriores en escenarios sin cantidad mensual y en modo «Reducir cuota».

#### Scenario: Valores de referencia
- **WHEN** se calcula una hipoteca de 100.000 €, 30 años y 3 % sin cantidad mensual
- **THEN** la cuota es 421,60 €
