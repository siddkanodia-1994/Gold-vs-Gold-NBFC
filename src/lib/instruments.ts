// The two gold-loan NBFCs, keyed the way the price rows store them. DHAN
// security IDs are from DHAN's scrip master (NSE_EQ segment).
export const COMPANIES = [
  { key: "muthoot", name: "Muthoot Finance", short: "Muthoot", symbol: "MUTHOOTFIN", securityId: "23650" },
  { key: "manappuram", name: "Manappuram Finance", short: "Manappuram", symbol: "MANAPPURAM", securityId: "19061" },
] as const;

export type CompanyKey = (typeof COMPANIES)[number]["key"];
