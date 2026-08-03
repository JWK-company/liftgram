"use client";
// @plm SRS-019  사진 고르기 — app 컴포저의 '사진' 버튼 자리
//
// app은 `expo-image-picker`로 앨범을 연다. 웹에는 그 자리에 `<input type="file">`이 있는데,
// 기본 모양이 브라우저마다 달라 앱처럼 보이지 않는다 — 그래서 **입력은 숨기고 버튼이 대신 연다.**
//
// 고른 사진은 **올리기 전에 미리 보여 준다.** app과 같은 순서다(고름 → 미리보기 → 게시).
// 미리보기 주소는 `URL.createObjectURL`로 만든 것이라 다 쓰면 반드시 돌려줘야 한다(메모리 누수).
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export function ImagePicker({
  file,
  onPick,
  disabled,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    // 미리보기를 놓아줄 때 주소도 돌려준다 — 안 그러면 고를 때마다 메모리가 는다.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <>
      {preview ? (
        <div className="relative mb-[var(--spacing-sm)]">
          {/* 방금 고른 로컬 파일이라 next/image가 최적화할 대상이 아니다. */}
          {/* biome-ignore lint/performance/noImgElement: blob: 주소의 로컬 미리보기 */}
          <img
            src={preview}
            alt=""
            data-testid="compose-preview"
            className="h-[180px] w-full rounded-[var(--radius-md)] bg-(--color-surface-alt) object-cover"
          />
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label={t("common.cancel")}
            data-testid="compose-preview-remove"
            className="absolute top-[var(--spacing-xs)] right-[var(--spacing-xs)] rounded-full bg-(--color-surface)"
          >
            <Icon name="close-circle" size={26} color="var(--color-ink)" />
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        data-testid="compose-file"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // 같은 파일을 다시 고를 수 있게 비운다(값이 같으면 change가 안 뜬다).
          e.target.value = "";
        }}
      />
      <Button
        title={t("feed.addImage")}
        icon="image-outline"
        variant="secondary"
        size="sm"
        fullWidth={false}
        disabled={disabled}
        onPress={() => inputRef.current?.click()}
        testId="compose-add-image"
      />
    </>
  );
}
