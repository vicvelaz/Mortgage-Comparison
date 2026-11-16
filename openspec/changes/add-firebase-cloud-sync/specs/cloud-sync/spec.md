# Spec Delta

## Purpose

Permite que cada usuario sincronice sus ofertas de hipoteca entre dispositivos mediante una cuenta, sin perder el modo local ni exponer sus datos a otros usuarios.

## ADDED Requirements

### Requirement: Uso como invitado y acceso opcional con cuenta

El sistema SHALL ofrecer un modo invitado que no requiere registro ni conexión a Internet, además de permitir autenticación Google opcional para sincronizar ofertas.

#### Scenario: Usar todas las funciones como invitado sin conexión

- **WHEN** el usuario abre la aplicación sin una sesión autenticada y sin conexión a Internet
- **THEN** puede crear, editar, comparar, importar y exportar ofertas, y estas se guardan en el almacenamiento local v2 como en el uso actual

#### Scenario: Cancelar o fallar el inicio de sesión

- **WHEN** el inicio de sesión no se completa
- **THEN** la sesión permanece cerrada, los datos locales se conservan y se muestra un aviso comprensible

### Requirement: Aislamiento y validación de datos por usuario

El sistema SHALL permitir a cada usuario autenticado leer, crear, actualizar y borrar únicamente documentos de sus propias ofertas. Las reglas SHALL validar el esquema y los campos de los documentos al escribir; el repositorio SHALL validar los documentos al recomponerlos y rechazar registros malformados.

El almacenamiento SHALL separar los campos comunes de la oferta y sus elementos repetibles en documentos raíz y subcolecciones bajo `users/{uid}/mortgages/{mortgageId}`. Cada documento hijo SHALL guardar su índice y generación para preservar el orden v2 y evitar lecturas parciales. Un guardado SHALL activar una generación completa de forma atómica y SHALL limpiar después las generaciones anteriores. Cada documento SHALL cumplir un esquema cerrado, tener nombres de hasta 200 caracteres y respetar el máximo de 1 MiB de Firestore. El repositorio SHALL rechazar ofertas recompuestas que superen 8 escenarios, 16 bonificaciones o 32 amortizaciones por escenario, o 20 tramos por cada tipo de comisión.

#### Scenario: Usuario accede a sus ofertas

- **WHEN** una petición autenticada opera en el documento raíz o una subcolección de `users/{uid}/mortgages/{mortgageId}` donde `uid` coincide con la identidad de la sesión
- **THEN** la identidad propietaria limita el acceso; la escritura se permite solo si cumple el esquema cerrado correspondiente y los límites de campos y tamaño, y una lectura malformada se rechaza al recomponerla

#### Scenario: Usuario intenta acceder a datos ajenos o sin sesión

- **WHEN** una petición no autenticada o con un UID distinto intenta leer o modificar una oferta
- **THEN** la operación se deniega y no revela el contenido del documento

### Requirement: Sincronización de ofertas y caché local

El sistema SHALL sincronizar las ofertas v2 autenticadas entre dispositivos, conservar una copia local y mantener disponibles las funciones locales cuando la red o Firebase no estén disponibles.

#### Scenario: Guardar una oferta con sesión activa

- **WHEN** el usuario crea o edita una oferta mientras está autenticado y conectado
- **THEN** los datos de entrada v2 se guardan en la nube y en la caché local, y el cambio aparece en la siguiente sesión de ese usuario en otro dispositivo

#### Scenario: Cambios locales sin conexión

- **WHEN** el usuario modifica o elimina una oferta sin conexión
- **THEN** la aplicación conserva el cambio local, informa de que la sincronización está pendiente y lo sincroniza al recuperar la conexión

#### Scenario: No guardar resultados calculados

- **WHEN** una oferta se sincroniza
- **THEN** se transfieren sus datos de entrada y escenarios, pero no los cuadros de amortización ni los resultados calculados

### Requirement: Conciliación al vincular datos locales

El sistema SHALL ofrecer una conciliación inicial de ofertas locales y remotas antes de aplicar cambios que puedan reemplazar datos.

#### Scenario: Transferir ofertas de invitado al registrarse

- **WHEN** un invitado que guardó ofertas localmente, incluso sin conexión, se registra o inicia sesión con Google y confirma la transferencia cuando vuelve a estar conectado
- **THEN** las ofertas locales se guardan en su cuenta y se conserva la copia local

#### Scenario: Ofertas locales y remotas coincidentes

- **WHEN** la cuenta ya contiene ofertas y la conciliación combina los datos de invitado con los remotos
- **THEN** combina las ofertas que solo existen en un origen y, para identificadores iguales, conserva la versión con `updatedAt` más reciente sin borrar la copia local

#### Scenario: Usuario aplaza la conciliación

- **WHEN** el usuario aplaza la carga o combinación inicial
- **THEN** las versiones locales y remotas permanecen intactas y no se inicia una sincronización que pueda sobrescribirlas

### Requirement: Cierre de sesión seguro

El sistema SHALL dejar de acceder a la cuenta al cerrar sesión y conservar los datos locales del dispositivo.

#### Scenario: Cerrar sesión

- **WHEN** el usuario cierra sesión
- **THEN** la aplicación detiene las operaciones de nube para esa cuenta y mantiene disponibles sus datos locales sin borrarlos
