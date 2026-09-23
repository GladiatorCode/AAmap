import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GladyMap",
  description: "Place named pins on a map.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-dvh overflow-hidden antialiased">{children}</body>
    </html>
  );
}
