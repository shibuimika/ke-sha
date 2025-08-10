"use client";

import { ThemeProvider } from "next-themes";
import AppToaster from "@/components/app-toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
      <AppToaster />
    </ThemeProvider>
  );
}


