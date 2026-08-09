import { CatalogEntrySchema } from "../schema";
import type { CatalogEntry } from "../schema";
import data from "./cava-nu.json";

export const catalogEntry: CatalogEntry = CatalogEntrySchema.parse(data);
