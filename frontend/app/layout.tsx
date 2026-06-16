import type { Metadata } from "next";
// import { DM_Sans } from "next/font/google";
// import "./globals.css";
import { Providers } from "@/components/shared/Providers";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: { default: "A to Z Routes", template: "%s | A to Z Routes" },
  description: "Premium logistics intelligence platform. Track every mile, from A to Z.",
  keywords: ["logistics", "tracking", "shipment", "delivery", "routes"],
  authors: [{ name: "Zahik Abas" }],
  openGraph: {
    title: "A to Z Routes",
    description: "Track every mile, from A to Z.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "hsl(222, 22%, 11%)",
                color: "hsl(210, 20%, 92%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "10px",
                fontSize: "14px",
              },
              success: {
                iconTheme: {
                  primary: "#00e5a0",
                  secondary: "transparent",
                },
              },
              error: {
                iconTheme: {
                  primary: "#ef4444",
                  secondary: "transparent",
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}