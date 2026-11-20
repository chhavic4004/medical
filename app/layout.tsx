import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Qurely: your care, your queue, your time", description: "Book appointments, join digital queues and track your wait in real time." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
