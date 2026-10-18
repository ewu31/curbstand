import { createDb, schema } from "./index.js";
import { demoUsers } from "./demo-users.js";

const { db, client } = createDb();
const passwordHash = "scrypt$curbstand-demo$not-checked";

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

await db.insert(schema.users).values(demoUsers.map((user) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  email: user.email,
  passwordHash,
  organizationType: user.organizationType ?? undefined,
  contact: user.email,
}))).onConflictDoNothing({ target: schema.users.email });

const producer = demoUsers.find((user) => user.role === "producer");
if (producer && "farmName" in producer) {
  await db.insert(schema.producerProfiles).values({
    userId: producer.id,
    farmName: producer.farmName,
    produceTypes: ["apples", "carrots", "tomatoes", "leafy-greens"],
    serviceRadiusMiles: 40,
  }).onConflictDoNothing();
}

await client.end();
