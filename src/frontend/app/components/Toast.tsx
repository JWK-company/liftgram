"use client";
// @plm SRS-006  토스트 — 앱 셸이 소유하는 알림 슬롯
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **짧은 알림을 화면 한 곳에 모아 띄우는 것.**
//
// 왜 셸이 소유하나: 화면마다 알림 UI를 만들면 위치·색·사라지는 시간이 제각각이 된다.
// 여기 하나만 두고 어디서든 `toast("저장했습니다")` 로 부른다.
//
// 어디에 그려지나: app/layout.tsx의 `#toast-root`에 포털로 올린다. 그래서 부모의
// overflow·transform·z-index에 영향받지 않는다 — 모달 안에서 띄워도 가려지지 않는다.
//
// 쓰는 법:
//   const toast = useToast();
//   toast("증가했습니다");                    // 기본(정보)
//   toast("연결이 끊겼습니다", "error");       // 오류
//
// 상태를 전역 스토어에 두지 않는다: 알림은 **화면이 사는 동안만** 의미가 있는 값이라
// 컨텍스트로 충분하다(서버 데이터를 전역에 올리지 않는 원칙과 같은 이유).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tone = "info" | "error";
type Item = { id: number; text: string; tone: Tone };

const ToastContext = createContext<((text: string, tone?: Tone) => void) | null>(null);

/** 자동으로 사라지는 시간. 오류는 읽을 시간이 더 필요하다. */
const TTL = { info: 2600, error: 5000 } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const seq = useRef(0);

  // 포털 대상은 클라이언트에만 존재한다(서버 렌더 시점엔 document가 없다).
  useEffect(() => setRoot(document.getElementById("toast-root")), []);

  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), TTL[tone]);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {root
        ? createPortal(
            <div className="flex flex-col gap-2" aria-live="polite">
              {items.map((i) => (
                <div
                  key={i.id}
                  data-testid="toast"
                  data-tone={i.tone}
                  className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
                    i.tone === "error"
                      ? "border-(--color-warn) bg-(--color-card) text-(--color-warn)"
                      : "border-(--color-line) bg-(--color-card) text-(--color-ink)"
                  }`}
                >
                  {i.text}
                </div>
              ))}
            </div>,
            root,
          )
        : null}
    </ToastContext.Provider>
  );
}

/**
 * 알림을 띄우는 함수를 얻는다.
 * Provider 밖에서 부르면 조용히 무시한다 — 알림이 없다고 화면이 죽을 이유는 없다.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? (() => {});
}
