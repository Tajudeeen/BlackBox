"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the mobile menu on route change. Comparing during render instead
  // of in an effect avoids the extra render pass an effect-based reset
  // would cause (see react-hooks/set-state-in-effect).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  const linkClass = (href: string) =>
    `text-sm transition-colors ${
      pathname === href ? "text-bb-yellow" : "text-bb-text-dim hover:text-bb-text"
    }`;

  return (
    <header className="border-b border-bb-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="text-sm font-medium tracking-[0.15em] text-bb-text">
          BLACKBOX
        </Link>

        {/* Desktop nav — visible from md breakpoint up */}
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </nav>

        {/* Mobile: compact connect button + menu toggle, visible below md */}
        <div className="flex items-center gap-3 md:hidden">
          <div className="scale-90 origin-right">
            <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-bb-line text-bb-text-dim"
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="flex flex-col border-t border-bb-line px-4 py-3 md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`py-2.5 text-sm ${linkClass(link.href)}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
