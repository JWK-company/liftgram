"use client";
// @plm SRS-004  종목 고르기 — 로컬 카탈로그에서 검색해 세션에 추가한다
//
// 카탈로그는 이미 로컬에 있다(lib/catalogSync.ts가 채워 둔다). 그래서 이 화면도 네트워크가
// 없어도 열린다 — 헬스장에서 종목을 바꾸는 일이 흔하다는 것이 이유다(SRS-006).
//
// 검색은 JS로 거른다. 웹 어댑터(LokiJS)의 `Q.like`가 한글을 못 걸러내기 때문이다(카탈로그 화면과 같은 이유).
import { useQueryData } from "@app/core/db/hooks";
import { useEffect, useMemo, useState } from "react";
import { exerciseListName } from "@app/core/domain/exerciseName";
import type { EquipmentType } from "@app/core/domain/types";
import { equipmentLabelFromDomain } from "@/lib/labels";
import { Button } from "./ui/Button";
import { TextField } from "./ui/inputs";
import { AppText, Card, Tag } from "./ui/primitives";

type Repo = typeof import("@app/core/data/exerciseRepository");
type Row = { id: string; nameKo: string; nameEn: string | null; equipment: EquipmentType };

/** 한 번에 보여줄 최대 개수 — 336종을 다 그리면 고르기 어렵다. 검색으로 좁히게 한다. */
const LIMIT = 40;

export default function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/exerciseRepository").then((m) => {
      if (!cancelled) setRepo(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useQueryData(() => (repo ? repo.queryExercises() : null), [repo]);

  const rows: Row[] = useMemo(() => {
    const list = models.map((m) => m as unknown as Row);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((e) => e.nameKo.toLowerCase().includes(q) || (e.nameEn ?? "").toLowerCase().includes(q))
      : list;
    return filtered.slice(0, LIMIT);
  }, [models, query]);

  return (
    <Card className="border-(--color-brand)!">
      <div data-testid="exercise-picker">
        <div className="mb-[var(--spacing-md)] flex items-center gap-[var(--spacing-sm)]">
          <TextField
            testId="picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 검색"
            className="mb-0! flex-1"
            // 종목을 고르러 연 패널이라 바로 입력할 수 있어야 한다
            autoFocus
          />
          <Button
            testId="picker-close"
            title="닫기"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={onClose}
          />
        </div>

        {rows.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            {repo ? "해당하는 종목이 없습니다." : "카탈로그를 여는 중입니다…"}
          </AppText>
        ) : (
          <ul
            data-testid="picker-list"
            className="flex max-h-80 flex-col gap-[var(--spacing-xs)] overflow-y-auto"
          >
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  data-testid={`pick-${e.id}`}
                  onClick={() => onPick(e.id)}
                  className="flex w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] p-[var(--spacing-sm)] text-left hover:bg-(--color-surface-alt)"
                >
                  <AppText variant="body" className="min-w-0 flex-1 truncate">
                    {exerciseListName(e)}
                  </AppText>
                  <Tag label={equipmentLabelFromDomain(e.equipment)} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
