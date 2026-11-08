"use client";
// @plm SRS-051  다이얼로그·액션 시트 — RN의 `Alert.alert`를 대신한다
//
// ─────────────────────────────────────────────────────────────────────────────
// app은 확인창과 선택지를 전부 `Alert.alert`로 띄운다(운동 종료·운동 취소·종목 삭제·세트 타입·
// 플레이트 계산 — 5곳). 웹에는 그런 OS 대화상자가 없고, `window.confirm`은 모양이 브라우저마다
// 다르고 스타일을 줄 수 없어 **같은 앱처럼 보이지 않는다.** 그래서 같은 역할의 시트를 여기 둔다.
//
// 두 가지 모양:
//   · Dialog       제목 + 본문 + 버튼들(확인/취소) — app의 2버튼 Alert
//   · ActionSheet  제목 + 선택지 목록 — app의 다중 버튼 Alert(세트 타입 등)
//
// 둘 다 #modal-root로 포털한다 — 부모의 overflow·z-index에 갇히지 않게.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { Button } from "./Button";
import { AppText } from "./primitives";

// 시트 껍데기 자체도 내보낸다 — 자기 버튼을 갖는 편집 폼(캡션 수정)이 이것만 필요로 한다.
const openOverlays: (() => void)[] = [];
/** 열린 창이 있으면 맨 위 창을 닫고 true. */
export function closeTopOverlay(): boolean {
  const top = openOverlays[openOverlays.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function Overlay({
  onClose,
  children,
  testId,
  placement = "center",
}: {
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  /** bottom = 바닥 시트(SRS-054) — 선택지·설정처럼 엄지 근처에서 고르는 것. center = 확인창. */
  placement?: "center" | "bottom";
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  // 열린 창 목록 — 뒤로 가기를 받는 화면이 맨 위 창만 닫을 수 있게(SPEC-023). onClose 는 새 함수일 수 있어 ref 로 잡는다.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const entry = () => closeRef.current();
    openOverlays.push(entry);
    return () => {
      const at = openOverlays.indexOf(entry);
      if (at >= 0) openOverlays.splice(at, 1);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!root) return null;
  const bottom = placement === "bottom";
  return createPortal(
    <div
      data-testid={testId}
      className={`fixed inset-0 z-50 flex justify-center ${
        bottom ? "items-end" : "items-center p-[var(--spacing-xl)]"
      }`}
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        className={
          bottom
            ? "relative max-h-[88dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[var(--radius-lg)] bg-(--color-surface) px-[var(--spacing-lg)] pt-[var(--spacing-sm)] pb-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]"
            : "relative w-full max-w-[380px] rounded-[var(--radius-lg)] bg-(--color-surface) p-[var(--spacing-lg)]"
        }
      >
        {bottom ? (
          <div
            aria-hidden
            className="mx-auto mb-[var(--spacing-md)] h-1 w-10 rounded-full bg-(--color-line-strong)"
          />
        ) : null}
        {children}
      </div>
    </div>,
    root,
  );
}

/**
 * 제목 + 임의의 내용 + 확인 버튼. 선택지가 목록이 아니라 **칩 묶음**일 때 쓴다
 * (세트 변형처럼 축이 둘 이상이면 한 줄짜리 목록으로는 표현이 안 된다).
 */
export function SheetShell({
  title,
  children,
  onClose,
  hideOk,
  testId,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** 내용이 자기 버튼을 갖고 있을 때(가이드의 이전/다음) 확인 버튼을 뺀다. */
  hideOk?: boolean;
  testId?: string;
}) {
  return (
    <Overlay onClose={onClose} testId={testId} placement="bottom">
      {title ? <AppText variant="heading">{title}</AppText> : null}
      {children}
      {hideOk ? null : (
        <div className="mt-[var(--spacing-md)]">
          <Button title={t("common.ok")} onPress={onClose} />
        </div>
      )}
    </Overlay>
  );
}

/** 확인창 — 되돌릴 수 없는 동작(운동 종료·삭제) 앞에 세운다. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <Overlay onClose={onCancel} testId={testId}>
      <AppText variant="heading">{title}</AppText>
      {message ? (
        <div className="mt-[var(--spacing-sm)]">
          <AppText variant="body" color="textMuted">
            {message}
          </AppText>
        </div>
      ) : null}
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={cancelLabel ?? t("common.cancel")}
            variant="secondary"
            onPress={onCancel}
            testId="dialog-cancel"
          />
        </div>
        <div className="flex-1">
          <Button
            title={confirmLabel}
            variant={destructive ? "danger" : "primary"}
            onPress={onConfirm}
            testId="dialog-confirm"
          />
        </div>
      </div>
    </Overlay>
  );
}

export interface SheetOption {
  label: string;
  onPress: () => void;
  /** 켜진 항목(현재 값) — 왼쪽에 점을 찍어 표시한다. */
  selected?: boolean;
  destructive?: boolean;
  testId?: string;
  /** 이름 아래 한 줄 설명(세트 방식의 고르는 기준 등 · SPEC-041). */
  description?: string;
  /** 고를 수 없는 항목 — 흐리게 보이고 눌리지 않는다(기구 제한 등). */
  disabled?: boolean;
}

/** 선택지 목록 — app의 다중 버튼 Alert 자리. */
export function ActionSheet({
  title,
  options,
  onClose,
  testId,
}: {
  title: string;
  options: SheetOption[];
  onClose: () => void;
  testId?: string;
}) {
  return (
    <Overlay onClose={onClose} testId={testId} placement="bottom">
      {title ? <AppText variant="heading">{title}</AppText> : null}
      <ul className="mt-[var(--spacing-md)] flex flex-col">
        {options.map((o, i) => (
          <li key={o.label}>
            <button
              type="button"
              data-testid={o.testId}
              disabled={o.disabled}
              aria-disabled={o.disabled || undefined}
              onClick={() => {
                if (o.disabled) return;
                o.onPress();
                onClose();
              }}
              style={{ borderTopWidth: i === 0 ? 0 : 1, borderColor: "var(--color-line)" }}
              className={`flex min-h-[44px] w-full items-center gap-[var(--spacing-sm)] py-[var(--spacing-md)] text-left ${o.disabled ? "opacity-40" : ""}`}
            >
              <span
                style={{ backgroundColor: o.selected ? "var(--color-brand)" : "transparent" }}
                className="h-2 w-2 shrink-0 rounded-full"
              />
              {/* [원본] 이름 한 줄 — 설명 줄을 붙일 수 있게 묶었다(SPEC-041) */}
              <span className="flex min-w-0 flex-col">
                <AppText variant="body" color={o.destructive ? "danger" : "text"}>
                  {o.label}
                </AppText>
                {o.description ? (
                  <AppText variant="caption" color="textMuted">
                    {o.description}
                  </AppText>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-[var(--spacing-sm)]">
        <Button title={t("common.cancel")} variant="secondary" onPress={onClose} />
      </div>
    </Overlay>
  );
}

/** 알림만 — 결과를 보여 주고 닫는다(플레이트 계산 결과 등). */
export function InfoDialog({
  title,
  message,
  onClose,
  testId,
}: {
  title: string;
  message: string;
  onClose: () => void;
  testId?: string;
}) {
  return (
    <Overlay onClose={onClose} testId={testId}>
      <AppText variant="heading">{title}</AppText>
      <div className="mt-[var(--spacing-sm)] whitespace-pre-line">
        <AppText variant="body" color="textMuted">
          {message}
        </AppText>
      </div>
      <div className="mt-[var(--spacing-md)]">
        <Button title={t("common.ok")} onPress={onClose} />
      </div>
    </Overlay>
  );
}
