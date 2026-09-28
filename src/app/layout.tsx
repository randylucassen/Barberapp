import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const title = "KPPRTJE!";
const description = "Boek een barber op locatie — betaal veilig via escrow.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title,
  description,
  openGraph: { title, description, type: "website", locale: "nl_NL", images: ["/og-image.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
