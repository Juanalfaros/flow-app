# flow

Gestor de tareas tipo Asana/ClickUp para un equipo interno de hasta 15
usuarios, corriendo 100% en tiers gratuitos de Cloudflare y Supabase.
Nombre de trabajo interno: **nodo**.

## Stack

- **Vite + React 19 + TypeScript** — SPA estática, sin SSR (app detrás de
  login, sin necesidad de SEO)
- **TanStack Router** (file-based) + **TanStack Query**
- **Supabase** — Postgres + Auth + Realtime + RLS como capa de
  autorización, sin backend propio salvo un endpoint de invitaciones
- **Tailwind v4 + shadcn** (preset Nova, tokens de marca propios) +
  **next-themes** para tema claro/oscuro
- **Hugeicons** para íconos de la app; `lucide-react` solo en los
  componentes `ui/` auto-generados por shadcn
- **Serwist** — PWA (precache del shell + estrategia offline)
- **Cloudflare Workers** (static assets + un Worker para cron keep-alive,
  invitaciones, feed iCal y adjuntos) + **Cloudflare R2** (adjuntos de
  tareas y backups) + **GitHub Actions** para el backup nocturno
  (`pg_dump` → R2, un Worker no puede correrlo)

Modelo de datos: motor de nodos genéricos (`nodes` + `node_memberships`) — reemplaza las tablas rígidas
`spaces`/`projects`/`tasks` del schema original y habilita jerarquías de
carpetas y multi-homing de tareas.

## Acceso

El registro está cerrado: **la primera cuenta que se crea queda como
owner del workspace, y desde ese momento solo se entra por invitación**.
La regla se aplica en un trigger sobre `auth.users`
(`0022_closed_signup.sql`), no en el flag `disable_signup` del dashboard
— así el bootstrap se resuelve solo y quedan cubiertas todas las puertas
de alta a la vez (contraseña, magic link, OAuth futuro y el admin API de
invitaciones).

Si hace falta reabrir el registro (por ejemplo, si la cuenta fundadora se
abandona antes de completar el onboarding), se borran los usuarios en
Dashboard → Authentication → Users: con `auth.users` vacía el portón
vuelve a abrirse solo.

La autorización dentro de la app es RLS por membership. Las RPCs
`security definer` corren como owner de las tablas y por lo tanto saltean
RLS, así que **cada una chequea membresía explícitamente** vía
`assert_member_of`/`assert_admin_of` (`0017_rpc_authz.sql`) — no alcanza
con que exista la policy de la tabla.

### Al tocar una función `security definer`

Recrear una de estas funciones **borra sus protecciones**, y en este
proyecto ya pasó dos veces. Agregarle un parámetro cambia su identidad en
Postgres, así que hay que dropear la firma vieja y crear una nueva — y si
el cuerpo se copia de una versión anterior al endurecimiento, vuelven los
agujeros sin que nada falle ni avise. Fue lo que ocurrió con
`create_task_node` entre `0021` y `0030`.

Checklist para cualquier migración que cree o reemplace una función:

1. `perform public.assert_member_of(...)` (o `assert_admin_of`) **antes de
   mutar**, dentro del cuerpo — no en un wrapper, para que quien copie la
   función se lleve el chequeo.
2. `revoke execute ... from public, anon` + `grant ... to authenticated`.
   Postgres concede `EXECUTE` a `PUBLIC` por defecto en toda función nueva:
   sin el revoke, `anon` puede llamarla.
3. Ningún guard booleano puede devolver `NULL` — `coalesce(..., false)`.
   `if not NULL` no dispara, y ese fue el bug que dejó `invite_member`
   abierto a cualquiera (`0020_null_safe_authz.sql`).

Se verifica llamando a la RPC **sin sesión**, solo con la anon key: tiene
que responder `42501`. Es una prueba de 30 segundos que encontró cuatro
agujeros reales que la lectura del código no había detectado.

### La excepción: `google_credentials`

Es la única tabla **sin excepción para administradores**: la policy es
`user_id = auth.uid()` y nada más. En todo el resto del esquema un admin ve
los datos del equipo porque tiene que administrarlos; acá no hay nada que
administrar sobre una credencial personal de un servicio externo, y el daño
de exponerla no se queda dentro del workspace — un refresh token de Google
es acceso continuo al calendario de esa persona hasta que lo revoque.

Además el token se cifra **en el Worker** (AES-GCM) antes de llegar a
Postgres, con una clave que vive fuera de la base. Un dump completo de
Postgres no alcanza para descifrar nada. Ver `0040_google_credentials.sql`
y `worker/google.ts`.

### Acceso por espacio y proyecto

Un espacio **o un proyecto** puede ser abierto o privado
(`nodes.is_private`), y el acceso se concede a personas o equipos
(`node_access`). Resolver "¿a qué frontera de acceso pertenece este nodo?"
recorriendo ancestros por fila sería inviable dentro de una policy, así que
cada nodo guarda denormalizado su **ancestro privado más cercano** en
`nodes.acl_boundary_id`, mantenido por triggers
(`0028_space_acl_data.sql`, `0034_project_acl_data.sql`).

La regla es **"el más interno gana"**: un proyecto privado dentro de un
espacio abierto exige su propia concesión, y un proyecto sin marca propia
hereda la frontera del espacio. La RLS consulta `can_access_node(id)`, que
es `stable` y por lo tanto se evalúa una vez por nodo y no una vez por fila.

Los roles `restricted` y `guest` se apoyan en esa capa: para ellos, un
espacio "abierto" **no** es visible por defecto — necesitan concesión
explícita igual que en uno privado (`0031_restricted_roles.sql`).

La RLS solo cubre la lectura. Las RPCs de mutación son `security definer` y
saltean RLS, así que además llaman a `assert_can_access_node`
(`0036_rpc_node_access_authz.sql`): ser miembro del workspace es necesario,
pero no alcanza cuando el nodo está detrás de una frontera privada.

## Setup local

Requiere [pnpm](https://pnpm.io/).

```bash
pnpm install
```

Crear `.env.local` en la raíz (gitignorado, no es secreto sensible —
`VITE_SUPABASE_ANON_KEY` está diseñada para exponerse en el cliente, la
seguridad real la da RLS):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Para trabajar con el CLI de Supabase (migraciones) o desplegar con
Wrangler, autenticar ambas herramientas una vez por máquina:

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>
pnpm dlx wrangler login
```

## Scripts

| Comando         | Qué hace                                              |
| --------------- | ------------------------------------------------------ |
| `pnpm dev`      | Servidor de desarrollo (Vite)                           |
| `pnpm build`    | `tsc -b` (type-check de `src`, del service worker y de `worker/`) + build de producción |
| `pnpm preview`  | Sirve el build de producción localmente (necesario para probar el service worker — en dev corre en modo `NetworkOnly`) |
| `pnpm lint`     | `oxlint`                                                |
| `pnpm test:push`| Verifica el cifrado de Web Push contra el vector de RFC 8291 y hace un round-trip con claves generadas |
| `pnpm vapid`    | Genera el par de claves VAPID (se corre una sola vez, ver más abajo) |

## Deploy

Automático en cada push a `main`
(`.github/workflows/deploy.yml`). El workflow **se detiene si hay
migraciones sin aplicar** en el proyecto remoto: el código nuevo puede
depender de columnas o RPCs que la base todavía no tiene, y eso ya dejó una
pantalla rota en producción una vez.

Las migraciones **no** se aplican solas a propósito — correrlas sin nadie
mirando es peor que un deploy desfasado, porque una migración mala sobre
producción no tiene vuelta atrás automática:

```bash
pnpm exec supabase db push   # primero esto
git push                     # después esto dispara el deploy
```

Requiere el secret `CLOUDFLARE_API_TOKEN` en GitHub (Dashboard de
Cloudflare → My Profile → API Tokens → plantilla *Edit Cloudflare
Workers*; necesita también *Workers R2 Storage:Edit* porque el Worker
declara un binding de R2).

Para desplegar a mano, sin pasar por el workflow:

```bash
pnpm build
pnpm exec wrangler deploy
```

Desplegado en **https://flow.zutra.cl** (Worker `flow`, cuenta
de Cloudflare donde vive la zona `zutra.cl`). El Worker
(`worker/index.ts`) sirve los estáticos, corre el cron de keep-alive de
Supabase y expone los endpoints que necesitan `service_role`, R2 o un secreto
de servidor, y que por lo
tanto no pueden correr en el navegador:

| Endpoint | Qué hace |
| --- | --- |
| `POST /api/invite` | Invita por correo. La autorización la decide la RPC `invite_member`, no el Worker. |
| `DELETE /api/account` | Elimina la cuenta que llama (nunca una ajena, no recibe id en el body). JWT reenviado para confirmar identidad, `service_role` para el borrado real (`worker/account.ts`). |
| `GET /api/calendar/<token>.ics` | Feed iCal personal. El token de la URL es la única credencial. |
| `/api/attachments` | Sube, descarga y borra adjuntos en R2. La RLS de `task_attachments` decide el acceso. |
| `/api/google/*` | OAuth con Google Calendar. Ver abajo. |
| `/api/push/*` | Web Push (envío + clave pública). Ver § Notificaciones push. |

### Google Calendar

Son **dos integraciones independientes**, en direcciones opuestas:

| | Hacia Google | Desde Google |
| --- | --- | --- |
| Qué hace | Publica tus tareas y ausencias como calendario suscribible | Muestra tus eventos de Google dentro de la app |
| Cómo | Feed iCal en una URL secreta | OAuth de solo lectura |
| Requiere | Nada | Cuenta de Google y consentimiento |
| Credencial | El token de la URL | Refresh token cifrado (`google_credentials`) |

> **Estado: pendiente a propósito.** El código está completo y desplegado,
> pero el cliente OAuth **no se crea hasta tener el dominio definitivo**. El
> URI de redirección tiene que coincidir carácter por carácter con el que se
> registre en Google Cloud. Ya hay dominio definitivo (`flow.zutra.cl`,
> ver arriba) — falta el paso manual de registrar el cliente OAuth en Google
> Cloud Console (sección de abajo) y cargar los tres secrets. Mientras tanto
> la app funciona igual: sin los secrets, la sección muestra "Disponible
> cuando la app esté en su dominio definitivo" en vez de un botón que
> fallaría.
>
> No hay nada que descomentar el día que se active. El Worker arma el
> `redirect_uri` con el `origin` de la petición que recibe, así que sigue al
> dominio solo — basta registrar el URI nuevo y cargar los tres secrets.

La segunda necesita configuración una sola vez. En [Google Cloud
Console](https://console.cloud.google.com/), sobre un proyecto del dominio:

1. **APIs y servicios → Biblioteca**: habilitar *Google Calendar API*.
2. **Pantalla de consentimiento**: tipo **Interno**. Al ser Google Workspace
   evita el proceso de verificación de Google, que para una app externa con
   scope de calendario tarda semanas.
3. **Credenciales → Crear → ID de cliente de OAuth → Aplicación web**, con
   URI de redirección autorizado exactamente `https://<dominio>/api/google/callback`.

El proyecto de Google Cloud tiene que pertenecer a la **organización de
Workspace del equipo**: el tipo *Interno* solo existe para proyectos con
organización, y una cuenta personal no la tiene. Además *Interno* limita
quién puede autorizar a las cuentas de ese mismo dominio — si alguien del
equipo usa otro correo, no va a poder conectar. Conviene agregar un segundo
propietario al proyecto: el dueño es quien puede rotar el `client_secret` o
cambiar el URI de redirección más adelante.

Después, los tres secrets del Worker. `wrangler secret put` **pide el valor
por stdin**: no va como argumento, así no queda en el historial del shell:

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put GOOGLE_TOKEN_KEY
```

`GOOGLE_TOKEN_KEY` es la clave que cifra los refresh tokens (AES-GCM, vía
HKDF). Se genera con 32 bytes aleatorios en base64 — este comando lo entrega
por stdin sin imprimirlo nunca en pantalla:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" \
  | pnpm exec wrangler secret put GOOGLE_TOKEN_KEY
```

**Guardar una copia en el gestor de contraseñas antes de perderla.** Si se
pierde, nadie puede descifrar los refresh tokens guardados y todo el equipo
tiene que reconectar. Si se filtra *junto con* un dump de la base, quedan
expuestos los calendarios; sola no sirve de nada, y el dump solo tampoco.

Si los tres secrets faltan, la integración se reporta como no configurada y
el resto del Worker sigue funcionando igual.

Cualquier otra ruta bajo `/api/` devuelve 404 en vez del shell de la SPA —
sin ese corte, `not_found_handling: single-page-application` responde
`index.html` con status 200 y cualquier cliente que espere JSON o un `.ics`
falla con un error que no dice nada de la causa.

Los dos buckets de R2 (`flow-attachments` y `flow-backups`) se
crean a mano desde el dashboard: no se pueden crear por API.

### Notificaciones push

Las notificaciones que ya generaban los triggers de `0042`/`0043` vivían
solo dentro de la app: la campana del topbar y `/bandeja`, alimentadas por
un canal de Realtime que existe mientras la pestaña está abierta. Con la
PWA cerrada en un teléfono no llegaba nada. `0050_push_subscriptions.sql`
suma Web Push encima de esas mismas filas, sin cambiar quién recibe qué.

**Cómo viaja un aviso.** Un trigger inserta en `notifications` → un
Database Webhook de Supabase llama a `POST /api/push/dispatch` en el
Worker → el Worker cifra el payload y lo entrega a cada endpoint
registrado del destinatario → el service worker lo muestra. Un cron cada
minuto barre lo que el webhook no logró entregar; `notifications.pushed_at`
hace que ambos caminos sean idempotentes.

**El cifrado se implementa a mano** (`worker/push.ts`): `web-push`, el
paquete de npm, es Node-only. Son dos specs distintas y es fácil
confundirlas — RFC 8291 cifra el payload con un ECDH efímero contra la
clave del navegador, RFC 8292 (VAPID) identifica al servidor con un JWT
ES256. Un error ahí **no se ve como error**: el push service responde 201
igual y el navegador descarta el mensaje en silencio. Por eso existe
`pnpm test:push`, que fija el vector del apéndice de RFC 8291. Correrlo
después de tocar `worker/push.ts` no es opcional.

**Puesta en marcha** (una sola vez):

1. `pnpm vapid` en tu máquina. Imprime el par VAPID y un secreto para el
   webhook. **La clave privada no va al repo.**
2. Cargar los cuatro secrets del Worker:
   ```
   pnpm exec wrangler secret put VAPID_PUBLIC_KEY
   pnpm exec wrangler secret put VAPID_PRIVATE_KEY
   pnpm exec wrangler secret put VAPID_SUBJECT       # mailto:algo@zutra.cl
   pnpm exec wrangler secret put PUSH_WEBHOOK_SECRET
   ```
3. Cargar el mismo valor de `PUSH_WEBHOOK_SECRET` en Vault del proyecto
   (una sola vez, no queda en git):
   ```sql
   select vault.create_secret('<el mismo valor del paso 2>', 'push_webhook_secret');
   ```
   El disparo del lado de Postgres ya está resuelto por
   `0051_push_dispatch_webhook.sql` — un trigger sobre `notifications`
   que llama a `net.http_post` (pg_net) leyendo el secreto de Vault por
   nombre. No hace falta crear nada a mano en Database → Webhooks del
   dashboard; esa pantalla es la versión click-ops de lo mismo, y esta
   migración la reemplaza para que quede versionada como el resto del
   esquema.

Sin el paso 2 el Worker registra el faltante y no envía nada; el resto
sigue funcionando (mismo criterio que la integración de Google). Sin el
paso 3 el trigger no encuentra el secreto en Vault, deja un `WARNING` en
los logs de Postgres y no llama al Worker — los avisos igual llegan, pero
con hasta un minuto de retraso: el barrido del cron los recoge.

El par VAPID es **estable de por vida**. Rotarlo invalida todas las
suscripciones y obliga a que cada persona vuelva a conceder el permiso
desde su perfil, sin aviso previo.

**Qué esperar en cada sistema:**

| Sistema | Funciona | Requisito |
| --- | --- | --- |
| Android (Chrome, Edge, Firefox) | Sí | Ninguno; sirve en pestaña o con la PWA instalada. Entrega vía Google Play Services, así que un dispositivo sin GMS no recibe. |
| Escritorio (Chrome, Edge, Firefox) | Sí | Ninguno. |
| iPhone / iPad | Sí | iOS 16.4+ **y la PWA agregada a la pantalla de inicio**. En una pestaña de Safari la API no existe. La app detecta el caso y muestra el instructivo en Perfil → Notificaciones. |
| Safari de escritorio | Depende de la versión | 16.4+. Debajo de eso se reporta como no compatible. |

Doze y las optimizaciones agresivas de algunos fabricantes (Xiaomi,
Huawei, Samsung) pueden retrasar la entrega en Android — es del sistema
operativo, no de la app.

Cada persona administra sus dispositivos en Perfil → Notificaciones:
activar/desactivar el navegador actual, ver la lista de dispositivos
suscritos y silenciar todo de una vez sin perder los permisos.

### Fallback por email (F5 #10)

La de menor prioridad de todo el roadmap — con Web Push ya funcionando,
esto solo entra a tallar cuando alguien no tiene ningún dispositivo
suscrito: `deliverNotification()` (`worker/push-dispatch.ts`) intenta un
correo transaccional vía Cloudflare Email Sending
(`worker/email-dispatch.ts`, binding `EMAIL` en `wrangler.jsonc`) antes de
marcar la notificación como resuelta.

**Pendiente de puesta en marcha** (una sola vez, no se puede vía API con
el token que usa este repo — mismo bloqueo que R2, ver la nota en
`wrangler.jsonc`): dar de alta `zutra.cl` en Cloudflare Email Sending
(dashboard → Email → Email Sending, o `wrangler email sending enable
zutra.cl` con un login que tenga el scope de Email). Sin eso el
binding existe pero el envío falla — capturado en
`sendNotificationEmail()`, no rompe nada más, mismo criterio que Push sin
VAPID.

## Estructura

Resumen:

```
src/
├── routes/        # TanStack Router (file-based)
├── features/      # <dominio>/{api.ts, queries.ts, mutations.ts, components/}
│   ├── auth/      # login, recuperación, errores traducidos, campo de password
│   ├── nodes/     # árbol de carpetas, tipos de nodo, ViewConfig
│   ├── tasks/dependencies/  # bloqueos entre tareas (solo Gantt por ahora)
│   ├── home/      # dashboard de inicio
│   ├── my-tasks/  # vista personal (asignadas, prioridades, lista propia)
│   ├── notifications/  # bandeja + campana, generadas por trigger
│   ├── recent-views/   # "visto recientemente" por usuario
│   ├── calendar/  # vista día/semana/mes
│   ├── gantt/     # timeline + dependencias
│   ├── favorites/ # proyectos favoritos
│   ├── people/    # fichas de persona, presencia, ausencias, feed iCal
│   ├── teams/     # equipos del workspace
│   ├── sharing/   # acceso por espacio y proyecto
│   └── profile/   # cuenta, avatar, password
├── components/
│   ├── ui/        # shadcn + skeleton, drag-handle
│   └── layout/    # AppShell, Sidebar, Topbar, ThemeToggle, ErrorState, ...
├── lib/           # supabase client, query-client, offline-queue, realtime, position
└── sw.ts          # service worker (Serwist)
supabase/migrations/
worker/            # Cloudflare Worker (cron + invite + calendar + attachments)
.github/workflows/ # backup.yml (pg_dump nocturno → R2)
```
