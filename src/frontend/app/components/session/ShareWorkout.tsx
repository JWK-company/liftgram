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
import { toCreatePostWorkout } from "@app/core/domain/sharePayload";
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
    /** 종목 id — 가져가는 쪽이 이름보다 먼저 찾는다(/qa code H-2) */
    exerciseId?: string;
    /** loadMultiplier = 플레이트 한쪽 입력 배수(null=1) — weightKg 는 적은 그대로(/qa code L-5) */
    sets: { weightKg: number; reps: number; loadMultiplier?: number | null }[];
    note?: string;
  }[];
}

/** 요약 화면이 보여 주는 종목 한 줄 — 몇 세트·얼마나·최고 추정 1RM. */
export interface BreakdownRow {
  id: string;
  /** 종목 id — 요약이 그 종목의 PR 수를 줄 오른쪽에 붙인다(D5) @plm SRS-070 */
  exerciseId: string;
  name: string;
  setCount: number;
  volumeKg: number;
  best1RM: number;
  /** 그 블록에 적은 단위 — 1RM 을 이 단위로 보인다(F5) @plm SRS-070 */
  weightUnit: "kg" | "lb";
  /** 기록 칸 키(null=기본) — PR 은 (종목 × 칸) 버킷이라 요약 줄도 이 키로 짝짓는다(P2 /qa code H-1) */
  variantKey: string | null;
  /** 기록 칸 이름(브랜드·적재·부착물·그립) — 같은 종목 두 줄을 구분한다. 기본 칸·유산소면 null */
  slotLabel: string | null;
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
    const [detail, dayNums, user] = await Promise.all([
      analytics.getWorkoutDetail(summary.workoutId),
      analytics.getCompletedDayNumsSince(400),
      import("@app/core/data/userRepository").then((u) => u.getOrCreateLocalUser()).catch(() => null),
    ]);
    // 칸 이름(브랜드·커스텀 슬롯) — 기록 상세와 같은 라벨(P2 /qa code H-1)
    const { variantLabelFromKey } = await import("@app/core/domain/variants");
    const u = user as unknown as { preferredLanguage?: "ko" | "en"; machineVariantLabels?: string[] } | null;
    const lang = u?.preferredLanguage ?? "ko";
    const slotLabels = u?.machineVariantLabels ?? [];
    const streak = computeStreak([...dayNums], Date.now());
    // [원본] 공유 데이터를 여기서 바로 만들었다 — 운동 총평(SRS-064)이 생기면서 「무엇을 싣지 않는가」를 테스트로 고정하려고
    // core 순수 함수로 옮겼다(QA R5). 원복 시 아래 주석을 풀고 buildSharedWorkout 호출을 지운다.
    // share: {
    //   ...base,
    //   workoutName: detail.workout?.name ?? "",
    //   streakDays: streak.current,
    //   exercises: detail.exercises.map((ex) => ({
    //     name: ex.exerciseName,
    //     exerciseId: ex.exerciseId,
    //     note: ex.note ?? undefined,
    //     sets: ex.sets
    //       .filter((st) => !st.isWarmup && !st.isFailed)
    //       .map((st) => ({ weightKg: st.weightKg, reps: st.reps, loadMultiplier: st.loadMultiplier })),
    //   })),
    // },
    const { buildSharedWorkout } = await import("@app/core/domain/sharePayload");
    return {
      // [개선] 고정된 키만 싣는다 — 운동 총평(notes)은 나만 본다 @plm SRS-064
      share: buildSharedWorkout({
        summary,
        workoutName: detail.workout?.name ?? "",
        streakDays: streak.current,
        exercises: detail.exercises,
      }),
      breakdown: detail.exercises.map((ex) => ({
        id: ex.workoutExerciseId,
        exerciseId: ex.exerciseId,
        name: ex.exerciseName,
        setCount: ex.sets.length,
        volumeKg: ex.volumeKg,
        best1RM: ex.bestEstimated1RM,
        weightUnit: ex.weightUnit === "lb" ? "lb" : "kg",
        variantKey: ex.variantKey ?? null,
        slotLabel:
          !ex.isCardio && ex.variantKey ? variantLabelFromKey(ex.variantKey, lang, slotLabels) || null : null,
      })),
    };
  } catch {
    return { share: base, breakdown: [] };
  }
}

export function ShareWorkout({
  payload,
  unit,
  inSheet = false,
  shared: sharedProp,
  onShared,
  onBusyChange,
  caption: captionProp,
  onCaptionChange,
}: {
  payload: ShareablePayload;
  unit: WeightUnit;
  /** 공유 시트 안 — 시트 제목이 같은 말이라 위 라벨을 뺀다(D5) @plm SRS-070 */
  inSheet?: boolean;
  /** 올렸는지를 부르는 쪽이 들고 있다 — 시트를 닫았다 열어도 두 번 올리지 않게 @plm SRS-070 */
  shared?: boolean;
  onShared?: () => void;
  /** 올리는 중인지를 부르는 쪽에 알린다 — 시트를 닫았다 다시 열어 두 번 올리지 않게(P2 /qa code M-1) */
  onBusyChange?: (busy: boolean) => void;
  /** 한마디를 부르는 쪽이 들고 있다 — 시트를 닫아도 적던 글이 남는다(P2 /qa code L-1) */
  caption?: string;
  onCaptionChange?: (v: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [captionLocal, setCaptionLocal] = useState("");
  const caption = captionProp ?? captionLocal;
  const setCaption = (v: string) => (onCaptionChange ? onCaptionChange(v) : setCaptionLocal(v));
  const [sharing, setSharingState] = useState(false);
  const setSharing = (v: boolean) => {
    setSharingState(v);
    onBusyChange?.(v);
  };
  const [sharedLocal, setShared] = useState(false);
  const shared = sharedProp || sharedLocal;

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
        // 보내는 객체는 core 순수 함수 하나가 만든다 — 총평(notes)이 새지 않음을 테스트가 이 경로에서 지킨다(QA M-4)
        workout: toCreatePostWorkout(payload),
      });
      // 한 번 올린 운동을 또 올리면 피드에 같은 카드가 둘 남는다.
      setShared(true);
      onShared?.();
      toast(t("session.sharedToFeed"));
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      className={inSheet ? "mt-[var(--spacing-md)]" : "mt-[var(--spacing-lg)]"}
      data-testid="share-workout"
    >
      {inSheet ? null : (
        <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block">
          {t("session.shareToFeed")}
        </AppText>
      )}
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
