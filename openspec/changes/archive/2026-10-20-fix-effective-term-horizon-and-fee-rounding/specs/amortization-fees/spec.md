# Spec Delta

## MODIFIED Requirements

### Requirement: Comisión por amortización parcial
El sistema SHALL calcular la comisión de una amortización parcial como el importe amortizado multiplicado por el porcentaje parcial del mes, redondeado a céntimos con «medio hacia arriba», incluso cuando la representación en coma flotante del importe exacto quede por debajo del medio céntimo.

#### Scenario: Comisión parcial del 1 %
- **WHEN** se amortizan 10.000,00 € parcialmente en un mes con comisión parcial del 1 %
- **THEN** la comisión es 100,00 € y se suma al coste total

#### Scenario: Comisión con medio céntimo exacto
- **WHEN** se amortizan 242,50 € en un mes con comisión parcial del 1 %
- **THEN** la comisión es 2,43 €
