import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "RAG V1",
  description: "Grounded question answering over your documents",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
