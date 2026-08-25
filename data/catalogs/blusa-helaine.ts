import { CatalogEntrySchema } from "../schema";
import type { CatalogEntry } from "../schema";
import data from "./blusa-helaine.json";

export const catalogEntry: CatalogEntry = CatalogEntrySchema.parse(data);
