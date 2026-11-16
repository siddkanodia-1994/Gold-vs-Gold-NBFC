import { date, doublePrecision, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";

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

// TTM consolidated PE, P/BV and Mcap/Sales per company per day. "ace" rows
// come from the Ace Equity upload; "derived" rows are price-updated from the
// held TTM figures for days after the last Ace row, and are overwritten when
// a newer Ace file covers them.
export const multipleDaily = pgTable(
  "multiple_daily",
  {
    company: varchar("company", { length: 16 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    pe: doublePrecision("pe"),
    pbv: doublePrecision("pbv"),
    mcapSales: doublePrecision("mcap_sales"),
    source: varchar("source", { length: 8 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.company, t.date] })]
);
