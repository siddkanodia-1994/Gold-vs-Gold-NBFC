import { date, doublePrecision, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// One row per calendar date. Gold and the two share closes arrive from
// different places (MCX spot upload vs DHAN) on different days, so each
// column is nullable and each writer only touches its own columns.
export const dailyPrice = pgTable("daily_price", {
  date: date("date", { mode: "string" }).primaryKey(),
  /** MCX Gold M spot, ₹ per 10 g. */
  gold: doublePrecision("gold"),
  goldSource: varchar("gold_source", { length: 16 }),
  muthoot: doublePrecision("muthoot"),
  manappuram: doublePrecision("manappuram"),
  shareSource: varchar("share_source", { length: 16 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
