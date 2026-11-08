import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Business OS — Shorlah Cloud", description: "Build. Manage. Grow. A clearer way to run your business." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
