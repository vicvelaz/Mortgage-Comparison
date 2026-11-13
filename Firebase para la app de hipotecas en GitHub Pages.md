# Firebase para la app de hipotecas en GitHub Pages

Evaluación de Firebase como almacenamiento en la nube (usuarios y ofertas de hipoteca) para una web estática alojada en GitHub Pages, con alternativas gratuitas. Fecha de la consulta: 13 de noviembre de 2026.

## Conclusión

**Sí, Firebase es una buena opción** para una web en GitHub Pages. Que las keys sean visibles no es un problema: lo que protege los datos son las reglas de seguridad y el login, no esconder la key.

Recomendación: **Firebase Spark (gratuito) con login de Google y Firestore en una región europea**, guardando solo los datos de entrada de cada hipoteca.

## Por qué la key visible no importa

- Las API keys de Firebase no controlan el acceso a los datos. Eso solo lo hacen las Security Rules y App Check.
- Las keys que crea Firebase vienen restringidas a sus propias APIs, así que no se tratan como secretas y se pueden incluir en el código.
- Lo que sí es secreto son las claves de cuenta de servicio (Admin SDK). Esta app no las necesita.

## Qué hay que hacer para que sea seguro

1. **Reglas de Firestore.** Cada oferta solo la lee y escribe su dueño (`request.auth.uid == uid`). Conviene partir de todo denegado y abrir solo lo necesario, con validación de campos y de tamaño.
2. **Login con Google.** Los proveedores OAuth son los más seguros. Con email y contraseña, activar la protección contra enumeración de cuentas. El login anónimo no sirve como sustituto: se pierde al cambiar de dispositivo, y eso va contra el objetivo.
3. **App Check**, para que solo la propia web pueda llamar al backend.
4. **Restricciones de la key.** Limitarla al dominio `vicvelaz.github.io` y añadir ese dominio a los autorizados de Authentication.
5. **Login por redirección en GitHub Pages.** Algunos navegadores bloquean el almacenamiento de terceros; conviene probar el login con ventana emergente. No se ha verificado en esta consulta.

### Ejemplo orientativo de reglas

Probarlas con el Local Emulator Suite antes de publicarlas.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/mortgages/{mortgageId} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 100
        && request.resource.data.amount is number;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Límites gratuitos de Firebase (plan Spark)

- 1 GB de almacenamiento, 20.000 escrituras al día y 50.000 lecturas al día en Firestore.
- Authentication gratis hasta 50.000 usuarios activos al mes.
- Spark no pide tarjeta, y al superar una cuota se restringe el servicio en lugar de cobrar. No hay riesgo de factura sorpresa.
- Las alertas de presupuesto de Google Cloud avisan, pero no cortan el gasto. Por eso conviene quedarse en Spark.
- Cloud Storage de Firebase exige el plan de pago. No hace falta: se guardan solo los datos de entrada de cada hipoteca (importe, plazo, escenarios) y los calendarios se calculan en el navegador.
- Inconveniente: Firestore es tecnología propietaria y migrar los datos a otro sitio es difícil.

## Alternativas gratuitas

| Opción | Qué ofrece gratis | Principal problema |
| --- | --- | --- |
| **Firebase (Spark)** | Firestore 1 GB, Auth 50.000 usuarios, sin tarjeta | Datos propietarios; límites duros |
| **Supabase** | Postgres de código abierto, 500 MB, 50.000 usuarios | Pausa el proyecto tras 7 días sin actividad y hay que reactivarlo a mano |
| **Cloudflare Workers + D1** | 5 M lecturas/día, 100.000 escrituras/día, 5 GB | Hay que construir el backend y el login; la CPU gratuita (10 ms por petición) no permite hashear contraseñas, así que solo valdría un proveedor externo; desde el 1 de septiembre de 2026 las consultas fallan al superar el límite diario |
| **Appwrite, PocketBase, Convex, Turso** | No verificado | No se han comprobado sus condiciones gratuitas actuales |
| **Sin backend (Google Drive del usuario)** | Gratis, sin gestionar usuarios | Sincronización más frágil; no verificado |

Para una app de uso esporádico, la pausa de Supabase es el motivo principal para descartarlo.

## Diseño propuesto

- Un documento por hipoteca en `users/{uid}/mortgages/{id}`, con el modelo v2 actual (escenarios y comisiones incluidos). Guardar solo datos de entrada, no los calendarios calculados.
- Mantener `localStorage` como caché y como modo sin cuenta.
- Al primer login, ofrecer subir los datos locales y resolver conflictos por `updatedAt`.
- Elegir una región europea para Firestore: los usuarios están en España y son datos financieros personales.
- Las ofertas son pequeñas, así que el límite de 1 GB no sería un problema realista.

## Siguientes pasos

1. Crear el proyecto de Firebase en el plan Spark, con Firestore en región europea y Authentication con Google.
2. Escribir las reglas de seguridad y probarlas con el emulador.
3. Activar App Check y restringir la API key al dominio de GitHub Pages.
4. Preparar las specs de OpenSpec y el prompt de implementación de la migración desde `localStorage`.

## Fuentes consultadas

- Firebase: claves de API, https://firebase.google.com/docs/projects/api-keys
- Firebase: lista de comprobación de seguridad, https://firebase.google.com/support/guides/security-checklist
- Precios de Firebase 2026, https://blog.back4app.com/firebase-pricing/ y https://www.verdent.ai/guides/devtools/firebase-pricing
- Precios de Firebase Authentication, https://toolradar.com/tools/firebase-auth/pricing
- Límites gratuitos de Supabase 2026, https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ y https://makerkit.dev/blog/saas/supabase-pricing
- Cloudflare D1: aplicación de límites gratuitos, https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Cloudflare: capa gratuita, https://freetier.co/cloudflare-free-tier y https://github.com/halideworks/onelight/wiki/Pricing

Los límites y precios cambian con frecuencia: conviene confirmarlos en las páginas oficiales antes de decidir.
