## ADDED Requirements

### Requirement: Definición de capital restante
El sistema SHALL definir el capital restante de un mes como el capital pendiente después de aplicar la cuota ordinaria de ese mes, y SHALL tratarlo como el máximo amortizable en ese mes.

#### Scenario: Máximo amortizable
- **WHEN** el usuario consulta el máximo amortizable del mes N
- **THEN** el valor es el capital pendiente tras la cuota ordinaria del mes N según la simulación del escenario con el resto de eventos

### Requirement: Rechazo de amortización mayor que el capital restante
El sistema SHALL rechazar una amortización puntual cuyo importe sea mayor que el capital restante de su mes, SHALL NOT guardarla y SHALL mostrar el máximo exacto en el mensaje de error.

#### Scenario: Importe superior en un céntimo
- **WHEN** el capital restante del mes N es S y el usuario añade una amortización puntual de S + 0,01 €
- **THEN** el sistema no la guarda y muestra «No puedes amortizar más de lo que queda por pagar. Capital restante en el mes N: S.»

### Requirement: Cancelación total automática
El sistema SHALL registrar como cancelación total una amortización puntual cuyo importe sea igual al capital restante de su mes, comparando en céntimos, aplicando la comisión total y terminando la hipoteca en ese mes.

#### Scenario: Importe igual al capital restante
- **WHEN** el capital restante del mes N es S y el usuario añade una amortización puntual de exactamente S
- **THEN** se registra como cancelación total, se aplica la comisión total, el capital pendiente final es 0 y se muestra «Cancelación total en el mes N»

#### Scenario: Importe inferior en un céntimo
- **WHEN** el usuario añade una amortización puntual de S − 0,01 €
- **THEN** se registra como parcial, se aplica la comisión parcial y queda 0,01 € pendiente

### Requirement: Botón de cancelación total
El sistema SHALL ofrecer un botón «Cancelar totalmente» que rellene el importe exacto del capital restante del mes indicado.

#### Scenario: Rellenar importe exacto
- **WHEN** el usuario indica el mes N y pulsa «Cancelar totalmente»
- **THEN** el campo de importe se rellena con el capital restante del mes N

### Requirement: Amortización posterior a la cancelación
El sistema SHALL rechazar una amortización cuyo mes sea posterior al fin de la hipoteca o a una cancelación total ya existente.

#### Scenario: Mes posterior a la cancelación
- **WHEN** existe una cancelación total en el mes 60 y el usuario añade una amortización en el mes 70
- **THEN** el sistema la rechaza con «La hipoteca ya está cancelada o termina antes del mes 70.»

### Requirement: Revalidación en cadena
El sistema SHALL volver a validar todas las amortizaciones puntuales de un escenario cada vez que se añada, edite o elimine una amortización, bonificación o cantidad mensual, y SHALL rechazar el cambio si deja alguna por encima del capital restante.

#### Scenario: Cambio que invalida una posterior
- **WHEN** existe una cancelación total en el mes 100 y el usuario añade una amortización en el mes 50 que reduce el saldo
- **THEN** el sistema rechaza el cambio con «Este cambio dejaría la amortización del mes 100 por encima del capital restante.»

### Requirement: Validación al importar y al cargar
El sistema SHALL tratar como inválido un escenario con una amortización puntual mayor que el capital restante al importar un archivo o cargar de `localStorage`, indicando el nombre de la hipoteca y del escenario.

#### Scenario: Importación con amortización excesiva
- **WHEN** el archivo importado contiene una amortización puntual mayor que el capital restante de su mes
- **THEN** la importación se rechaza y el mensaje incluye el nombre de la hipoteca y del escenario

### Requirement: Amortizaciones recurrentes que superan el saldo
El sistema SHALL ajustar la última ocurrencia de una amortización recurrente al capital restante, tratarla como cancelación total y avisar con «La hipoteca quedará cancelada en el mes N», sin rechazar la configuración, salvo que la política `RECURRING_OVERFLOW_POLICY` sea `error`.

#### Scenario: Recurrente que cancela la hipoteca
- **WHEN** una amortización recurrente alcanza un mes en el que su importe supera el capital restante
- **THEN** ese mes se amortiza solo el capital restante con comisión total y se muestra el aviso informativo

### Requirement: Defensa del motor
El sistema SHALL garantizar que el cálculo nunca produzca un capital pendiente negativo ni valores `NaN` aunque reciba datos inválidos.

#### Scenario: Datos inválidos forzados
- **WHEN** se fuerza al motor una amortización mayor que el saldo
- **THEN** el capital pendiente resultante es 0 y ningún valor del resultado es `NaN`
