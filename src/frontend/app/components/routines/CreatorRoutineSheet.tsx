"use client";
// @plm SRS-091  크리에이터 루틴 시트 — 주제 하나를 열면 영상 버전 목록, 버전을 고르면 같은 시트 안에서 출처·종목·저장(spec rev1 M-3).
//
// 규칙(ADR-045): 출처는 「출처: 채널 · 「제목」」 인용으로만 · 원본은 유튜브 링크(새 창) · 제휴·보증 아님 고지 ·
// 저장 루틴 이름에는 채널명을 넣지 않고(공유 시 이름만 퍼짐 · qa H-2) 출처는 루틴 메모에 둔다.
import {
  creatorRoutineNotes,
  creatorRoutinesFor,
  type CreatorRoutine,
  type CreatorTopic,
  youtubeWatchUrl,
} from "@app/core";
import { useEffect, useRef, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

/** 정정·삭제 요청 연락처(약관·개인정보처리방침과 같은 창구) */
const CONTACT = "admin@tarae.org";

export function creatorRoutineName(r: CreatorRoutine, dayName: string): string {
  return r.days.length > 1 ? `${r.labelKo} — ${dayName}` : r.labelKo;
}

export function CreatorTopicSheet({
  topic,
  existingNames,
  onClose,
  onSaved,
}: {
  topic: CreatorTopic;
  existingNames: string[];
  onClose: () => void;
  onSaved: (made: number, total: number) => void;
}) {
  const versions = creatorRoutinesFor(topic.id);
  const [picked, setPicked] = useState<CreatorRoutine | null>(null);
  const title = lang === "ko" ? topic.nameKo : topic.nameEn;

  if (picked) {
    return (
      <CreatorVersionStep
        topicTitle={title}
        routine={picked}
        existingNames={existingNames}
        onBack={() => setPicked(null)}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  return (
    <SheetShell title={title} onClose={onClose} hideOk testId="creator-topic-sheet">
      <AppText variant="body" color="textMuted" className="mt-[4px] block">
        {lang === "ko" ? topic.blurbKo : topic.blurbEn}
      </AppText>
      <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-sm)]">
        {versions.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`creator-version-${r.id}`}
            onClick={() => setPicked(r)}
            className="flex min-w-0 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
          >
            <AppText variant="body" className="block truncate font-bold">
              {r.labelKo}
            </AppText>
            <AppText variant="caption" color="textMuted" className="block truncate">
              {r.source.channel}
            </AppText>
            <AppText variant="caption" color="textMuted" className="line-clamp-2 block">
              {r.source.title}
            </AppText>
            <AppText variant="label" color="textMuted">
              {t("creator.dayCount", { count: r.days.length })}
            </AppText>
          </button>
        ))}
      </div>
      <div className="mt-[var(--spacing-md)]">
        <Button title={t("creator.close")} variant="secondary" onPress={onClose} />
      </div>
    </SheetShell>
  );
}

function CreatorVersionStep({
  topicTitle,
  routine,
  existingNames,
  onBack,
  onClose,
  onSaved,
}: {
  topicTitle: string;
  routine: CreatorRoutine;
  existingNames: string[];
  onBack: () => void;
  onClose: () => void;
  onSaved: (made: number, total: number) => void;
}) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [active, setActive] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState(false);
  // 저장 재진입 막기 — 확인창 「저장」 연타로 같은 루틴이 두 벌 생기던 것(qa code M-2)
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const ids = [...new Set(routine.days.flatMap((d) => d.items.map((i) => i.exerciseId)))];
    void (async () => {
      const [namesMod, exerciseRepo] = await Promise.all([
        import("@app/core/data/exerciseNames"),
        import("@app/core/data/exerciseRepository"),
      ]);
      const [m, have] = await Promise.all([
        namesMod.getExerciseDisplayNameMap(ids),
        exerciseRepo.getActiveExerciseIds(ids),
      ]);
      if (alive) {
        setNames(m);
        setActive(have);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routine]);

  const save = async () => {
    // 종목 조회 전(active=null)에는 저장하지 않는다 — 0개만 저장되던 것(qa code M-1)
    if (savingRef.current || active === null) return;
    savingRef.current = true;
    setDupe(false);
    setSaving(true);
    let made = 0;
    try {
      const routineRepo = await import("@app/core/data/routineRepository");
      const notes = creatorRoutineNotes(routine);
      for (const d of routine.days) {
        // 기기에 없는 종목은 조용히 뺀다(콘셉트 루틴과 같은 규칙)
        const items = d.items
          .filter((i) => active?.has(i.exerciseId))
          .map((i) => ({
            exerciseId: i.exerciseId,
            targetSets: i.sets,
            targetRepsMin: i.repsMin,
            targetRepsMax: i.repsMax,
            restSeconds: i.restSec ?? null,
            note: i.noteKo ?? null,
          }));
        if (!items.length) continue;
        await routineRepo.importRoutine(creatorRoutineName(routine, d.nameKo), items, { notes });
        made += 1;
      }
    } catch (e) {
      // 중간에 실패해도 만든 만큼은 알린다(qa L-2) — 원인은 콘솔에 남긴다
      console.error("크리에이터 루틴 저장 실패", e);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    onSaved(made, routine.days.length);
  };

  const onSave = () => {
    const willMake = routine.days.map((d) => creatorRoutineName(routine, d.nameKo));
    if (!dupe && willMake.some((n) => existingNames.includes(n))) {
      setDupe(true);
      return;
    }
    void save();
  };

  if (dupe) {
    return (
      <ConfirmDialog
        testId="creator-dupe"
        title={t("concept.dupeTitle")}
        message={t("concept.dupeMessage")}
        confirmLabel={t("common.save")}
        onCancel={() => setDupe(false)}
        onConfirm={() => void save()}
      />
    );
  }

  const url = youtubeWatchUrl(routine.source.videoId);
  return (
    <SheetShell title={routine.labelKo} onClose={onClose} hideOk testId="creator-sheet">
      <div className="mt-[2px] block">
        <button
          type="button"
          onClick={onBack}
          data-testid="creator-back"
          className="min-h-[44px] text-left text-(--color-brand) text-[length:var(--text-sm)]"
        >
          ‹ {t("creator.backToList", { topic: topicTitle })}
        </button>
      </div>
      <AppText variant="caption" color="textMuted" className="block" data-testid="creator-source">
        {t("creator.source", { channel: routine.source.channel, title: routine.source.title })}
      </AppText>
      <AppText variant="label" color="textMuted" className="mt-[2px] block">
        {/* 근거 문구는 실제 근거대로(qa code M-3): 분석 자료가 있으면 그 줄이 대신한다 */}
        {routine.basis
          ? t("creator.checkedOnly", { date: routine.source.verifiedAt })
          : t("creator.verified", { date: routine.source.verifiedAt })}
      </AppText>
      {routine.basis ? (
        // 세트·횟수가 영상을 분석한 2차 자료 기준일 때 — 어디서 왔는지 밝힌다
        <a
          href={routine.basis.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="creator-basis"
          className="mt-[2px] flex min-h-[32px] items-center text-(--color-ink3) text-[length:var(--text-xs)] underline"
        >
          {t("creator.basis", { label: routine.basis.labelKo })}
        </a>
      ) : null}
      {lang === "ko" ? null : (
        <AppText variant="label" color="textMuted" className="block">
          {t("creator.koreanContent")}
        </AppText>
      )}
      <AppText variant="body" className="mt-[var(--spacing-sm)] block">
        {routine.summaryKo}
      </AppText>

      {routine.days.map((d) => (
        <div
          key={d.nameKo}
          className="mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[var(--spacing-sm)]"
        >
          {routine.days.length > 1 ? (
            <AppText variant="caption" color="primary" className="font-bold">
              {d.nameKo}
            </AppText>
          ) : null}
          <ul className="mt-[2px] flex flex-col gap-[2px]">
            {d.items.map((i) => {
              const missing = active !== null && !active.has(i.exerciseId);
              const isDefault = i.src.sets === "default" || i.src.reps === "default";
              const reps = i.repsMin === i.repsMax ? `${i.repsMin}` : `${i.repsMin}–${i.repsMax}`;
              return (
                <li
                  key={i.exerciseId}
                  data-testid={`creator-item-${i.exerciseId}`}
                  className={`flex min-w-0 flex-wrap items-baseline gap-x-[var(--spacing-sm)] ${missing ? "opacity-50" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-(--color-ink) text-[length:var(--text-sm)]">
                    {names.get(i.exerciseId) ?? i.exerciseId}
                    {missing ? ` · ${t("creator.missingExercise")}` : ""}
                  </span>
                  <span className="shrink-0 text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums">
                    {i.sets}×{reps}
                  </span>
                  {isDefault ? (
                    <span className="shrink-0 rounded-[var(--radius-pill)] bg-(--color-surface) px-[6px] text-(--color-ink3) text-[length:var(--text-xs)]">
                      {t("creator.defaultChip")}
                    </span>
                  ) : null}
                  {i.noteKo ? (
                    <span className="basis-full text-(--color-ink3) text-[length:var(--text-xs)]">
                      {i.noteKo}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="creator-open-video"
        aria-label={t("creator.openVideoAria")}
        className="mt-[var(--spacing-md)] flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-(--color-line-strong) font-medium text-(--color-ink) text-[length:var(--text-md)]"
      >
        {t("creator.openVideo")} ↗
      </a>
      <div className="mt-[var(--spacing-sm)]">
        <Button
          title={t("concept.saveButton")}
          loading={saving}
          disabled={active === null}
          testId="creator-save"
          onPress={onSave}
        />
      </div>
      <AppText
        variant="label"
        color="textMuted"
        className="mt-[var(--spacing-md)] block"
        data-testid="creator-disclaimer"
      >
        {t("creator.disclaimer", { email: CONTACT })}
      </AppText>
    </SheetShell>
  );
}
