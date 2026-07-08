import type { Metadata } from "next";

import "@fontsource/space-grotesk/300.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/geist-mono/400.css";

import { Analytics } from "@vercel/analytics/next";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { NetworkBanner } from "@/components/network-banner";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "BLACKBOX — Confidential Prediction Markets",
  description:
    "A confidential prediction market protocol powered by Zama FHE. Positions, prediction amounts, and outcome shares stay encrypted end to end.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bb-black text-bb-text">
        <Providers>
          <Nav />
          <NetworkBanner />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
