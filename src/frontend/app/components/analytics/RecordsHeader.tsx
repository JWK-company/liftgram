"use client";
// @plm SRS-054  기록 탭 머리 — 목록/달력 전환 (결정 D1: 기록 + 캘린더 = 한 탭)
//
// 같은 데이터(지난 운동)를 두 가지로 본다. 주소가 곧 상태다 — /history 는 목록, /calendar 는 달력.
// 그래서 전환은 링크이고, 새로고침·뒤로 가기가 그대로 맞는다.
import type { ReactNode } from "react";
import { AppBar } from "../ui/AppBar";
import { Segmented } from "../ui/rows";

export function RecordsHeader({ view, actions }: { view: "list" | "calendar"; actions?: ReactNode }) {
  return (
    <>
      <AppBar title="기록" actions={actions} />
      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <Segmented
          testId="records-view"
          value={view}
          items={[
            { value: "list", label: "목록", href: "/history", testId: "records-view-list" },
            { value: "calendar", label: "달력", href: "/calendar", testId: "records-view-calendar" },
          ]}
        />
      </div>
    </>
  );
}
