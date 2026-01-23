import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn from Podcast Moments | Lenny's Podcast",
  description: "Discover meaningful moments from Lenny's Podcast. Search and explore clips from 269 episodes.",
  icons: {
    icon: "/Lenny Podcast Logo.webp",
    shortcut: "/Lenny Podcast Logo.webp",
    apple: "/Lenny Podcast Logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
