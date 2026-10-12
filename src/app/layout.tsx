import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://pass-the-mic.vercel.app"),
  title: "Pass The Mic",
  description: "The sing-the-next-line party game. Pick a song, pass the phone (or play online) — when the music stops, you sing. The AI is listening.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon-180.png",
  },
  appleWebApp: { capable: true, title: "Pass The Mic", statusBarStyle: "black-translucent" },
  other: { "mobile-web-app-capable": "yes" },
  openGraph: {
    title: "Pass The Mic 🎤",
    description: "When the music stops, you sing the next line. Miss it, lose a life. Last one singing wins.",
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#120a07",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Google-hosted (not next/font): the highlight reel's canvas draws with these exact family names */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
