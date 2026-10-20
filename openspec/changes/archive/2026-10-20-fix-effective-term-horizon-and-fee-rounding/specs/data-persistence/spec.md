# Spec Delta

## ADDED Requirements

### Requirement: Confirmación al importar
El sistema SHALL confirmar antes de sustituir las ofertas actuales al importar un archivo válido y SHALL conservarlas si el usuario cancela.

#### Scenario: Importar con ofertas y confirmar
- **WHEN** existen ofertas actuales y el usuario confirma la importación de un archivo válido
- **THEN** el sistema sustituye las ofertas actuales por las importadas y muestra «Importación completada.»

#### Scenario: Importar con ofertas y cancelar
- **WHEN** existen ofertas actuales y el usuario cancela la importación
- **THEN** el sistema conserva las ofertas actuales, limpia el selector de archivo y muestra «Importación cancelada.»

#### Scenario: Importar sin ofertas actuales
- **WHEN** no existen ofertas actuales y el usuario importa un archivo válido
- **THEN** el sistema importa el archivo sin pedir confirmación
