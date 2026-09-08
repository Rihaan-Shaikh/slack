import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slack - Travel Disruption Recovery Engine",
  description: "A trip is a dependency graph, where buffer time is edge slack.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF7F2] text-[#221F1A] antialiased selection:bg-[#E5DFD5]">
        {children}
      </body>
    </html>
  );
}
