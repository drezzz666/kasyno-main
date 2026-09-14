import type { Metadata } from "next";
import "./globals.css";
import "./motion-fix.css";

export const metadata: Metadata = {
  title: "2fgt — Social Casino",
  description: "Prywatny klub gier na wirtualne żetony.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
