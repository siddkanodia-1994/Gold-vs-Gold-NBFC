# Gold vs Gold NBFC

Live dashboard of MCX Gold M (₹ per 10 g) against Muthoot Finance (MUTHOOTFIN) and Manappuram Finance
(MANAPPURAM): the ratio and regression analysis of `20261029 Gold Vs Gold NBFC Regression.xlsx`, laid out like
the AMC Analytics Ratio / Regression tabs.

- **Summary · Gold price** (the default view): MCX Gold M spot as the AMC dashboard's AUM Summary period
  ledger — FY / quarter / month averages with YoY, QoQ, MoM, last 5/20/45 days, optional weekday tables — plus
  a current-quarter panel (latest spot, quarter-to-date average and the projected quarter average if spot holds,
  vs last quarter and the same quarter last year). "Save as default" stores the view, weekday tables and row
  picks (as positions back from the latest period) for everyone.
- **Summary · Ratio & regression**: auto-written takeaways, ratio and regression snapshot for both companies, R² by gold avg days,
  optimum lookback, and the avg-days × lookback R² grid (click a cell to apply it).
- **Ratio**: share price ÷ N-day avg gold, with mean and ±1/±2 SD over the window, z-score, percentile and the
  price at each band.
- **Regression**: price = a + b × N-day avg gold, with actual vs model, residual z (÷ STEYX), return to best fit
  with its SD bands, and the scatter.
- **Multiples**: consolidated TTM PE, P/BV and Mcap/Sales band charts (mean, ±1/±2 SD over the window,
  sample SD as in the AMC dashboard) with the implied share price at each band; the Summary adds a multiples
  snapshot table.
- **Valuation Model**: as the AMC dashboard's. A target-year table (FY28E by default, switch to FY29E / FY30E;
  P/B by default, toggle to PE or Mcap/Sales): that year's net worth / PAT / revenue × Bear/Base/Bull multiple ÷
  shares, discounted two years back to today (the first rate is always the step back from the target year, the
  second the step after; each year keeps its own net worth / PAT / revenue; blank multiples use the 3Y −1 SD /
  Mean / +1 SD). Then the Target Price table: Ratio (price ÷ gold,
  mean ±1 SD × today's gold), Best fit (line at gold −/+ x%) and the chosen multiple, with a weighted average
  (default 35 / 15 / 50). Anyone can view; inputs and "Save as default" need the admin password.
- **Daily Data**: the window's sessions with a CSV download.

The toolbar sets the period (6M–5Y, All, Custom dates) and the gold average (1–250 days); the view is kept in
the URL so it can be shared. The default is 3Y with 1-day (spot) gold.

The calculations reproduce the workbook to the decimal: `npm test` checks them against its cached values
(2Y window, 1D gold, latest row 08-Nov-26).

## Data

| Series | Source | When |
| --- | --- | --- |
| Gold M spot (₹/10 g) | MCX Spot Market file uploaded on `/admin` (mcxindia.com blocks automated access), or typed in | daily, by hand |
| Share closes | DHAN historical API | Vercel Cron 4:05 PM and 7:05 PM IST on weekdays (last 14 days), or **Sync now** on `/admin` |
| Live share prices | DHAN quote API, cached 30 s | the page polls every minute in market hours |
| History to 08-Nov-26 | `data/seed-history.json`, exported from the workbook by `scripts/export-excel-seed.py` | once |

| PE, P/BV, Mcap/Sales | Ace Equity "Query Expression" export uploaded on `/admin` (stored in Neon, never committed — licensed data) | after each quarter's results |
| Multiples after the last Ace day | TTM EPS, BV/share and sales/share backed out of the last 5 Ace days (median, same quarter), held, and divided into each DHAN close; stored daily by the cron, replaced by the next Ace file | daily |

A session with no gold of its own uses the latest earlier gold (as the workbook does for weekend sessions);
the page flags it until that day's spot is uploaded.

## Daily routine

1. **DHAN token** (expires every ~24 h): Dhan Web → Profile → DhanHQ Trading APIs → new token → `/admin` →
   DHAN credentials → Test & save.
2. **Gold**: mcxindia.com → Market Data → Spot Market → GOLDM → download → `/admin` → Upload MCX Gold M spot →
   check the preview → Save. The file can cover many days; only new or changed days are written.
3. **Multiples** (after each company's quarterly results): export the Ace Equity Query Expression (Consolidated
   MCAP NS, Price BV, PE) → `/admin` → Upload Ace Equity multiples → Save. Until then the dashboard shows an
   amber note once a quarter-end has passed since the last file.

## Setup

```bash
npm install
cp .env.example .env.local   # DATABASE_URL, ADMIN_SECRET, SETTINGS_ENCRYPTION_KEY, CRON_SECRET
npm run seed                 # create the tables and load the 5-year history
npm run dev
```

Without `DATABASE_URL` the app runs read-only on the seed history (no admin writes, no live prices).
If your network's DNS can't reach `*.neon.tech`, run the same setup on Vercel instead:
`curl -X POST -H "x-admin-secret: …" https://gold-vs-gold-nbfc.vercel.app/api/admin/setup`.

Deploys: pushes to `main` deploy on Vercel. Set the four env vars in the Vercel project (Neon from the Storage
tab sets `DATABASE_URL`).
