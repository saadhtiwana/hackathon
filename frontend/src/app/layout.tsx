import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-plex-mono",
});

const themeBoot = `(function(){try{var t=localStorage.getItem("relay-theme");var r=document.documentElement;if(t==="dark")r.classList.add("dark");else if(t==="light")r.classList.add("light");}catch(e){}})();`;

export const metadata: Metadata = {
  title: { default: "Relay", template: "%s · Relay" },
  description: "Every inbound lead has one accountable owner.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-canvas text-text">
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
