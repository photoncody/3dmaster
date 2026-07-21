import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { fontDisplay, fontSans } from "@/lib/fonts";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Master",
  description: "Web-based organizer for 3D printing workshops",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = config.authEnabled ? await auth() : null;

  return (
    <html lang="en">
      <body className={`${fontSans.variable} ${fontDisplay.variable}`}>
        <Providers>
          <div className="app-shell">
            <SiteHeader
              authEnabled={config.authEnabled}
              userName={session?.user?.name}
            />
            <main className="main">{children}</main>
            <footer className="site-footer">
              3D Master — self-hosted print workshop organizer
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
