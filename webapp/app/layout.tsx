import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn from Podcast Moments | Lenny's Podcast",
  description: "Discover meaningful moments from Lenny's Podcast. Search and explore clips from 269 episodes.",
  icons: {
    icon: "/lennypodcastlogo.png",
    shortcut: "/lennypodcastlogo.png",
    apple: "/lennypodcastlogo.png",
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
