"use client";

// 권한 없는 주소로 들어오면 안내만 보이고 RPC 를 부르지 않는다. 실제 경계는 서버다.
import type { Role } from "@app/contracts";
import type { ReactNode } from "react";
import { useSession } from "./SessionProvider";

export function RoleGate({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { role } = useSession();
  if (!roles.includes(role)) {
    return (
      <div data-testid="role-denied" className="rounded-lg border border-line bg-surface p-6">
        이 화면을 볼 권한이 없습니다.
      </div>
    );
  }
  return <>{children}</>;
}
