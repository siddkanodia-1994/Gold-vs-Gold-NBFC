// Creates the tables and loads data/seed-history.json (the workbook's 5-year
// history) into an empty database. The same runs on Vercel via POST
// /api/admin/setup, for machines whose DNS can't reach Neon.
//   npm run seed
import { ensureTables, seedIfEmpty } from "../src/lib/db/setup";

async function main() {
  await ensureTables();
  const r = await seedIfEmpty();
  console.log(r.seeded ? `Loaded ${r.rows} dates.` : `Skipped: table already has ${r.rows} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
