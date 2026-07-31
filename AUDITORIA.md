# Auditoría técnica — page-catalogo

**Fecha:** 2026-07-30
**Alcance:** seguridad, escalabilidad, rendimiento, manejo de imágenes, y calidad/operación general.
**Estado del código auditado:** `master` @ `d660aa0`, 3 catálogos en producción (`ariel`, `apple`, `lux`).

## Cómo se hizo

Todo lo que sigue está verificado contra el código real y contra producción, no inferido de la documentación:

- Lectura línea por línea de la cadena de auth, persistencia y subida de imágenes.
- `npx tsc --noEmit` → **limpio**. `npx eslint .` → **limpio**.
- `npm run build` completo, cronometrado → **37.5s**, 3 PDFs generados correctamente.
- `npm audit --omit=dev`, `npx vercel env ls production`, `curl` contra `page-catalogo.vercel.app`.
- Cruce de las 15 imágenes referenciadas en los JSON contra las 55 en disco (0 rotas).

**Lo bueno primero, porque es real:** la base está bien construida. Validación Zod antes de cada escritura, `server-only` correctamente aplicado en todos los módulos con secretos, doble verificación de sesión (proxy + acción), `expectedHeadOid` para commits atómicos, hash bcrypt (nunca contraseña plana), separación Edge/Node en `auth.ts`/`session.ts`, cero errores de tipos y de lint. Nada de lo que sigue es un incendio; es la lista de lo que falta para pasar de "funciona" a "listo para producción sin sobresaltos".

---

## Resumen ejecutivo

| # | Hallazgo | Área | Severidad |
|---|---|---|---|
| S1 | Secretos de producción compartidos con deployments de Preview | Seguridad | **Crítico** |
| S2 | `replaceAsset` confía en un `path` del cliente sin validar | Seguridad | **Alto** |
| S3 | Sin límite de tamaño en el endpoint de subida | Seguridad | **Alto** |
| E1 | El build crece linealmente con cada catálogo (PDF ~10s c/u) | Escalabilidad | **Alto** |
| I2 | Nada borra imágenes nunca (repo ni Blob) | Imágenes | **Alto** |
| P1 | PDFs enormes: `catalog-ariel.pdf` = 15 MB | Rendimiento | **Alto** |
| S4 | Validación de imagen solo por extensión del nombre | Seguridad | Medio |
| S5 | Faltan cabeceras de seguridad (CSP, X-Frame-Options, …) | Seguridad | Medio |
| S6 | `remotePatterns` abierto a todo Vercel Blob del mundo | Seguridad | Medio |
| I1 | Dos backends de imágenes conviviendo; el nuevo sin ejercitar | Imágenes | Medio |
| I4 | La compresión es solo client-side y se saltea con `curl` | Imágenes | Medio |
| E3 | `listAssets()` sin paginación — trunca a las 1000 imágenes | Escalabilidad | Medio |
| E4 | `listAssets()` completo en cada subida (O(N) por foto) | Escalabilidad | Medio |
| P3 | 37 MB de imágenes en el repo, 40 son solo placeholders | Rendimiento | Medio |
| P4 | `.git` de 70 MB por el histórico de fotos comiteadas | Rendimiento | Medio |
| P6 | Si falla el PDF, el sitio publica un link de descarga roto sin avisar | Rendimiento | Medio |
| O1 | Sin tests de ningún tipo | Calidad | Medio |
| O2 | Sin CI — nada valida antes de que un commit llegue a producción | Calidad | Medio |
| S7 | Rate limiter: key spoofeable + `Map` sin límite de crecimiento | Seguridad | Bajo |
| S8 | `AUTH_SECRET` sin validación de fuerza mínima | Seguridad | Bajo |
| S9 | Sin rotación ni revocación de sesión | Seguridad | Bajo |
| S10 | 3 vulnerabilidades altas transitivas (`sharp`, `postcss`) | Seguridad | Bajo |
| I3 | Sin deduplicación — el anti-colisión garantiza duplicados | Imágenes | Bajo |
| I6 | La invariante `collageLayout` ↔ `collageImages` no está en el tipo | Imágenes | Bajo |
| E5 | Un solo admin, sin roles ni auditoría de cambios | Escalabilidad | Bajo |
| O3 | Sin observabilidad ni alertas | Operación | Bajo |
| O5 | `CLAUDE.md` desactualizado respecto al código real | Calidad | Bajo |
| O8 | `<html lang="en">` con contenido íntegramente en español | A11y/SEO | Bajo |

---

## 1. Seguridad

### S1 — Secretos de producción compartidos con Preview · **CRÍTICO**

Verificado con `npx vercel env ls production`:

```
GITHUB_TOKEN          Encrypted    Production, Preview
GITHUB_REPO           Encrypted    Production, Preview
GITHUB_BRANCH         Encrypted    Production, Preview
ADMIN_USERNAME        Encrypted    Production, Preview
ADMIN_PASSWORD_HASH   Encrypted    Production, Preview
AUTH_SECRET           Encrypted    Production, Preview
```

Cada deployment de Preview (cualquier rama, cualquier PR) levanta un `/admin` **completamente funcional**, con las mismas credenciales de administrador y un `GITHUB_TOKEN` con permiso de escritura sobre el repo real. Un preview es una URL pública si Deployment Protection no está activo.

Agravante: `AUTH_SECRET` es el mismo en ambos entornos, así que una cookie de sesión firmada en un preview **es válida en producción**. No hace falta ni comprometer el preview: basta con poder loguearse en uno.

**Qué hacer**
1. Quitar los 6 secretos del entorno Preview (`vercel env rm <NOMBRE> preview`).
2. Confirmar en el dashboard que **Deployment Protection** (Vercel Authentication) está activo para Preview. No pude verificarlo desde la CLI — hay que mirarlo en Settings → Deployment Protection.
3. Si en algún momento se quiere un panel funcional en preview, que sea con `AUTH_SECRET`, credenciales y un token de GitHub **distintos** y de menor alcance.
4. Revisar el alcance del `GITHUB_TOKEN`: si es un PAT clásico con scope `repo`, da acceso a todos los repos de la cuenta. Debería ser un **fine-grained token**, limitado a este repositorio y a `Contents: read/write`.

### S2 — `replaceAsset` confía en un `path` del cliente sin validar · **ALTO**

`app/api/admin/upload/route.ts:30-36`:

```ts
const mode = formData.get("mode");
const targetPath = formData.get("path");

const result =
  mode === "replace" && typeof targetPath === "string"
    ? await replaceAsset(targetPath, base64)   // ← targetPath llega crudo del cliente
    : await uploadAsset(file.name, base64);
```

`lib/assets.ts:127-150` lo usa en dos ramas, ninguna lo sanea:

- **No es URL** → `commitFile(\`public${assetPath}\`, …)`. Un `path` de `/../../data/…` escribe fuera de `public/imagenes/` en el repo real.
- **Es URL** → `new URL(assetPath).pathname` → `put()` con `allowOverwrite: true` sobre ese pathname del Blob store.

El único filtro es que la extensión esté en `ALLOWED_EXTENSIONS`, lo que acota el daño a sobrescribir archivos de imagen — pero en cualquier ruta del repo.

Lo notable es que **el propio proyecto ya identificó este riesgo en otro lado y lo resolvió bien**. `lib/catalogStore.ts:76-81` documenta explícitamente por qué re-normaliza el id con `slugify` server-side: *"termina en una ruta de archivo real dentro del repo, así que confiar ciegamente en un string armado en el cliente sería una vía de path traversal."* El endpoint de subida simplemente no recibió el mismo tratamiento.

Requiere sesión válida, así que no es explotable por un anónimo. Pero es exactamente la defensa en profundidad que el resto del código ya aplica.

**Qué hacer**: validar `targetPath` antes de usarlo — que empiece con `/imagenes/` y no contenga `..`, o (mejor) que sea uno de los paths que `listAssets()` ya devuelve. Para el caso Blob, verificar que el hostname pertenezca al store propio.

### S3 — Sin límite de tamaño en el endpoint de subida · **ALTO**

`app/api/admin/upload/route.ts:22-28`:

```ts
const formData = await request.formData();
const file = formData.get("file");
...
const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
```

El archivo entero se carga a memoria, y después se duplica con un +33% al pasarlo a base64. No hay ningún cap. Vercel hoy acepta bodies de hasta 100 MB, así que una sola petición puede pedirle a la función ~230 MB de memoria.

La compresión de `lib/imageCompression.ts` **no protege acá**: corre en el navegador. Un `curl` directo al endpoint la ignora por completo.

**Qué hacer**: rechazar con 413 antes de leer el body si `Content-Length` supera un umbral razonable (8–12 MB alcanza de sobra para este caso de uso, dado que el cliente ya comprime a 2400px).

### S4 — Validación de imagen solo por extensión del nombre · Medio

`lib/assets.ts:90-96` valida la extensión del *nombre del archivo*. Nunca mira los bytes ni el `Content-Type` real. Un archivo arbitrario renombrado a `.png` se sube al Blob store público y se sirve desde ahí con `Content-Type: image/png`.

El riesgo directo es acotado (el `contentType` forzado evita que el navegador lo interprete como HTML/JS), pero convierte el store en un alojamiento de archivos arbitrarios bajo el dominio del proyecto.

**Qué hacer**: verificar los *magic bytes* del archivo (los primeros bytes de PNG/JPEG/WebP/GIF) contra la extensión declarada, server-side.

### S5 — Faltan cabeceras de seguridad · Medio

Verificado con `curl -I https://page-catalogo.vercel.app/`: la única cabecera de seguridad es `strict-transport-security`, que la pone Vercel por defecto. **No hay** `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy`.

Consecuencia concreta verificada: `/admin/login` es enmarcable en un iframe de cualquier origen → clickjacking sobre el formulario de login.

**Qué hacer**: agregar un bloque `headers()` en `next.config.ts`. Como mínimo `X-Frame-Options: DENY` (o `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin`. Una CSP completa requiere más cuidado por los scripts de Google Drive, pero las tres primeras son inmediatas y sin riesgo.

### S6 — `remotePatterns` abierto a todo Vercel Blob · Medio

`next.config.ts`:

```ts
remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
```

El wildcard habilita **cualquier** store de Vercel Blob del mundo, no solo el tuyo. Eso convierte a `/_next/image` en un optimizador/proxy abierto para imágenes de terceros, consumiendo tu cuota de transformaciones.

**Cómo se resolvió**: el hostname **se deriva de `BLOB_READ_WRITE_TOKEN`** en build time, no se escribe a mano. El token tiene el formato `vercel_blob_rw_<storeId>_<secreto>`, y el host público es `<storeId en minúsculas>.public.blob.vercel-storage.com`.

Derivarlo no fue un capricho: **este repo se despliega desde dos proyectos de Vercel distintos** (el personal, `Alvaro-Jhair/page-catalogo` → `dev-eea9`, y el de la tienda, `magnatastore-pe/Page-catalogo`), y **cada uno tiene su propio Blob store con su propio hostname**:

| Proyecto | Store | Hostname |
|---|---|---|
| personal | `store_yVJhzESgEpr0wD9A` | `yvjhzesgepr0wd9a.public.blob…` |
| tienda | `store_gZKQOudaMwWELxHC` | `gzkqoudamwwelxhc.public.blob…` |

Un hostname hardcodeado habría sido correcto en uno y habría dejado **todas las fotos subidas sin optimizar en el otro** — en silencio, y solo en producción. La derivación hace que cada despliegue autorice exactamente su propio store sin que nadie sincronice nada.

Verificado contra ambos stores reales: la fórmula se validó primero contra una URL real del store personal, y después se confirmó en el store de la tienda subiendo un archivo de prueba, leyendo su URL real (`gzkqoudamwwelxhc.public.blob.vercel-storage.com/...`, idéntica a la derivada) y borrándolo. Los casos degenerados (token ausente, vacío o con formato inesperado) devuelven `null`, lo que deja `remotePatterns` vacío y emite un `console.warn` en build en vez de fallar en silencio.

### S7 — Rate limiter: key spoofeable y `Map` sin límite · Bajo

`app/admin/login/actions.ts:12-15` construye la key desde `x-forwarded-for`. En Vercel esa cabecera la controla la plataforma, así que el riesgo es bajo — pero `x-vercel-forwarded-for` es la fuente explícitamente confiable.

Más concreto: `lib/rateLimiter.ts:15` usa un `Map` que **nunca se limpia**. Cada combinación IP+usuario nueva queda residente para siempre. No es explotable como DoS serio (las instancias se reciclan), pero es una fuga de memoria real y evitable.

**Qué hacer**: purgar entradas expiradas en `checkRateLimit`, o llevar un tope de tamaño con desalojo del más viejo.

### S8 — `AUTH_SECRET` sin validación de fuerza · Bajo

`lib/auth.ts:16-22` solo verifica que la variable exista. Un secreto corto pasa sin ruido y deja los JWT HS256 vulnerables a fuerza bruta offline. El valor actual en `.env.local` mide 66 caracteres (adecuado), pero nada lo garantiza en producción ni a futuro.

**Qué hacer**: exigir un mínimo de 32 caracteres y fallar con un mensaje claro si no se cumple.

### S9 — Sin rotación ni revocación de sesión · Bajo

JWT de 8 h sin refresh ni lista de revocación. Cambiar la contraseña del admin **no invalida** las sesiones ya emitidas; la única forma de cortarlas es rotar `AUTH_SECRET`. Aceptable para un solo admin, pero conviene tenerlo consciente y documentado.

### S10 — Vulnerabilidades transitivas · Bajo (informativo)

`npm audit --omit=dev` reporta 3 de severidad alta, todas dentro del árbol de `next@16.2.11`:

- **`sharp` < 0.35.0** (resuelto: 0.34.5) — CVEs heredadas de libvips. Relevante porque `sharp` es justamente lo que procesa las imágenes subidas cuando pasan por `/_next/image`.
- **`postcss`** — XSS en el stringify y lectura de archivos vía `sourceMappingURL`.

**No correr `npm audit fix --force`**: propone degradar a `next@9.3.3`, infinitamente peor que las vulnerabilidades. Hay `next@16.2.12` disponible (estás en `16.2.11`) — actualizar ahí y volver a auditar es el camino correcto.

---

## 2. Escalabilidad

### E1 — El build crece linealmente con cada catálogo · **ALTO**

Medición real de `npm run build` con 3 catálogos: **37.5 s totales**, de los cuales `next build` son ~7 s y la generación de PDF **~30 s (≈10 s por catálogo)**.

Proyección: 10 catálogos → ~2 min de PDF. 20 → ~3.5 min. 50 → ~9 min, acercándose al límite de build de Vercel.

Peor aún: **cada edición de texto de un solo catálogo regenera los PDF de todos**. Cambiar un precio en `ariel` reimprime `apple` y `lux` sin ninguna razón.

**Qué hacer** (por orden de esfuerzo creciente):
1. Regenerar solo los PDF de los catálogos cuyo `.json` cambió en el commit (comparando contra el build anterior o mirando el diff de git). Es el arreglo de mayor impacto por menos trabajo.
2. Si el catálogo crece mucho más, mover la generación de PDF fuera del build: a un job aparte disparado por webhook, o generación on-demand cacheada.

### E3 — `listAssets()` sin paginación · Medio

`lib/assets.ts:41`:

```ts
listBlobs({ prefix: `${ASSETS_SUBDIR}/` }).then((r) => r.blobs)
```

La API de Vercel Blob devuelve como máximo 1000 entradas por página y expone un `cursor` para seguir. El código lo ignora. Pasando las 1000 imágenes, la galería del panel empieza a **truncar en silencio** — sin error, simplemente dejan de aparecer fotos.

**Qué hacer**: iterar con el `cursor` hasta agotar, o paginar la galería en la UI.

### E4 — `listAssets()` completo en cada subida · Medio

`lib/assets.ts:100`:

```ts
const existing = new Set((await listAssets()).map((a) => a.filename));
```

Cada foto que se sube dispara un `readdir` completo **más** un listado completo del Blob store, solo para chequear si el nombre colisiona. Con N imágenes eso es O(N) por subida, y con la subida múltiple (arrastrar 10 fotos) se repite 10 veces.

**Qué hacer**: dado que el sufijo aleatorio ya resuelve las colisiones, lo más simple es aplicarlo siempre (o usar un hash del contenido, ver I3) y eliminar el listado previo por completo.

### E5 — Un solo admin, sin roles ni auditoría · Bajo

`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` son singulares. No hay multiusuario, ni roles, ni trazabilidad: todos los commits se hacen con la identidad del `GITHUB_TOKEN`, así que el histórico de git no distingue quién editó qué. Es coherente con el alcance actual y está documentado — se anota acá porque es el primer techo que se toca si el proyecto suma una segunda persona.

### E2 — Cada guardado es un commit + redeploy (~1–2 min)

Ya está aceptado y documentado en `CLAUDE.md`, y confirmaste que la espera es tolerable. Se menciona sólo para dejar explícito el techo estructural: no hay edición concurrente segura, y el editor espera un deploy completo para ver publicado su cambio. Si algún día molesta, la salida no es optimizar más el commit (ya está en 1–2 round-trips) sino mover el contenido a una base de datos y dejar git solo para el código.

---

## 3. Rendimiento

### P1 — Los PDF son enormes · **ALTO**

Medido sobre el build recién generado:

| Archivo | Tamaño |
|---|---|
| `catalog-ariel.pdf` | **15 MB** |
| `catalog-apple.pdf` | 8.5 MB |
| `catalog-lux.pdf` | 7.9 MB |

Ese link de "descargar PDF" está en la página pública de cierre, y una parte importante de los visitantes lo va a tocar desde el celular con datos móviles. 15 MB es mucho más de lo necesario: `page.pdf()` embebe las imágenes sin recomprimir, a resolución completa.

**Qué hacer**: posprocesar el PDF con Ghostscript (`-dPDFSETTINGS=/ebook`) o similar como paso final del script — típicamente reduce 60-80% con pérdida visual imperceptible en pantalla. Alternativa complementaria: bajar la resolución de las fotos fuente que alimentan el PDF.

### P3 — 37 MB de imágenes en el repo, la mayoría placeholders · Medio

`public/imagenes/` pesa **37 MB** en 55 archivos. El cruce contra los JSON de catálogo da: **15 imágenes realmente referenciadas, 40 no**. Esas 40 son las fotos de las plantillas de arranque (los 9 subdirectorios `apple-minimal/`, `nike-bold/`, `editorial-lux/`, etc.), usadas solo como placeholder al crear un catálogo nuevo.

O sea: ~30 MB viajan en cada build y cada deploy para servir un caso que ocurre unas pocas veces al año.

**Qué hacer**: mover las fotos de plantilla a Vercel Blob (donde ya viven las fotos nuevas) y referenciarlas por URL desde `lib/newCatalog.ts`. Salen del repo, salen del deploy, y siguen funcionando igual.

### P4 — `.git` de 70 MB · Medio

El histórico muestra la causa directamente:

```
040b77f assets: agregar img-9698.jpeg desde el panel de administración
3607663 assets: agregar f30681ea-…png desde el panel de administración
433c5c4 assets: agregar img-9764.jpeg desde el panel de administración
```

Un commit por foto, y git conserva cada versión binaria para siempre. La migración a Blob (`d660aa0`) **detiene el crecimiento hacia adelante**, que era lo importante, pero no reduce los 70 MB ya acumulados.

**Qué hacer**: no es urgente. Si algún día molesta (clones lentos), se limpia con `git filter-repo` — pero eso reescribe el histórico y requiere coordinar con cualquier clon existente. Por ahora, simplemente saber que está y que ya no crece.

### P6 — Un fallo del PDF publica un link de descarga roto, sin avisar · Medio

`scripts/generate-pdf.mjs:177-187` sale con código 0 ante cualquier error. Esa decisión es **correcta** y está bien razonada: publicar un cambio de contenido nunca debe bloquearse por el paso de PDF.

Pero el efecto secundario no está cubierto: `ClosingPage` sigue mostrando el botón de descarga apuntando a `/catalog-<id>.pdf`, y si el PDF nunca se generó, el visitante recibe un 404. El sitio se despliega "exitosamente" con un link roto y nadie se entera.

**Qué hacer**: que el paso de build deje registro de qué PDFs se generaron, y que `ClosingPage` solo muestre el link si el archivo existe. Y/o un aviso visible en el panel de admin cuando un catálogo no tenga PDF vigente.

### Lo que está bien

- `next build` en ~7 s con 3 catálogos: rápido.
- Rutas correctamente clasificadas: `/catalog/[id]` como SSG, `/admin/*` dinámico, `/api/admin/upload` dinámico. Ningún error de configuración de renderizado.
- `tsc` y `eslint` limpios, sin supresiones sospechosas.
- 0 imágenes rotas: las 15 referencias de los JSON existen todas en disco.

---

## 4. Manejo de imágenes

### I1 — Dos backends conviviendo, y el nuevo todavía sin ejercitar · Medio

Hoy hay dos almacenamientos en paralelo:

- `public/imagenes/` — fotos viejas, comiteadas al repo, servidas estáticamente.
- **Vercel Blob** — fotos nuevas desde `d660aa0`.

`listAssets()` une ambos; `replaceAsset()` bifurca según el path sea URL o no. Funciona, pero es complejidad permanente.

**Dato verificado que importa**: los 3 catálogos en producción (`ariel`, `apple`, `lux`) tienen **cero referencias a URLs de Blob** — todas sus imágenes siguen apuntando a `/imagenes/…` en el repo. Es decir, **el camino de Blob todavía no está ejercitado por contenido real publicado**. La primera subida que efectivamente se use en un catálogo publicado es la prueba de fuego de ese camino (incluyendo cómo se comporta `next/image` optimizando desde un dominio remoto, y qué pasa con el PDF que descarga esas fotos por red durante el build).

**Qué hacer**: probar el ciclo completo end-to-end con una foto real (subir → usarla en un bloque → guardar → esperar el deploy → verificar en web **y en el PDF generado**) antes de considerarlo resuelto. Y decidir si las viejas se migran o si la dualidad se mantiene a propósito.

### I2 — Nada borra imágenes, nunca · **ALTO**

No existe ninguna función `deleteAsset` en el proyecto. `deleteCatalog` (`lib/catalogStore.ts:137`) borra el `.json` del catálogo y su loader `.ts` — **nunca sus fotos**, ni en el repo ni en Blob.

Es decir: cada catálogo creado y borrado durante pruebas dejó sus imágenes residentes para siempre. En el repo eso es peso de git permanente (ver P4); en Blob es **costo de almacenamiento que solo sube**.

**Qué hacer**: agregar borrado de assets al panel (con confirmación, reusando el `ConfirmDialogContext` que ya existe), y una vista de "imágenes no usadas por ningún catálogo" para poder limpiar. El cruce ya lo sabés hacer: es exactamente la comparación que hice arriba entre los `src` de los JSON y lo que hay almacenado.

### I3 — Sin deduplicación; el anti-colisión la garantiza · Bajo

`lib/assets.ts:101-104`: si el nombre saneado ya existe, se le agrega un sufijo aleatorio. Eso evita pisar una foto ajena (bien), pero significa que **subir dos veces la misma foto crea dos copias** — y con la importación desde Drive, que es donde más fácil se repite, es el caso común.

**Qué hacer**: nombrar los blobs por hash del contenido (SHA-256 de los bytes). Misma foto = mismo nombre = se sube una sola vez, y de paso desaparece la necesidad del listado previo de E4.

### I4 — La compresión es solo client-side · Medio

`lib/imageCompression.ts` hace un buen trabajo (2400 px máximo, calidad 0.85, preserva PNG, saltea GIF, cae al original ante error) y el resultado medido en su momento fue excelente (9.5 MB → 0.59 MB). Pero:

1. **Corre en el navegador**, así que el servidor no tiene ninguna garantía sobre lo que recibe (ver S3).
2. `COMPRESSION_THRESHOLD_BYTES = 1.5 MB` deja pasar sin tocar cualquier foto por debajo de ese tamaño. Razonable en su momento, pero con las fotos ya en Blob y sirviéndose por `next/image`, 1.5 MB de origen sigue siendo pesado.

**Qué hacer**: mantener la compresión client-side (mejora la latencia percibida, que era su objetivo) y agregar un límite duro server-side como red de seguridad.

### I6 — La invariante `collageLayout` ↔ `collageImages` no está en el tipo · Bajo

`data/schema.ts:47` tiene `deriveCollageLayout()` y `Collage.tsx:20` recorta defensivamente con `COLLAGE_LAYOUT_IMAGE_COUNT`. Ambos parches son correctos y resolvieron un bug real de producción.

Pero `ProductVariantSchema` (`data/schema.ts:99-109`) **sigue aceptando cualquier combinación** de `collageLayout` y `collageImages`. La invariante depende de que dos lugares distintos se acuerden de respetarla, en vez de ser imposible de violar.

**Qué hacer**: un `.superRefine` en `ProductVariantSchema` que rechace la combinación inconsistente. Así el error aparece al guardar (con mensaje claro en el panel) y no como una página rota en el celular de alguien.

### I5 — `alt` sin obligatoriedad real · Bajo

`CollageImageSchema.alt` es `z.string()`, que acepta `""`. `app/page.tsx:36` usa `alt=""` para las portadas del índice, lo cual es correcto (son decorativas junto a un `<h2>` con el título). Pero para las fotos de producto del collage, un `alt` vacío es una pérdida de accesibilidad y SEO que nada impide hoy.

---

## 5. Calidad y operación

### O1 — Sin tests, de ningún tipo · Medio

No hay suite de tests en el proyecto. `tsc` y `eslint` son el único control automático, y ninguno de los dos detecta un error de lógica. Todo el historial se verificó a mano con Playwright ad-hoc — riguroso, pero irrepetible.

Para un panel que **escribe en un repositorio real y en un store de imágenes real**, los caminos que más merecen cobertura son:

- `lib/catalogStore.ts` — validar antes de comitear, regeneración del registro, guardas de create/delete.
- `lib/assets.ts` — saneo de nombres, extensiones rechazadas, colisiones.
- `lib/auth.ts` + `lib/rateLimiter.ts` — credenciales incorrectas, bloqueo tras 5 intentos, expiración.
- `data/schema.ts` — que el contenido real de los 3 catálogos siga validando.

El último es el de mejor relación valor/esfuerzo: un test de 10 líneas que corre `CatalogEntrySchema.safeParse` sobre cada `data/catalogs/*.json` atrapa cualquier corrupción de contenido antes del deploy.

### O2 — Sin CI · Medio

No existe `.github/workflows/`. Nada corre `tsc`, `eslint` ni `build` automáticamente. El contenido está protegido (Zod valida antes de comitear), pero **un cambio de código puede romper producción sin ninguna red**.

**Qué hacer**: un workflow mínimo en push/PR que corra `tsc --noEmit` + `eslint .` + `next build`. Es media hora de trabajo y cubre la clase de fallo que más caro sale.

### O3 — Sin observabilidad · Bajo

No hay logging estructurado ni alertas. Un fallo del PDF, un error de commit contra GitHub, o un 500 en `/api/admin/upload` sólo se descubren mirando `vercel logs` a mano — o cuando alguien nota que algo no está. Dado el fallo suave deliberado del PDF (P6), esto importa más de lo que parece.

### O5 — `CLAUDE.md` desactualizado respecto al código · Bajo

El documento que guía todo el trabajo del proyecto describe cosas que ya no son ciertas:

- La sección "Asset library" dice que `uploadAsset()` comitea vía `commitFile`. Desde `d660aa0` sube a **Vercel Blob**.
- Describe `PreviewOverlay.tsx` y `AddCatalogForm.tsx` como existentes. Ambos fueron eliminados.
- No menciona `AssetGallery.tsx`, `AddPageChooser.tsx`, `blockGrouping.ts`, `pageCompleteness.ts`, `defaultBlock.ts`, que sí existen.

Como es el archivo del que arranca cada sesión de trabajo, la deriva se paga en decisiones tomadas sobre información vieja.

### O6/O7 — Versiones · Bajo

- Vercel corre **Node 24.x**; el proyecto declara `@types/node@^22`. Desajuste menor, sin efecto observado.
- `next@16.2.11` instalado, **`16.2.12` disponible** (ver S10).

### O8 — `<html lang="en">` con contenido en español · Bajo

`app/layout.tsx:36` declara `lang="en"`, pero todo el contenido — catálogos, panel, mensajes de error — está en español. Afecta a lectores de pantalla (pronunciación incorrecta) y al SEO. Es un cambio de una palabra.

### O4 — Higiene del working directory · Bajo

`.venv/` (un entorno virtual de **Python**, sin ninguna razón de ser en un proyecto Node), `Page-catalogo.zip` y `.DS_Store` conviven en el directorio. Están todos en `.gitignore`, así que no contaminan el repo — pero `.venv` en particular ensucia cualquier búsqueda de archivos y conviene borrarlo.

---

## Plan recomendado

Ordenado por relación impacto/esfuerzo, no por severidad pura.

### Ahora — riesgo real, arreglo corto

1. ⬜ **S1** — Quitar los 6 secretos del entorno Preview y confirmar Deployment Protection. *(hallazgo crítico — **pendiente, requiere acción manual en el dashboard**, ver abajo)*
2. ⬜ **S1b** — Verificar que `GITHUB_TOKEN` sea fine-grained y limitado a este repo.
3. ✅ **S3** — Límite de tamaño en `/api/admin/upload` (413 antes de leer el body).
4. ✅ **S2** — Validar `targetPath` en el modo `replace`.
5. ✅ **S5** — Tres cabeceras de seguridad en `next.config.ts`.
6. ✅ **S6** — Cerrar el wildcard de `remotePatterns` al store propio.
7. ✅ **O8** — `lang="es"`.

#### S1 — por qué quedó pendiente y cómo hacerlo

**No se hizo por CLI a propósito.** `vercel env rm <nombre> <entorno>` elimina el **registro completo** de la variable, no solo su targeting de Preview. Como `GITHUB_TOKEN`, `ADMIN_PASSWORD_HASH` y `AUTH_SECRET` son un único registro que apunta a `Production, Preview`, borrarlo por CLI **también los saca de producción** — y al estar encriptados no se pueden leer para volver a cargarlos. El resultado sería un panel de administración inutilizable con secretos irrecuperables.

El camino correcto es el dashboard, que permite editar el targeting sin destruir el valor:

> **Vercel → page-catalogo → Settings → Environment Variables**
> Por cada una de las 6 (`GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`): **Edit → destildar "Preview" → Save**.
>
> Después, en **Settings → Deployment Protection**, confirmar que **Vercel Authentication** esté activo para Preview.

#### Verificación de los fixes aplicados

Probado contra un `next start` real, con una sesión válida firmada localmente:

| Caso | Esperado | Resultado |
|---|---|---|
| `GET /` — cabeceras | 3 presentes | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` ✅ |
| `/admin/login` enmarcable | no | `X-Frame-Options: DENY` ✅ |
| Subida de 20 MB | 413 | `413 — "La imagen pesa 20.0MB y el máximo es 12MB."` ✅ |
| `replace` con `/../../data/catalogs/evil.png` | rechazo | `"La imagen a reemplazar no existe en la biblioteca."` ✅ |
| `replace` a un Blob store ajeno | rechazo | idem ✅ |
| `replace` de `/imagenes/1.png` (asset real) | **pasa** | llega al commit real (falla solo por el `GITHUB_REPO` placeholder local) ✅ |
| `/_next/image` con blob **propio** | 200 | `200 image/jpeg` ✅ |
| `/_next/image` con blob **ajeno** | rechazo | `400` ✅ |
| `POST /api/admin/upload` sin cookie | 401 | `401` ✅ |
| `npm run build` completo | OK | limpio, 3 PDFs generados ✅ |
| `tsc --noEmit` / `eslint .` | limpios | ambos ✅ |

Nota de convención: los rechazos de `replace` devuelven HTTP 200 con `{ok:false, error}`, siguiendo el contrato `UploadAssetResult` que el cliente ya espera. El 413 sí es un status real porque corta antes de entrar a esa lógica.

### Después — lo que evita problemas que se acumulan

8. ✅ **I2** — La galería marca las imágenes que ningún catálogo usa y permite borrarlas (de Blob o del repo, según dónde vivan). Se niega a borrar una en uso, y el botón ni se dibuja sobre esas. Detalle importante encontrado al implementarlo: la primera versión marcaba 40 de 55 como huérfanas porque no contaba las **fotos de las plantillas de arranque** — no las referencia ningún catálogo, pero las necesita el wizard, y borrarlas habría dejado los catálogos nuevos con imágenes rotas. Corregido: quedan 2 huérfanas reales.
9. ✅ **P1** — PDFs de 8-15 MB a 0.7-6 MB (**-60% promedio**). La solución no fue la que suponía esta auditoría (posprocesar con Ghostscript, que no existe en el contenedor de build de Vercel) sino atacar la causa: `next/image` servía AVIF/WebP y Chromium los re-embebía casi sin comprimir. Ahora `scripts/generate-pdf.mjs` pide JPEG solo durante la impresión. Ver el detalle en S6/P1 más arriba.
10. ✅ **E1** — `scripts/generate-pdf.mjs` cachea los PDF en `.next/cache/catalog-pdfs/` y regenera solo lo que cambió. Si no hay nada que imprimir, ni siquiera levanta `next start` ni Chromium.

    Detalle que condicionó el diseño: **no alcanzaba con "saltear el que no cambió"**. Los PDF están en `.gitignore`, así que un build de Vercel arranca sin ninguno y saltear a secas los dejaría en 404 — necesitan sobrevivir de un build al siguiente, y `.next/cache` es el único directorio que Vercel conserva. La clave de caché incluye además un hash del **código que dibuja** (`components/catalog`, `globals.css`, el propio script): sin eso, tocar un layout cambiaría el diseño sin cambiar ningún JSON y todos los catálogos quedarían con el PDF viejo, un fallo silencioso peor que perder segundos de build.

    Medido con builds reales (3 catálogos): caché fría **39s** → sin cambios **6s** → un catálogo cambiado **21s**. Verificado que un cambio de renderer regenera los tres. Confirmado además contra una edición real hecha desde el panel mientras se trabajaba en esto: tocó solo `ariel`, y se reusaron `apple` y `lux`.
11. 🟡 **I1** — Ejercitado parcialmente en producción (magnata): foto subida a Blob y servida por `/_next/image` con 200. Falta confirmarla dentro de un PDF generado.
12. ✅ **O2** — `.github/workflows/ci.yml` corre `tsc` + `eslint` + `next build` en cada push y PR a `main`. En verde.

    **Gotcha que costó dos intentos fallidos, documentado para no repetirlo**: el workflow usa `npm install`, **no `npm ci`**. `npm ci` exige que `package.json` y `package-lock.json` estén perfectamente sincronizados, y este lockfile no puede cumplirlo en Linux: se genera desde macOS, donde npm resuelve el árbol para darwin y deja afuera `@emnapi/core` y `@emnapi/runtime` (dependencias de `@img/sharp-wasm32`) que un runner Linux sí necesita. No se arregla regenerando el lockfile — se probó con `npm install --package-lock-only`, borrándolo y rehaciéndolo de cero, y forzando `--os=linux --cpu=x64`; en los tres casos npm resuelve para la plataforma local. `npm install` además es **lo mismo que usa Vercel**, así que el CI refleja el camino real de deploy en vez de uno más estricto que nadie ejecuta. `--ignore-scripts` saltea el `postinstall` de Playwright (~150MB de Chromium que acá no se usan).
13. 🟡 **S10** — Actualizado a `next@16.2.12`. **No cierra el aviso**: la 16.2.12 sigue fijando `sharp@0.34.5`, así que las 3 vulnerabilidades altas transitivas continúan. Sigue valiendo que `npm audit fix --force` (bajar a `next@9`) sería mucho peor. A revisar cuando Next actualice su propio `sharp`.

### Cuando haya aire — sostenibilidad

14. **P3** — Fotos de plantilla a Blob, fuera del repo.
15. **I3 + E4** — Nombrar blobs por hash de contenido (resuelve ambos de una).
16. **O1** — Tests, empezando por la validación de los `.json` reales.
17. **I6** — `superRefine` para la invariante del collage.
18. **E3** — Paginación de `listAssets()`.
19. **S7, S8, S9** — Endurecimiento del rate limiter y de `AUTH_SECRET`.
20. **O5** — Actualizar `CLAUDE.md` al estado real del código.
21. **O3** — Logging y alertas.

---

## Lo que no es un problema

Para que la lista de arriba se lea en contexto — esto se revisó y está correcto:

- **Sin secretos en el repo.** `git ls-files` confirma que solo `.env.example` (plantilla vacía) está versionado. `.env.local` y `.env.production.local` nunca estuvieron en el histórico.
- **`server-only` bien aplicado**: `auth.ts`, `session.ts`, `github.ts`, `catalogStore.ts`, `assets.ts`, `driveLinks.ts`, `rateLimiter.ts`. Ningún secreto puede filtrarse al bundle del cliente.
- **Doble verificación de sesión** confirmada en producción: `/admin` responde 307 a login, y `POST /api/admin/upload` sin cookie responde **401** limpio.
- **Validación antes de escribir** en todos los caminos de persistencia, sin excepción.
- **Contraseña con bcrypt**, nunca en texto plano; `AUTH_SECRET` actual de longitud adecuada.
- **`expectedHeadOid`** en cada commit — protección real contra la condición de carrera que rompió el registro una vez.
- **Separación Edge/Node** (`auth.ts` sin imports de Next) correcta y necesaria.
- **Integridad de contenido**: 15/15 imágenes referenciadas existen, 3/3 catálogos validan contra el schema, `tsc` y `eslint` limpios.
