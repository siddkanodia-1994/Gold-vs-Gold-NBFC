// Loads data/seed-history.json (the workbook's 5-year history) into the
// database. Safe to re-run: rows are upserted by date.
//   npm run db:push && npm run seed
import seed from "../data/seed-history.json";
import { upsertGold, upsertShares } from "../src/lib/prices";
import type { RawRow } from "../src/lib/analytics/series";

async function main() {
  const rows = (seed as { rows: RawRow[] }).rows;
  const gold = rows.filter((r) => r.g !== undefined).map((r) => ({ date: r.d, price: r.g! }));
  const shares = rows.filter((r) => r.mu !== undefined || r.ma !== undefined).map((r) => ({ date: r.d, muthoot: r.mu, manappuram: r.ma }));
  console.log(`gold rows: ${await upsertGold(gold, "excel")}`);
  console.log(`share rows: ${await upsertShares(shares, "excel")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
