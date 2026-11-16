# Configuración de Firebase

Esta aplicación puede funcionar sin Firebase: deja `FIREBASE_CONFIG` en `null` para
usar el modo local como invitado. La sincronización requiere un proyecto Firebase
configurado por quien despliega la aplicación.

## Puesta en marcha rápida

1. Crea un proyecto Firebase y una aplicación web en él.
2. Activa Cloud Firestore y Google en Authentication; añade el dominio de GitHub
   Pages a los dominios autorizados.
3. Registra la aplicación web en App Check con reCAPTCHA Enterprise.
4. Copia la configuración web pública y la clave de sitio de App Check a
   `src/app/firebase-config.ts` (detalles a continuación).
5. Prueba las reglas con el emulador y despliega `firestore.rules`.
6. Ejecuta los tests y genera el build de Pages. La sincronización estará activa
   en cuanto se publique ese build con la configuración Firebase.

## 1. Crear el proyecto y Firestore

1. Crea un proyecto Firebase con el plan **Spark**. Comprueba los límites vigentes
   en la [página de precios](https://firebase.google.com/pricing) antes de publicar.
2. Crea la base de datos de Cloud Firestore en una región europea, por ejemplo
   `europe-southwest1` (Madrid) o `europe-west1` (Bélgica), según disponibilidad y
   latencia esperada. La ubicación no se puede cambiar después de crear la base.
3. La aplicación almacena los campos comunes de cada oferta en
   `users/{uid}/mortgages/{mortgageId}`. Escenarios, bonificaciones, amortizaciones
   y tramos de comisión van a sus subcolecciones. Solo se guardan datos de entrada,
   nunca resultados calculados.
4. No hace falta crear colecciones ni documentos manualmente: aparecen cuando la
   aplicación guarda la primera oferta autenticada.

## 2. Activar Google Authentication

1. En Firebase Console, abre **Authentication → Sign-in method** y activa Google.
2. En **Authentication → Settings → Authorized domains**, añade
   `vicvelaz.github.io` y cualquier dominio adicional donde alojes la app.
   `localhost` se usa para desarrollo local.
3. La URL publicada es
   <https://vicvelaz.github.io/Mortgage-Comparison/>. La ruta del proyecto no forma
   parte del dominio autorizado.

## 3. App Check

1. En Google Cloud Console, crea una clave de sitio para web de reCAPTCHA Enterprise
   y limita sus dominios a los de publicación y desarrollo necesarios.
2. En Firebase Console, abre **App Check**, registra la aplicación web con el
   proveedor reCAPTCHA Enterprise y configura la clave de sitio.
3. Comprueba que la aplicación publicada envía tokens válidos antes de aplicar
   enforcement a Firestore. Mantén cualquier token de depuración fuera del
   repositorio y no habilites enforcement hasta verificar la integración.
4. Copia la **site key** pública que registraste en App Check a
   `FIREBASE_APP_CHECK_SITE_KEY` en `src/app/firebase-config.ts`:

   ```ts
   export const FIREBASE_APP_CHECK_SITE_KEY: string | null = 'PUBLIC_SITE_KEY';
   ```

App Check y Authentication son controles distintos: App Check identifica el
origen de la petición, mientras que las reglas Firestore autorizan al usuario
propietario. La clave de sitio de reCAPTCHA es pública; no es una credencial de
servidor.

## 4. Dónde obtener y guardar la configuración web

En Firebase Console, abre **Project settings → General → Your apps**, selecciona
la aplicación web y copia el objeto de configuración del SDK. Sus propiedades se
corresponden con estos valores:

| Propiedad                     | Dónde encontrarla                                                  |
| ----------------------------- | ------------------------------------------------------------------ |
| `apiKey`                      | Firebase Console, configuración del SDK de la aplicación web       |
| `authDomain`                  | Configuración del SDK, normalmente `PROJECT_ID.firebaseapp.com`    |
| `projectId`                   | Configuración del SDK y nombre del proyecto                        |
| `appId`                       | Configuración del SDK de la aplicación web                         |
| `FIREBASE_APP_CHECK_SITE_KEY` | reCAPTCHA Enterprise, clave de sitio web registrada para App Check |

Guarda esos valores en `src/app/firebase-config.ts`, que es el punto de
configuración usado por esta implementación:

```ts
import type { FirebaseOptions } from 'firebase/app';

export const FIREBASE_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIza...', // API key web de Firebase
  authDomain: 'mi-proyecto.firebaseapp.com',
  projectId: 'mi-proyecto',
  appId: '1:123456789:web:abcdef',
};
export const FIREBASE_APP_CHECK_SITE_KEY: string | null = 'SITE_KEY_PUBLICA';
```

Los valores reales deben pertenecer al mismo proyecto Firebase. Sustituye el
`null` actual solo cuando el proyecto esté listo. La aplicación no lee estos
valores de GitHub Actions ni de variables de entorno: el workflow actual compila
el archivo tal como está en el repositorio. Por tanto, para activar Firebase en
Pages, la versión publicada tiene que compilar con esta configuración.

### ¿Son secretos o tokens?

- La configuración Firebase de la aplicación web (`apiKey`, `authDomain`,
  `projectId` y `appId`) y la site key de App Check son valores públicos: el
  navegador los necesita y quedan visibles en el JavaScript publicado. Limita la
  API key por referente HTTP a los dominios de la aplicación y a las APIs usadas.
- No copies aquí el **OAuth client secret**, una clave JSON de cuenta de servicio,
  una clave privada ni credenciales del Admin SDK. Esta SPA no los necesita. La
  activación del proveedor Google se hace en Firebase Console; Firebase gestiona
  el cliente OAuth del flujo web.
- No hay que generar, pegar ni guardar manualmente tokens de acceso de Google,
  Firebase ID tokens ni tokens ordinarios de App Check. Los SDK de Authentication
  y App Check los obtienen, persisten y renuevan mediante su gestión interna de
  sesión. El código de la aplicación guarda únicamente una marca local para
  intentar restaurar la sesión; no lee ni persiste manualmente el token de
  autenticación.
- Los tokens de depuración de App Check sí deben tratarse como secretos. No los
  subas al repositorio, al bundle ni a logs compartidos. La inicialización actual
  no configura un token de depuración; para pruebas locales deja enforcement
  desactivado y usa el emulador de Firestore cuando corresponda.

Aunque la configuración Firebase web es pública, restringe su uso y protege los
datos mediante Authentication, reglas Firestore y App Check. No almacenes
secretos en este archivo.

Si no hay configuración, deja `FIREBASE_CONFIG` y la site key en `null`: Firebase
no se inicializa, el inicio de sesión no está disponible y se conserva el modo
invitado con almacenamiento local v2.

## 5. Reglas y pruebas

Las reglas fuente están en [`../firestore.rules`](../firestore.rules) y la
configuración del emulador en [`../firebase.json`](../firebase.json). Deniegan por
defecto y validan cada tipo de documento por separado; solo permiten acceso bajo
el UID autenticado. Las escrituras deben cumplir el esquema cerrado correspondiente.
Las consultas de subcolecciones son necesarias para reconstruir ofertas; por ello, el
cliente valida cada documento leído y rechaza registros malformados antes de usarlos.
Firestore impone su límite de 1 MiB por documento. El repositorio también comprueba
los máximos agregados de la oferta al reconstruirla:
8 escenarios, 16 bonificaciones y 32 amortizaciones por escenario, y 20 tramos por
cada tipo de comisión.

Para verificar las reglas localmente, instala un JDK 21 o superior y ejecuta:

```sh
npm run test:rules
```

El comando inicia Firestore Emulator y descarga su emulador si todavía no está
presente. Antes de publicar, puedes desplegar únicamente las reglas desde una
sesión Firebase CLI autenticada:

```sh
npx firebase login
npx firebase projects:list
npx firebase deploy --only firestore:rules --project PROJECT_ID
```

Usa el `projectId` de `FIREBASE_CONFIG` en `--project` y revisa el destino antes
del despliegue. No se necesita una cuenta de servicio para ejecutar este comando
desde una sesión local autorizada.

## 6. Verificación y publicación

Desde la raíz del repositorio:

```sh
npx ng test --watch=false
npx ng build --base-href=/Mortgage-Comparison/
```

El workflow **Deploy to GitHub Pages** publica automáticamente los cambios que
llegan a `main`. Comprueba en **Actions** que el build haya terminado y abre
`https://vicvelaz.github.io/Mortgage-Comparison/`. Para probar el flujo cloud,
inicia sesión con Google y verifica que una oferta aparezca en la cuenta y en un
segundo navegador/dispositivo. Un dominio o clave App Check incorrectos pueden
bloquear Auth o Firestore aunque la aplicación todavía funcione como invitado.

## Referencias oficiales

- [Ubicaciones de Cloud Firestore](https://firebase.google.com/docs/firestore/locations)
- [Planes de precios de Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Dominios autorizados de Firebase Authentication](https://firebase.google.com/docs/auth/web/redirect-best-practices#authorize-domains)
- [App Check para web con reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [API keys de Firebase](https://firebase.google.com/docs/projects/api-keys)
