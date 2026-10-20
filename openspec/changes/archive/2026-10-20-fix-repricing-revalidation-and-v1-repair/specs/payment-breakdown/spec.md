## ADDED Requirements

### Requirement: Resultados que no cancelan el préstamo
El sistema SHALL advertir cuando un resultado termine el plazo con capital pendiente mayor que 0,01 € y SHALL excluirlo de los indicadores de menor coste total, menor cuota inicial, menos intereses y mejor coste relativo.

#### Scenario: Saldo pendiente al final del plazo
- **WHEN** un escenario termina el plazo con capital pendiente mayor que 0,01 €
- **THEN** se muestra «No se cancela dentro del plazo» y no puede ser elegido como el «Menor coste total» ni como mejor resultado en los demás indicadores