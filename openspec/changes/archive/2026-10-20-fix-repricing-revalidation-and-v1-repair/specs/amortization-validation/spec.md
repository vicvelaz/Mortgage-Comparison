## MODIFIED Requirements

### Requirement: Revalidación en cadena
El sistema SHALL volver a validar todas las amortizaciones puntuales de un escenario cada vez que se añada, edite, elimine o active una amortización, bonificación, la cantidad mensual o el modo de amortización, y SHALL rechazar el cambio restaurando el valor anterior si deja alguna por encima del capital restante.

#### Scenario: Cambio que invalida una posterior
- **WHEN** existe una cancelación total en el mes 100 y el usuario añade una amortización en el mes 50 que reduce el saldo
- **THEN** el sistema rechaza el cambio con «Este cambio dejaría la amortización del mes 100 por encima del capital restante.»

#### Scenario: Cambio que invalida una amortización posterior
- **WHEN** existe una cancelación total en el mes 100 y activar la cantidad mensual o cambiar el modo deja esa amortización por encima del capital restante
- **THEN** el sistema no aplica el cambio, muestra «Este cambio dejaría la amortización del mes 100 por encima del capital restante» y restaura el control

#### Scenario: Edición intermedia del importe mensual
- **WHEN** el usuario vacía temporalmente el campo de cantidad mensual para escribir otro importe
- **THEN** el sistema permite el estado intermedio y reserva los errores del campo para la validación al guardar, siempre que no invalide una amortización puntual