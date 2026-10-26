import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { BottomTabs, CompareTray, MobileHeader, TopNav } from "@/components/shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PieRadar: live performance of stock pies", template: "%s · PieRadar" },
  description:
    "Browse and compare stock pies with live, uncapped returns calculated from real market prices: full holdings, allocation, charts and leaderboards.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <Providers>
          <TopNav />
          <MobileHeader />
          <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-4 md:px-6 md:pb-16 md:pt-6">{children}</main>
          <CompareTray />
          <BottomTabs />
        </Providers>
      </body>
    </html>
  );
}
