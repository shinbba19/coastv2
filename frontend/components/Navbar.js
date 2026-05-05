"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Marketplace" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/faucet", label: "Faucet" },
    { href: "/admin", label: "Admin" },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          COAST v2
        </Link>
        <div className="flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition ${
                pathname === l.href
                  ? "text-blue-600"
                  : "text-gray-600 hover:text-blue-600"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
