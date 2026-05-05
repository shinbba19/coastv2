import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "COAST v2 — Real Estate Tokenization",
  description: "Fractional real estate investment on Sepolia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <Navbar />
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
