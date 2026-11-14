import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-ibm-plex-sans", weight: ["400", "500", "600", "700"], subsets: ["latin"] });
const plexCondensed = IBM_Plex_Sans_Condensed({ variable: "--font-ibm-plex-condensed", weight: ["400", "500", "600", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gold vs Gold NBFC",
  description: "MCX Gold M vs Muthoot Finance and Manappuram Finance — ratio and regression analysis",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexCondensed.variable}`}>{children}</body>
    </html>
  );
}
