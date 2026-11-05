"use client";

// 왼쪽 고정 메뉴와 넓은 본문. 좁은 폭에서는 메뉴가 위쪽 접는 메뉴가 된다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Role } from "@app/contracts";
import { OpsAlertProvider, useOpsAlert } from "@/lib/opsAlert";
import { MENU, roleLabel } from "@/lib/roles";
import { useSession } from "./SessionProvider";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { role } = useSession();
  return (
    <OpsAlertProvider enabled={role === Role.ADMIN}>
      <Frame>{children}</Frame>
    </OpsAlertProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useSession();
  const { alert } = useOpsAlert();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = MENU.filter((m) => m.roles.includes(role));

  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">리프트그램 운영</span>
          <button
            type="button"
            data-testid="menu-toggle"
            aria-expanded={open}
            className="rounded-md border border-line px-2 py-1 md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            메뉴
          </button>
        </div>
        <nav data-testid="menu" className={`${open ? "block" : "hidden"} px-2 pb-2 md:block md:flex-1`}>
          {items.map((m) => {
            const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                data-testid={m.testid}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-2 ${active ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2"}`}
              >
                {m.label}
                {m.href === "/ops" && alert && (
                  <span
                    data-testid="menu-ops-dot"
                    role="img"
                    aria-label="운영 확인 필요"
                    className="ml-2 inline-block size-2 rounded-full bg-danger align-middle"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className={`${open ? "block" : "hidden"} border-t border-line px-4 py-3 md:block`}>
          <p data-testid="me-name" className="truncate">
            {user.displayName}
          </p>
          <p data-testid="me-role" className="text-muted text-xs">
            {roleLabel(role)}
          </p>
          <button
            type="button"
            data-testid="sign-out"
            className="mt-1 inline-block py-1.5 text-muted text-xs underline"
            onClick={signOut}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
