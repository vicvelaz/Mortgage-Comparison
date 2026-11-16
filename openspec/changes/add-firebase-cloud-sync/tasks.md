# Tasks

## 1. Firebase y reglas

- [x] 1.1 Añadir el SDK cliente de Firebase, configuración web pública e inicialización opcional que deje la app en modo local si no hay configuración; verificar instalación y compilación Angular.
- [x] 1.2 Crear reglas Firestore de denegación por defecto y validación por tipo de documento raíz/subcolección; añadir pruebas con emulador para propietario, sesión ausente, UID ajeno, campos inválidos y tamaño excedido.
- [x] 1.3 Documentar en `docs/firebase-setup.md` la configuración Spark, región europea, proveedor/dominio Google, App Check, clave pública y reglas; verificar que la guía no requiera secretos de servidor.

## 2. Autenticación y acceso a Firestore

- [x] 2.1 Implementar registro/inicio Google con ventana emergente y recuperación por redirección, restauración de sesión, cierre de sesión y App Check configurable; mantener el modo invitado sin Auth ni conexión. Verificar los estados invitado, autenticado, cancelado, error y configuración ausente con pruebas unitarias.
- [x] 2.2 Implementar el repositorio por UID para descomponer y recomponer ofertas v2 desde el documento raíz y sus subcolecciones, activar cada generación completa atómicamente, validar campos antes de leer/escribir y excluir datos calculados; verificar lectura, alta, edición, borrado, límites agregados y rechazo de registros malformados con pruebas del repositorio.

## 3. Caché y conciliación

- [x] 3.1 Separar la colección local sin cuenta de las cachés por UID y persistir escrituras pendientes y tombstones de la estructura raíz/subcolecciones; verificar que cambios y eliminaciones sobreviven a recargas offline y se reintentan sin duplicados ni documentos hijos huérfanos.
- [x] 3.2 Implementar la conciliación y transferencia confirmable de ofertas invitadas, combinación por identificador y política `updatedAt` con desempate remoto; verificar la combinación y la transferencia del servicio con pruebas unitarias.
- [x] 3.3 Integrar las opciones “Continuar como invitado” y registro/inicio posterior, además del estado de sincronización y errores; verificar que todas las funciones locales siguen disponibles sin cuenta, que cerrar sesión detiene listeners y que importación/exportación mantienen el formato v2.
- [ ] 3.4 Añadir pruebas de integración de `Workspace` para confirmar, aplazar y cancelar la conciliación, verificando que aplazar o cancelar no escribe, borra ni sobrescribe ofertas locales o remotas.

## 4. Verificación de integración

- [x] 4.1 Ejecutar `npx ng test --watch=false` y `npx ng build --base-href=/Mortgage-Comparison/`; verificar las reglas y la sincronización entre dos clientes con el emulador.
- [ ] 4.2 Probar en GitHub Pages el uso como invitado sin conexión y la transferencia posterior de ofertas al registrarse, con el proveedor Google, dominio autorizado y App Check configurados.