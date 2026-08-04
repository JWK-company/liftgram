"use client";
// @plm SRS-007  오운완 공유 — 마친 운동을 피드에 올린다
//
// ─────────────────────────────────────────────────────────────────────────────
// 피드의 오운완 카드는 **여기서만** 만들어진다. 카드를 그리는 코드는 진작 있었지만
// 만드는 길이 없어, 웹에서는 남의 오운완을 볼 수만 있고 내 것을 올릴 수 없었다.
//
// ── 무엇을 싣나 ─────────────────────────────────────────────────────────────
// 요약 숫자(볼륨·시간·세트·PR·스트릭)와 **종목·세트까지** 함께 싣는다. 보는 사람이 카드를
// 펼쳐 무엇을 어떻게 했는지 볼 수 있어야 "오운완"이 자랑이 아니라 기록이 된다.
// 무게는 **kg 원본 그대로** 보낸다 — 보는 사람이 자기 단위로 읽는다.
//
// ── 한마디를 비워 두면 우리가 적는다 ────────────────────────────────────────
// 빈 글로 올라간 오운완은 피드에서 읽히지 않는다. 그렇다고 쓰라고 막으면 안 쓰고 만다 —
// 그래서 비면 요약을 문장으로 만들어 넣는다(app과 같은 구성).
//
// ── 로그인하지 않았으면 조용히 실패하지 않는다 ──────────────────────────────
// 기록은 계정 없이도 남는다(그게 이 앱의 전제다). 공유만 계정이 필요하니 그 사실을 말한다.
// ─────────────────────────────────────────────────────────────────────────────
import { formatWeight, type WeightUnit } from "@app/core";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/inputs";
import { AppText } from "../ui/primitives";

/** 공유에 실을 운동 한 벌. `completeWorkout`이 돌려준 요약에서 만든다. */
export interface ShareablePayload {
  workoutId: string;
  workoutName: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  streakDays: number;
  exercises: {
    name: string;
    sets: { weightKg: number; reps: number }[];
    note?: string;
  }[];
}

/** 요약 화면이 보여 주는 종목 한 줄 — 몇 세트·얼마나·최고 추정 1RM. */
export interface BreakdownRow {
  id: string;
  name: string;
  setCount: number;
  volumeKg: number;
  best1RM: number;
}

/**
 * 요약(볼륨·PR)에 **종목·세트와 연속일수**를 붙인다.
 *
 * **한 번만 읽는다** — 공유용과 화면용을 따로 읽으면 같은 질의가 두 번 돈다.
 * 실패하면 숫자만이라도 남긴다(분해는 비고, 공유는 요약만 실린다).
 */
export async function loadSummaryExtras(summary: {
  workoutId: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
}): Promise<{ share: ShareablePayload; breakdown: BreakdownRow[] }> {
  const base: ShareablePayload = {
    ...summary,
    workoutName: "",
    streakDays: 0,
    exercises: [],
  };
  try {
    const analytics = await import("@app/core/data/analyticsRepository");
    const { computeStreak } = await import("@app/core");
    const [detail, dayNums] = await Promise.all([
      analytics.getWorkoutDetail(summary.workoutId),
      analytics.getCompletedDayNumsSince(400),
    ]);
    const streak = computeStreak([...dayNums], Date.now());
    return {
      share: {
        ...base,
        workoutName: detail.workout?.name ?? "",
        streakDays: streak.current,
        exercises: detail.exercises.map((ex) => ({
          name: ex.exerciseName,
          note: ex.note ?? undefined,
          // 워밍업·실패 세트는 빼고 보낸다 — 카드에 실리는 것은 실제로 해낸 세트다.
          sets: ex.sets
            .filter((st) => !st.isWarmup && !st.isFailed)
            .map((st) => ({ weightKg: st.weightKg, reps: st.reps })),
        })),
      },
      breakdown: detail.exercises.map((ex) => ({
        id: ex.workoutExerciseId,
        name: ex.exerciseName,
        setCount: ex.sets.length,
        volumeKg: ex.volumeKg,
        best1RM: ex.bestEstimated1RM,
      })),
    };
  } catch {
    return { share: base, breakdown: [] };
  }
}

export function ShareWorkout({ payload, unit }: { payload: ShareablePayload; unit: WeightUnit }) {
  const { user } = useAuth();
  const toast = useToast();
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  /** 한마디를 비워 뒀을 때 대신 들어갈 문장 — app과 같은 구성이다. */
  function autoCaption(): string {
    return [
      t("session.workoutComplete"),
      payload.workoutName || undefined,
      `${t("session.totalVolume")} ${formatWeight(payload.totalVolumeKg, unit)}`,
      payload.prCount > 0 ? t("session.prCount", { count: payload.prCount }) : undefined,
      payload.streakDays > 0 ? t("session.streakDays", { count: payload.streakDays }) : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function share() {
    if (sharing || shared) return;
    if (!user) {
      toast(t("session.shareLoginRequired"), "error");
      return;
    }
    setSharing(true);
    try {
      await feedClient().createPost({
        caption: caption.trim() || autoCaption(),
        workout: {
          workoutId: payload.workoutId,
          workoutName: payload.workoutName,
          totalVolumeKg: payload.totalVolumeKg,
          durationSeconds: payload.durationSeconds,
          workingSets: payload.workingSets,
          prCount: payload.prCount,
          streakDays: payload.streakDays,
          exercises: payload.exercises.map((ex) => ({
            name: ex.name,
            note: ex.note ?? "",
            sets: ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
          })),
        },
      });
      // 한 번 올린 운동을 또 올리면 피드에 같은 카드가 둘 남는다.
      setShared(true);
      toast(t("session.sharedToFeed"));
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="mt-[var(--spacing-lg)]" data-testid="share-workout">
      <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block">
        {t("session.shareToFeed")}
      </AppText>
      <TextArea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={t("session.shareCaptionPlaceholder")}
        rows={2}
        maxLength={300}
        disabled={shared}
        testId="share-caption"
      />
      <Button
        title={shared ? t("session.sharedToFeed") : t("session.shareToFeed")}
        icon="share-social-outline"
        variant="secondary"
        loading={sharing}
        disabled={shared}
        onPress={() => void share()}
        testId="btn-share-workout"
      />
    </div>
  );
}
