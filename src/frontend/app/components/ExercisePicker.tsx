"use client";
// @plm SRS-004  종목 고르기 — 로컬 카탈로그에서 검색해 세션에 추가한다
//
// 카탈로그는 이미 로컬에 있다(lib/catalogSync.ts가 채워 둔다). 그래서 이 화면도 네트워크가
// 없어도 열린다 — 헬스장에서 종목을 바꾸는 일이 흔하다는 것이 이유다(SRS-006).
//
// 검색은 JS로 거른다. 웹 어댑터(LokiJS)의 `Q.like`가 한글을 못 걸러내기 때문이다(카탈로그 화면과 같은 이유).
//
// 카탈로그 개편 P3(ADR-033): 검색 규칙은 도메인 한 곳(core/domain/exerciseSearch) — 종목 탭과 같은 함수다.
// 띄어쓰기·초성·별칭·영문을 보고 관련도 순으로 줄 세운다. 별칭이 맞았으면 「대표 이름 · 맞은 별칭」으로 보이고,
// 고르면 그 정보(맞은 말·정확 여부)를 함께 넘긴다 — 부르는 사람이 표시 이름·함축 축을 정한다. @plm SRS-056
import { useQueryData } from "@app/core/db/hooks";
import { useEffect, useMemo, useState } from "react";
import { hasPictogram } from "@app/core/data/exerciseVisual";
import { exerciseListName } from "@app/core/domain/exerciseName";
import {
  buildExerciseSearchIndex,
  matchedLabel,
  searchExercises,
  type SearchHit,
  type SearchableExercise,
} from "@app/core/domain/exerciseSearch";
import type { EquipmentType } from "@app/core/domain/types";
import { equipmentLabelFromDomain } from "@/lib/labels";
import { Pictogram } from "./Pictogram";
import { Button } from "./ui/Button";
import { TextField } from "./ui/inputs";
import { AppText, Card, Tag } from "./ui/primitives";

type Repo = typeof import("@app/core/data/exerciseRepository");
type Row = SearchableExercise & { nameEn: string | null; equipment: EquipmentType };

// [원본] /** 한 번에 보여줄 최대 개수 — 336종을 다 그리면 고르기 어렵다. 검색으로 좁히게 한다. */
// [원본] const LIMIT = 40;
/** 한 번에 그릴 최대 개수 — 관련도 순이라 위쪽이 답이다. 빈 질의(전체 목록)도 이 수까지만 그린다. */
const LIMIT = 60;

/** 고른 결과의 검색 정보 — 질의가 없을 때(목록에서 그냥 고름)는 undefined. */
export type PickInfo = Pick<SearchHit, "matched" | "matchedKind" | "exact">;

export default function ExercisePicker({
  onPick,
  onClose,
  bare,
}: {
  onPick: (exerciseId: string, info?: PickInfo) => void;
  onClose: () => void;
  /** 바닥 시트 안 — 카드 테두리 없이, 목록을 시트 높이만큼(SRS-054 시안 03). */
  bare?: boolean;
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

  // [원본] 대소문자 무시 부분일치(nameKo·nameEn) + 앞 40건 자르기
  // const rows: Row[] = useMemo(() => {
  //   const list = models.map((m) => m as unknown as Row);
  //   const q = query.trim().toLowerCase();
  //   const filtered = q
  //     ? list.filter((e) => e.nameKo.toLowerCase().includes(q) || (e.nameEn ?? "").toLowerCase().includes(q))
  //     : list;
  //   return filtered.slice(0, LIMIT);
  // }, [models, query]);
  // [개선] 공용 색인 — 목록이 바뀔 때만 다시 만든다
  const byId = useMemo(
    () => new Map(models.map((m) => [(m as unknown as Row).id, m as unknown as Row])),
    [models],
  );
  const index = useMemo(() => buildExerciseSearchIndex([...byId.values()]), [byId]);
  const result = useMemo(() => searchExercises(index, query), [index, query]);
  const searching = query.trim().length > 0;
  const rows = result.hits.slice(0, LIMIT).flatMap((h) => {
    const e = byId.get(h.id);
    return e ? [{ e, hit: h }] : [];
  });
  const similar = result.similar.flatMap((id) => {
    const e = byId.get(id);
    return e ? [e] : [];
  });

  const Shell = bare ? BareShell : PickerCard;
  return (
    <Shell>
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

        {rows.length === 0 && similar.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            {repo ? "해당하는 종목이 없습니다." : "카탈로그를 여는 중입니다…"}
          </AppText>
        ) : (
          <ul
            data-testid="picker-list"
            className={`flex flex-col gap-[var(--spacing-xs)] overflow-y-auto ${bare ? "max-h-[60dvh]" : "max-h-80"}`}
          >
            {rows.map(({ e, hit }) => {
              const alias = searching ? matchedLabel(hit, e.nameKo) : null;
              return (
                <li key={e.id}>
                  <PickRow
                    e={e}
                    alias={alias}
                    onPress={() =>
                      onPick(
                        e.id,
                        searching
                          ? { matched: hit.matched, matchedKind: hit.matchedKind, exact: hit.exact }
                          : undefined,
                      )
                    }
                  />
                </li>
              );
            })}
            {searching && similar.length ? (
              // 비슷한 운동 — 같은 동작의 다른 기구·비슷한 동작(SRS-056). 결과와 섞지 않고 아래 구역으로.
              <li data-testid="picker-similar" className="mt-[var(--spacing-sm)]">
                <AppText
                  variant="label"
                  color="textFaint"
                  className="block px-[var(--spacing-sm)] pb-[var(--spacing-xs)]"
                >
                  비슷한 운동
                </AppText>
                <ul className="flex flex-col gap-[var(--spacing-xs)]">
                  {similar.map((e) => (
                    <li key={e.id}>
                      <PickRow e={e} alias={null} onPress={() => onPick(e.id)} />
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/** 결과 한 줄 — 대표 이름(+ 맞은 별칭) · 기구 태그. */
function PickRow({ e, alias, onPress }: { e: Row; alias: string | null; onPress: () => void }) {
  return (
    <button
      type="button"
      data-testid={`pick-${e.id}`}
      onClick={onPress}
      className="flex w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] p-[var(--spacing-sm)] text-left hover:bg-(--color-surface-alt)"
    >
      {/* P5: 이름만으로 헷갈리는 종목을 그림으로 가린다(피드백 #8) — 시드 종목만, 정지 그림 @plm SRS-055 */}
      {hasPictogram(e.id) ? (
        <span className="h-8 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
          <Pictogram exerciseId={e.id} className="h-full w-full" />
        </span>
      ) : null}
      <AppText variant="body" className="min-w-0 flex-1 truncate">
        {exerciseListName(e)}
        {alias ? (
          <span data-testid="pick-alias" className="text-(--color-ink3)">
            {" "}
            · {alias}
          </span>
        ) : null}
      </AppText>
      <Tag label={equipmentLabelFromDomain(e.equipment)} />
    </button>
  );
}

function PickerCard({ children }: { children: React.ReactNode }) {
  return <Card className="border-(--color-brand)!">{children}</Card>;
}

function BareShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
