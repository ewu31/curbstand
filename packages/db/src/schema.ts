import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["customer", "producer", "operator"]);
export const organizationType = pgEnum("organization_type", ["individual", "restaurant"]);
export const groupBuyStatus = pgEnum("group_buy_status", [
  "open",
  "funding",
  "matched",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);
export const bidStatus = pgEnum("bid_status", ["submitted", "selected", "rejected"]);
export const depositStatus = pgEnum("deposit_status", [
  "pending",
  "confirmed_manual",
  "refunded_manual",
  "forfeited_manual",
]);
export const completionStatus = pgEnum("completion_status", ["pending", "completed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: userRole("role").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  organizationType: organizationType("organization_type"),
  contact: varchar("contact", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const producerProfiles = pgTable("producer_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  farmName: varchar("farm_name", { length: 200 }).notNull(),
  produceTypes: text("produce_types").array().notNull(),
  serviceRadiusMiles: integer("service_radius_miles").notNull(),
});

export const produceCatalog = pgTable("produce_catalog", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  active: boolean("active").default(true).notNull(),
});

export const pickupLocations = pgTable("pickup_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address").notNull(),
  region: varchar("region", { length: 80 }).default("Seattle / Puget Sound").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/Los_Angeles").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const groupBuys = pgTable("group_buys", {
  id: uuid("id").defaultRandom().primaryKey(),
  produceType: varchar("produce_type", { length: 80 }).notNull(),
  targetLbs: decimal("target_lbs", { precision: 10, scale: 2 }).notNull(),
  pickupLocationId: uuid("pickup_location_id").notNull().references(() => pickupLocations.id),
  pickupWindowStart: timestamp("pickup_window_start", { withTimezone: true }).notNull(),
  pickupWindowEnd: timestamp("pickup_window_end", { withTimezone: true }).notNull(),
  joinDeadline: timestamp("join_deadline", { withTimezone: true }).notNull(),
  bidDeadline: timestamp("bid_deadline", { withTimezone: true }).notNull(),
  status: groupBuyStatus("status").default("open").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  selectedBidId: uuid("selected_bid_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groupBuyParticipants = pgTable("group_buy_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupBuyId: uuid("group_buy_id").notNull().references(() => groupBuys.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  requestedLbs: decimal("requested_lbs", { precision: 10, scale: 2 }).notNull(),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).notNull(),
  depositStatus: depositStatus("deposit_status").default("pending").notNull(),
  completionStatus: completionStatus("completion_status").default("pending").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bids = pgTable("bids", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupBuyId: uuid("group_buy_id").notNull().references(() => groupBuys.id, { onDelete: "cascade" }),
  producerId: uuid("producer_id").notNull().references(() => users.id),
  pricePerLb: decimal("price_per_lb", { precision: 10, scale: 2 }).notNull(),
  availableLbs: decimal("available_lbs", { precision: 10, scale: 2 }).notNull(),
  availabilityWindowStart: timestamp("availability_window_start", { withTimezone: true }).notNull(),
  availabilityWindowEnd: timestamp("availability_window_end", { withTimezone: true }).notNull(),
  notes: text("notes"),
  status: bidStatus("status").default("submitted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupBuyId: uuid("group_buy_id").notNull().references(() => groupBuys.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
