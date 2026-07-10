"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `text-sm transition-colors ${
      pathname === href ? "text-bb-yellow" : "text-bb-text-dim hover:text-bb-text"
    }`;

  return (
    <header className="border-b border-bb-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-medium tracking-[0.15em] text-bb-text">
          BLACKBOX
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/markets" className={linkClass("/markets")}>
            Markets
          </Link>
          <Link href="/portfolio" className={linkClass("/portfolio")}>
            Portfolio
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </nav>
      </div>
    </header>
  );
}
