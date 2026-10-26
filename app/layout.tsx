import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const description =
  "Free, private video converter that runs entirely in your browser. Convert to MP4, WebM, MOV, MKV, GIF, MP3, WAV or M4A — your files never leave your device.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ffmpeg.deltadelta.dev"),
  title: "Video Converter — ffmpeg.deltadelta.dev",
  description,
  applicationName: "ffmpeg.deltadelta.dev",
  openGraph: {
    title: "Convert any video. Right in your browser.",
    description,
    url: "https://ffmpeg.deltadelta.dev",
    siteName: "ffmpeg.deltadelta.dev",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05040a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="backdrop" aria-hidden="true">
          <div className="backdrop__beam" />
          <div className="backdrop__lamp" />
          <div className="backdrop__glow" />
          <div className="backdrop__grid" />
        </div>
        {children}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
