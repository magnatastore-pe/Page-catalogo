import { CatalogEntrySchema } from "../schema";
import type { CatalogEntry } from "../schema";
import data from "./capa-cava-nu.json";

export const catalogEntry: CatalogEntry = CatalogEntrySchema.parse(data);
