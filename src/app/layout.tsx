import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Query Assistant",
  description:
    "AI-powered text-to-SQL assistant for natural language data queries",
  icons: {
    icon: "/oss-data-analyst.svg",
    apple: "/oss-data-analyst.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray100">{children}</body>
    </html>
  );
}
