import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aisle Flow",
  description: "A shopping list ordered by your route through the store.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
