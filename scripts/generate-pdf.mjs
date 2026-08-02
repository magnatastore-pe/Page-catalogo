// Genera public/catalog-<id>.pdf "imprimiendo" el propio catálogo web
// con un navegador headless, en vez de reconstruir el diseño en una
// librería de PDF aparte — reutiliza el 100% de los componentes y
// estilos existentes (ver @media print en app/globals.css).
//
// Corre como último paso de `npm run build`: levanta un `next start`
// efímero contra el build recién generado, imprime, y lo apaga.
import { chromium } from "playwright";
import vercelChromium from "@sparticuz/chromium";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Un catálogo = un data/catalogs/<id>.json (ver data/catalogs/index.ts,
// que sigue exactamente esa misma convención). Leer el directorio en
// vez de mantener una lista de ids hardcodeada acá es lo que hace que
// agregar un catálogo desde el panel (lib/catalogStore.ts) no requiera
// tocar este script — apenas el commit trae el .json nuevo, el próximo
// build ya genera su PDF.
function getCatalogIds() {
  return readdirSync(path.join(rootDir, "data", "catalogs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * Caché de PDFs entre builds (E1 de la auditoría).
 *
 * El problema: imprimir cada catálogo cuesta ~10s, y hasta ahora
 * *cada* build regeneraba *todos*. Cambiar un precio en un catálogo
 * reimprimía los demás sin ninguna razón, y el costo crece lineal con
 * la cantidad de catálogos.
 *
 * Por qué no alcanza con "saltear el que no cambió": los PDF están en
 * .gitignore, así que un build de Vercel arranca sin ninguno — saltear
 * a secas los dejaría en 404. Hace falta un lugar donde sobrevivan de
 * un build al siguiente, y en Vercel ese lugar es `.next/cache`, el
 * único directorio que se conserva entre builds.
 *
 * La clave de caché no es solo el contenido del catálogo: también
 * entra un hash del código que lo dibuja (componentes de catálogo,
 * estilos globales y este mismo script). Sin eso, tocar un layout
 * cambiaría el diseño sin cambiar ningún JSON, y todos los catálogos
 * se quedarían con el PDF viejo — un modo de falla silencioso y mucho
 * peor que perder unos segundos de build. Con el hash del renderer
 * adentro, cualquier cambio de código regenera todo; lo que se ahorra
 * es el caso común, que es justo el que dispara el panel: editar
 * contenido.
 */
const CACHE_DIR = path.join(rootDir, ".next", "cache", "catalog-pdfs");

/** Hash de todo lo que afecta cómo se ve un PDF, sin ser el contenido del catálogo. */
function computeRendererHash() {
  const hash = createHash("sha256");
  const files = [];

  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (/\.(tsx?|css)$/.test(entry.name)) files.push(full);
    }
  };

  collect(path.join(rootDir, "components", "catalog"));
  files.push(path.join(rootDir, "app", "globals.css"));
  files.push(path.join(rootDir, "scripts", "generate-pdf.mjs"));

  for (const file of files.sort()) {
    hash.update(path.relative(rootDir, file));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

/** Clave de caché de un catálogo: su contenido + el hash del renderer. */
function cacheKeyFor(catalogId, rendererHash) {
  const json = readFileSync(path.join(rootDir, "data", "catalogs", `${catalogId}.json`));
  return createHash("sha256").update(rendererHash).update(json).digest("hex");
}

const PORT = process.env.PDF_GEN_PORT || "4173";
const BASE_URL = `http://localhost:${PORT}`;

// Dimensiones fijas del "viewport" de impresión: proporción retrato
// 3:4, coherente con el diseño mobile-first del lookbook. Cada .page
// (100svh) se imprime como una página física de este tamaño.
const PAGE_WIDTH = "1080px";
const PAGE_HEIGHT = "1440px";

// El Chromium que baja `playwright install chromium` no arranca en el
// contenedor de build de Vercel: le faltan librerías del sistema
// (confirmado en un build real: "chrome-headless-shell: error while
// loading shared libraries: libnspr4.so"). @sparticuz/chromium empaqueta
// un binario compilado estáticamente justo para este tipo de entorno
// (Lambda/Vercel), así que en Vercel lanzamos ese binario en vez del que
// Playwright descargó; en cualquier otro lado (local, otro CI) seguimos
// usando el Chromium propio de Playwright, que sí corre normalmente.
async function launchBrowser() {
  if (!process.env.VERCEL) {
    return chromium.launch();
  }
  return chromium.launch({
    args: vercelChromium.args,
    executablePath: await vercelChromium.executablePath(),
    headless: true,
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // todavía no está arriba
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function printCatalog(page, catalogId) {
  const catalogUrl = `${BASE_URL}/catalog/${catalogId}`;
  const outputPath = path.join(rootDir, "public", `catalog-${catalogId}.pdf`);
  const viewportHeight = parseInt(PAGE_HEIGHT, 10);

  await page.goto(catalogUrl, { waitUntil: "networkidle" });

  // El catálogo usa IntersectionObserver (RevealOnScroll) y lazy
  // loading nativo de next/image: ambos solo se disparan cuando el
  // contenido realmente entra en el viewport durante un scroll.
  // page.pdf() no hace scroll de verdad, así que sin este paso todo
  // lo que está debajo del primer tramo queda invisible o sin
  // cargar en el PDF (la portada se salva porque fuerza su propio
  // "visible" de entrada; el resto no).
  console.log(`[generate-pdf] (${catalogId}) scrolling through the page to trigger lazy content...`);
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < scrollHeight; y += viewportHeight) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForLoadState("networkidle");
    await sleep(200); // margen para que corra la transición de RevealOnScroll
  }
  // El loop de arriba avanza en pasos fijos de un viewport, así que
  // puede quedarse corto respecto al final real de la página si la
  // altura total no es un múltiplo exacto — dejando la última sección
  // sin disparar su observer. Se re-mide scrollHeight (puede haber
  // crecido con el contenido ya cargado) y se fuerza un scroll
  // explícito hasta ahí.
  const finalScrollHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), finalScrollHeight);
  await page.waitForLoadState("networkidle");
  await sleep(300);

  // No confiar solo en los sleep() de arriba: en un build real de
  // Vercel (más lento/limitado que una máquina local) dos páginas
  // completas salieron negras —imagen de fondo y texto ausentes—
  // porque el margen fijo no alcanzó a cubrir la carga+decode de fotos
  // de 1.5-2.6MB. Se espera explícitamente a que toda imagen haya
  // terminado de cargar, con un timeout generoso en vez de una espera
  // a ciegas.
  //
  // Antes se esperaba además a que TODOS los bloques `.reveal`
  // estuvieran marcados `visible`. Ya no aplica: la animación se
  // repite en cada entrada al viewport, así que al terminar el
  // recorrido solo la última sección sigue marcada y esa condición no
  // se cumple nunca más (se colgaba hasta el timeout). Lo que
  // garantiza que el texto salga en el PDF es la regla de
  // `@media print` en app/globals.css, que fuerza `.reveal` visible al
  // imprimir sin depender del estado de la clase.
  console.log(`[generate-pdf] (${catalogId}) waiting for every image to finish loading...`);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("img")).every((img) => img.complete && img.naturalWidth > 0),
    { timeout: 30000 }
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);

  await page.emulateMedia({ media: "print" });

  await page.pdf({
    path: outputPath,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  console.log(`[generate-pdf] wrote ${path.relative(rootDir, outputPath)}`);
}

async function main() {
  const catalogIds = getCatalogIds();
  const rendererHash = computeRendererHash();
  mkdirSync(CACHE_DIR, { recursive: true });

  // Se resuelve la caché ANTES de levantar nada: si ningún catálogo
  // cambió, copiar los PDF guardados y salir evita arrancar un
  // `next start` y un Chromium headless que no se van a usar — que es
  // justamente de dónde sale casi todo el costo de este paso.
  const pending = [];
  let reused = 0;

  for (const catalogId of catalogIds) {
    const key = cacheKeyFor(catalogId, rendererHash);
    const cachedPdf = path.join(CACHE_DIR, `${catalogId}.pdf`);
    const cachedKey = path.join(CACHE_DIR, `${catalogId}.key`);
    const outputPath = path.join(rootDir, "public", `catalog-${catalogId}.pdf`);

    const hit =
      existsSync(cachedPdf) &&
      existsSync(cachedKey) &&
      readFileSync(cachedKey, "utf-8").trim() === key &&
      statSync(cachedPdf).size > 0;

    if (hit) {
      copyFileSync(cachedPdf, outputPath);
      console.log(`[generate-pdf] (${catalogId}) sin cambios, reusado de caché`);
      reused += 1;
    } else {
      pending.push({ catalogId, key, cachedPdf, cachedKey, outputPath });
    }
  }

  if (pending.length === 0) {
    console.log(`[generate-pdf] ${catalogIds.length} catálogo(s), todos reusados de caché — no hace falta imprimir nada`);
    return;
  }

  console.log(`[generate-pdf] starting next start on port ${PORT}...`);
  const server = spawn("npx", ["next", "start", "-p", PORT], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  let browser;
  try {
    await waitForServer(BASE_URL);
    console.log("[generate-pdf] server ready, launching headless browser...");

    browser = await launchBrowser();

    // Una sola página, reutilizada (navegada de catálogo en catálogo)
    // en vez de una `newPage()` por catálogo: el Chromium que corre en
    // Vercel (@sparticuz/chromium) va con `--single-process`, que no
    // tolera abrir una página nueva después de cerrar otra — confirmado
    // en un build real, donde el segundo catálogo crasheaba con
    // "Target page, context or browser has been closed" apenas
    // arrancaba. Con una sola página que solo navega, ese modo nunca
    // se pone a prueba.
    const viewportWidth = parseInt(PAGE_WIDTH, 10);
    const viewportHeight = parseInt(PAGE_HEIGHT, 10);
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });

    // Pedir las fotos como JPEG/PNG en vez de AVIF/WebP, SOLO para el
    // PDF. next/image sirve AVIF/WebP cuando el navegador los acepta
    // (next.config.ts los tiene primeros en `formats`), y eso es lo
    // correcto para la web — pesan mucho menos. Pero al imprimir es al
    // revés: Chromium no puede copiar un AVIF/WebP tal cual dentro del
    // PDF, así que lo decodifica y lo vuelve a guardar prácticamente sin
    // comprimir. Medido en el PDF de Ariel: fondos de 1080x1440 ocupando
    // 1.1-2.6MB cada uno, cuando el mismo fondo como JPEG son ~250KB.
    // Recibiendo JPEG, Chromium lo embebe sin recodificar.
    //
    // Solo afecta a la generación del PDF: el sitio real sigue sirviendo
    // AVIF/WebP a los visitantes, sin cambios.
    await page.route("**/_next/image**", async (route) => {
      await route.continue({
        headers: { ...route.request().headers(), accept: "image/jpeg,image/png,*/*" },
      });
    });

    for (const { catalogId, key, cachedPdf, cachedKey, outputPath } of pending) {
      await printCatalog(page, catalogId);
      // La caché se actualiza solo después de imprimir bien: si algo
      // falla a mitad, la clave vieja sigue ahí y el próximo build
      // vuelve a intentarlo, en vez de quedar marcado como al día con
      // un PDF que no se generó.
      copyFileSync(outputPath, cachedPdf);
      writeFileSync(cachedKey, key);
    }

    console.log(
      `[generate-pdf] ${catalogIds.length} catálogo(s): ${reused} reusado(s) de caché, ${pending.length} generado(s)`
    );
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  // Falla "suave" a propósito: generar el PDF depende de poder lanzar un
  // Chromium headless dentro del contenedor de build, algo menos
  // garantizado que el build de Next en sí (por ej. si al entorno de
  // build le faltara alguna librería del sistema que Chromium necesita).
  // Que ese paso falle no debería bloquear publicar un cambio de
  // contenido del catálogo — el PDF queda desactualizado hasta el
  // próximo build exitoso, pero el sitio sí se despliega.
  console.error("[generate-pdf] no se pudo generar el PDF, se continúa sin bloquear el deploy:", err);
  process.exit(0);
});
