import type { Metadata } from "next";

// Receive links are one-time and private: keep them out of search results.
export const metadata: Metadata = {
  title: "Receive a file – Flint",
  robots: { index: false, follow: false },
};

export default function ReceiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
