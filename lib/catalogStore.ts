import "server-only";
import { CatalogEntrySchema, type CatalogEntry } from "@/data/schema";
import { commitFile, commitFiles, listRepoJsonFileIds } from "./github";
import { slugify } from "./slug";

const CATALOGS_DIR = "data/catalogs";

export type SaveCatalogResult =
  | { ok: true; commitUrl: string }
  | { ok: false; error: string; issues?: string[] };

export type CreateCatalogResult =
  | { ok: true; id: string; commitUrl: string }
  | { ok: false; error: string };

export type DeleteCatalogResult =
  | { ok: true; commitUrl: string }
  | { ok: false; error: string };

/** Ruta del archivo de datos de un catálogo dentro del repo. */
export function catalogFilePath(catalogId: string): string {
  return `data/catalogs/${catalogId}.json`;
}

/**
 * Valida `candidateEntry` (tema + bloques) contra el modelo de datos
 * (data/schema.ts) y, solo si es válido, comitea el JSON resultante al
 * repo. Nunca escribe nada si la validación falla — el catálogo
 * publicado nunca puede quedar en un estado que no calce con el schema.
 */
export async function saveCatalog(
  catalogId: string,
  candidateEntry: unknown
): Promise<SaveCatalogResult> {
  const parsed = CatalogEntrySchema.safeParse(candidateEntry);
  if (!parsed.success) {
    return {
      ok: false,
      error: "El contenido no calza con el modelo de datos del catálogo.",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  // A partir de acá todo puede fallar por config faltante o por la red:
  // nunca debe propagar como excepción sin capturar hacia la Server
  // Action que llama a esto — el botón "Guardar" del panel espera
  // SIEMPRE un SaveCatalogResult, nunca un throw.
  try {
    const content = Buffer.from(JSON.stringify(parsed.data, null, 2) + "\n", "utf-8").toString(
      "base64"
    );
    const { commitUrl } = await commitFile(
      catalogFilePath(catalogId),
      content,
      `catalog(${catalogId}): actualizar contenido desde el panel de administración`
    );
    return { ok: true, commitUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al guardar." };
  }
}

/**
 * Crea un catálogo nuevo: valida `candidateEntry` (armado del lado del
 * cliente por el wizard de 3 pasos — lib/newCatalog.ts's
 * createStarterCatalog + applyImageOverrides + las ediciones de texto
 * del Paso 3, todo en memoria, sin red hasta este punto) contra el
 * schema y comitea 3 archivos en un solo commit atómico (`commitFiles`)
 * — el JSON del catálogo, su loader .ts, y el registro
 * `data/catalogs/index.ts` regenerado con el id nuevo agregado.
 * Regenerar el registro entero (en vez de intentar parchear el archivo
 * existente) es deliberado: es un archivo corto y completamente
 * derivable de la lista de ids, así que reescribirlo es más robusto
 * que un patch de texto que se vuelve más frágil a medida que crecen
 * los catálogos.
 *
 * `id` nunca se usa tal cual llega — siempre se re-normaliza con
 * `slugify` server-side, sea cual sea el valor que mandó el cliente
 * (incluso si el wizard ya lo mandó "limpio"): termina en una ruta de
 * archivo real dentro del repo, así que confiar ciegamente en un
 * string armado en el cliente sería una vía de path traversal.
 */
export async function createCatalog(id: string, candidateEntry: unknown): Promise<CreateCatalogResult> {
  const trimmedId = slugify(id);
  if (!trimmedId) {
    return { ok: false, error: "El catálogo necesita un id válido." };
  }

  const parsed = CatalogEntrySchema.safeParse(candidateEntry);
  if (!parsed.success) {
    return {
      ok: false,
      error: "El contenido no calza con el modelo de datos del catálogo.",
    };
  }

  try {
    // La lista de ids se pide en vivo a GitHub, no del registro que ya
    // tiene cargado este proceso — ese solo está tan fresco como el
    // último deploy que terminó, y regenerar el registro a partir de
    // datos viejos ya rompió un build una vez (ver nota en
    // listRepoJsonFileIds). La misma llamada ya trae el headOid actual,
    // así que el commit de abajo no necesita pedirlo de nuevo.
    const { ids: existingIds, headOid } = await listRepoJsonFileIds(CATALOGS_DIR);
    if (existingIds.includes(trimmedId)) {
      return { ok: false, error: `Ya existe un catálogo con el id "${trimmedId}".` };
    }
    const allIds = [...existingIds, trimmedId];

    const { commitUrl } = await commitFiles(
      [
        { path: catalogFilePath(trimmedId), base64Content: toBase64(jsonFileContent(parsed.data)) },
        { path: `data/catalogs/${trimmedId}.ts`, base64Content: toBase64(catalogLoaderSource(trimmedId)) },
        { path: `data/catalogs/index.ts`, base64Content: toBase64(registryIndexSource(allIds)) },
      ],
      `catalog(${trimmedId}): crear catálogo desde el panel de administración`,
      { expectedHeadOid: headOid }
    );
    return { ok: true, id: trimmedId, commitUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido al crear el catálogo.",
    };
  }
}

/**
 * Elimina un catálogo: borra su JSON y su loader .ts, y regenera
 * `data/catalogs/index.ts` sin su id — mismo commit atómico que
 * `createCatalog`, en la dirección contraria. Nunca deja el registro
 * apuntando a un catálogo que ya no existe (eso rompería el build
 * entero, no solo ese catálogo), así que valida el id contra el
 * registro actual antes de tocar nada, y rechaza dejar el sitio sin
 * ningún catálogo.
 */
export async function deleteCatalog(id: string): Promise<DeleteCatalogResult> {
  try {
    // Mismo motivo que en createCatalog: la lista de ids sale de
    // GitHub en vivo, no del registro que ya tiene cargado este
    // proceso — y trae el headOid actual de regalo.
    const { ids: existingIds, headOid } = await listRepoJsonFileIds(CATALOGS_DIR);
    if (!existingIds.includes(id)) {
      return { ok: false, error: `No existe un catálogo con el id "${id}".` };
    }

    const remainingIds = existingIds.filter((existingId) => existingId !== id);
    if (remainingIds.length === 0) {
      return { ok: false, error: "No se puede eliminar el único catálogo que queda." };
    }

    const { commitUrl } = await commitFiles(
      [
        { path: catalogFilePath(id), base64Content: null },
        { path: `data/catalogs/${id}.ts`, base64Content: null },
        { path: `data/catalogs/index.ts`, base64Content: toBase64(registryIndexSource(remainingIds)) },
      ],
      `catalog(${id}): eliminar catálogo desde el panel de administración`,
      { expectedHeadOid: headOid }
    );
    return { ok: true, commitUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido al eliminar el catálogo.",
    };
  }
}

function toBase64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

function jsonFileContent(entry: CatalogEntry): string {
  return JSON.stringify(entry, null, 2) + "\n";
}

function catalogLoaderSource(id: string): string {
  return `import { CatalogEntrySchema } from "../schema";
import type { CatalogEntry } from "../schema";
import data from "./${id}.json";

export const catalogEntry: CatalogEntry = CatalogEntrySchema.parse(data);
`;
}

function registryIndexSource(ids: string[]): string {
  const imports = ids
    .map((catalogId, i) => `import { catalogEntry as entry${i} } from "./${catalogId}";`)
    .join("\n");
  const entries = ids.map((catalogId, i) => `  ${JSON.stringify(catalogId)}: entry${i},`).join("\n");

  return `// Registro de catálogos disponibles. Renderizar un catálogo es pedirlo
// acá por id, nunca importar el contenido de una colección específica
// directamente en app/ o components/.
//
// Regenerado por lib/catalogStore.ts (createCatalog) cada vez que se
// agrega un catálogo desde el panel — no editar a mano el orden de
// imports, se reescribe completo a partir de la lista de ids.

${imports}
import type { CatalogEntry } from "../schema";

// Tipado explícito (no \`satisfies\`) a propósito: con un registro
// vacío (\`ids\` = []), \`satisfies Record<string, CatalogEntry>\` deja
// que TS infiera el tipo del objeto literal \`{}\` en vez de ensancharlo
// — \`keyof {}\` es \`never\`, y \`CatalogId = keyof typeof catalogs\`
// colapsaba a \`never\`, rompiendo la compilación en cualquier archivo
// que indexara \`catalogs[id]\` (encontrado de verdad al probar borrar
// el último catálogo de un registro). Con la anotación explícita el
// tipo es siempre \`Record<string, CatalogEntry>\`, vacío o no.
export const catalogs: Record<string, CatalogEntry> = {
${entries}
};

export type CatalogId = keyof typeof catalogs;
`;
}
