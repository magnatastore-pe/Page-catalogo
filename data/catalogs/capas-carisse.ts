import { CatalogEntrySchema } from "../schema";
import type { CatalogEntry } from "../schema";
import data from "./capas-carisse.json";

export const catalogEntry: CatalogEntry = CatalogEntrySchema.parse(data);
