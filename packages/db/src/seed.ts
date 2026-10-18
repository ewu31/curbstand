import { createDb, schema } from "./index.js";

const { db, client } = createDb();

await db.insert(schema.produceCatalog).values([
  { slug: "apples", displayName: "Apples" },
  { slug: "carrots", displayName: "Carrots" },
  { slug: "tomatoes", displayName: "Tomatoes" },
  { slug: "leafy-greens", displayName: "Leafy greens" },
]).onConflictDoNothing();

await db.insert(schema.pickupLocations).values([
  { name: "UW District public pickup", address: "University District, Seattle" },
  { name: "Ballard public pickup", address: "Ballard, Seattle" },
  { name: "Bellevue public pickup", address: "Downtown Bellevue" },
]).onConflictDoNothing();

await client.end();
