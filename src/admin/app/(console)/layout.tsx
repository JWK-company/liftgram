import type { ReactNode } from "react";
import { ConsoleShell } from "../components/ConsoleShell";
import { SessionProvider } from "../components/SessionProvider";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </SessionProvider>
  );
}
