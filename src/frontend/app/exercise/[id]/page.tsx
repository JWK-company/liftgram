// @plm SRS-001  종목 상세 — 결정적 딥링크(`/exercise/seed-<슬러그>`)
//
// 경로 규칙을 app/(Expo Web)과 **같게** 둔다. 이행 기간에 두 구현이 같은 링크를 이해해야
// 공유된 URL이 어느 쪽에서도 열린다.
//
// 대체운동은 id만 저장돼 있어 이름을 알려면 각각 읽어야 한다. 다섯 개 남짓이라
// 병렬로 부르는 편이 목록 API에 필터를 하나 더 만드는 것보다 단순하다 —
// 개수가 늘면 그때 계약에 BatchGet을 더한다.
import { cache } from "react";
import { notFound } from "next/navigation";
import { Code, ConnectError, type Client } from "@connectrpc/connect";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ExerciseKind, type ExerciseService, LoadMode, routes } from "@app/contracts";
import { EXERCISE_MEDIA_CREDIT, getExerciseMedia, hasMediaImages } from "@app/core/data/exerciseMedia";
import { exerciseAltName, exerciseListName } from "@app/core/domain/exerciseName";
import { exerciseClient } from "@/lib/api";
import { EQUIPMENT_KEY } from "@/lib/contractMap";
import { t } from "@/lib/i18n";
import { equipmentLabel, kindLabel, loadModeLabel, muscleLabel } from "@/lib/labels";
import ExerciseAnimation from "../../components/ExerciseAnimation";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { Icon } from "../../components/ui/Icon";
import { AppText, Card, Divider, SectionHeader, Tag } from "../../components/ui/primitives";

export const dynamic = "force-dynamic";

type Api = Client<typeof ExerciseService>;

/** 없는 종목은 null이다. 그 밖의 실패는 삼키지 않는다 — 장애를 404로 위장하면 원인을 못 찾는다. */
async function fetchExercise(api: Api, id: string) {
  try {
    const res = await api.getExercise({ id });
    return res.exercise ?? null;
  } catch (e) {
    if (e instanceof ConnectError && e.code === Code.NotFound) return null;
    throw e;
  }
}

// 한 요청 안에서 같은 종목을 두 번 읽지 않는다 — generateMetadata와 페이지가 같은 결과를 공유한다.
const loadExercise = cache((id: string) => fetchExercise(exerciseClient(), id));

/**
 * 공유된 링크의 제목을 종목 이름으로 만든다.
 *
 * ── 이 라우트 위에 Suspense 경계를 두지 말 것 ───────────────────────────────
 * 이 경로 위(상위 세그먼트 어디든)에 loading.tsx가 있으면 본문이 **스트리밍으로** 나가고,
 * 그 시점엔 응답 헤더가 이미 확정돼 notFound()가 상태 코드를 바꾸지 못한다.
 * 실측: 루트에 loading.tsx가 있을 때 없는 종목이 **200에 404 화면**으로 나갔고, 지우니 404가 됐다.
 * generateMetadata에서 걸러도 마찬가지였다 — 경계 자체가 원인이다.
 * 종목 상세는 밖으로 공유되는 URL이라 상태 코드가 정확해야 해서, 로딩 스켈레톤을 포기했다.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await loadExercise(id);
  if (!exercise) notFound();
  return { title: `${exercise.nameKo} — Liftgram` };
}

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = exerciseClient();

  // 링크가 낡았을 뿐 서비스는 멀쩡하다 — 오류 화면이 아니라 404다(위 generateMetadata가 상태를 붙인다).
  const exercise = await loadExercise(id);
  if (!exercise) notFound();

  // 대체운동 이름 — 하나가 사라져도 나머지는 보여야 하므로 실패를 개별로 삼킨다.
  const substitutes = (
    await Promise.all(
      exercise.substituteIds.map(async (sid) => {
        const sub = await fetchExercise(api, sid).catch(() => null);
        if (!sub) return null;
        const named = {
          nameKo: sub.nameKo,
          nameEn: sub.nameEn || null,
          equipment: EQUIPMENT_KEY[sub.equipment] ?? "barbell",
        };
        // 목록 이름 규칙(기구 중복 제거)을 여기서도 쓴다 — 카탈로그와 같은 낱말이 보이도록.
        return {
          id: sid,
          nameKo: exerciseListName(named),
          equipmentLabel: equipmentLabel(sub.equipment),
        };
      }),
    )
  ).filter((x): x is { id: string; nameKo: string; equipmentLabel: string } => x !== null);

  const updated = exercise.updatedAt ? timestampDate(exercise.updatedAt) : null;

  // 이름 규칙은 도메인이 정한다 — 기구가 이름에 이미 들어 있으면 목록 이름에서 빼는 등(app과 같다).
  const named = {
    nameKo: exercise.nameKo,
    nameEn: exercise.nameEn || null,
    equipment: EQUIPMENT_KEY[exercise.equipment] ?? "barbell",
  };
  const altName = exerciseAltName(named);

  // 자세 미디어(2컷·설명)는 정적 매핑이다 — 네트워크 없이 이름으로 찾는다(SRS-032).
  const media = getExerciseMedia(exercise.nameKo);
  const instructions = media
    ? media.instructionsKo.length
      ? media.instructionsKo
      : media.instructionsEn
    : [];

  return (
    <>
      <ScreenHeader
        title={t("nav.exerciseDetail")}
        back={
          <a
            href="/exercises"
            aria-label="뒤로"
            className="-ml-[var(--spacing-sm)] flex h-9 w-9 items-center justify-center"
          >
            <Icon name="chevron-back" size={22} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex flex-1 flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg)]">
        <div className="flex items-start gap-[var(--spacing-sm)]">
          <AppText variant="title" className="flex-1" data-testid="exercise-name">
            {exerciseListName(named)}
          </AppText>
          {exercise.isCustom ? <Tag label={t("exercises.customTag")} tone="muted" /> : null}
        </div>
        {altName ? (
          <AppText variant="body" color="textFaint" className="-mt-[var(--spacing-sm)]">
            {altName}
          </AppText>
        ) : null}

        {/* 자세 시연 — 2컷 교차 또는 3D 움짤. 이미지가 없는 종목(설명만 있는 항목)은 건너뛴다. */}
        {media && hasMediaImages(media) ? (
          <>
            <ExerciseAnimation start={media.start} end={media.end} gif={media.gif} />
            <AppText variant="caption" color="textFaint" center>
              {t("exercises.mediaCredit", { credit: EXERCISE_MEDIA_CREDIT })}
            </AppText>
          </>
        ) : null}

        {instructions.length ? (
          <Card>
            <SectionHeader title={t("exercises.formGuideTitle")} />
            <ol className="flex flex-col gap-[var(--spacing-sm)]">
              {instructions.map((step, i) => (
                <li key={step} className="flex gap-[var(--spacing-sm)]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-(--color-surface-alt)">
                    <AppText variant="caption" color="primary" className="font-bold">
                      {String(i + 1)}
                    </AppText>
                  </span>
                  <AppText variant="body" color="textMuted" className="flex-1">
                    {step}
                  </AppText>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {/* 분류 — 주동근·보조근·기구. app과 같은 태그 톤을 쓴다(주동근만 primary). */}
        <Card>
          <AppText variant="label" color="textMuted">
            {t("exercises.primaryMuscles")}
          </AppText>
          <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[var(--spacing-xs)]">
            {exercise.primaryMuscles.length ? (
              exercise.primaryMuscles.map((m) => <Tag key={m} label={muscleLabel(m)} tone="primary" />)
            ) : (
              <AppText variant="caption" color="textFaint">
                {t("common.none")}
              </AppText>
            )}
          </div>

          {exercise.secondaryMuscles.length ? (
            <>
              <div className="mt-[var(--spacing-md)]">
                <AppText variant="label" color="textMuted">
                  {t("exercises.secondaryMuscles")}
                </AppText>
              </div>
              <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[var(--spacing-xs)]">
                {exercise.secondaryMuscles.map((m) => (
                  <Tag key={m} label={muscleLabel(m)} />
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-[var(--spacing-md)]">
            <AppText variant="label" color="textMuted">
              {t("exercises.equipment")}
            </AppText>
          </div>
          <div className="mt-[var(--spacing-sm)] flex flex-wrap items-center gap-[var(--spacing-xs)]">
            <Tag label={equipmentLabel(exercise.equipment)} />
            {exercise.kind === ExerciseKind.CARDIO ? (
              <Tag label={kindLabel(exercise.kind)} tone="success" />
            ) : null}
            {/* 하중 모드는 기본값(외부하중)일 때 보여 주지 않는다 — 336종 중 3종만 다르다. */}
            {exercise.loadMode !== LoadMode.EXTERNAL && exercise.loadMode !== LoadMode.UNSPECIFIED ? (
              <span data-testid="load-mode">
                <Tag label={loadModeLabel(exercise.loadMode)} tone="warning" />
              </span>
            ) : null}
          </div>
        </Card>

        {/* 대체 운동 — 기구가 없거나 자리가 찼을 때 바꿔 할 종목. */}
        <Card>
          <SectionHeader title={t("exercises.substitutesTitle")} />
          {substitutes.length === 0 ? (
            <AppText variant="caption" color="textFaint">
              {t("exercises.noSubstitutes")}
            </AppText>
          ) : (
            <ul data-testid="substitutes">
              {substitutes.map((sub, i) => (
                <li key={sub.id}>
                  {i > 0 ? <Divider /> : null}
                  <a
                    href={routes.exercise(sub.id)}
                    className="flex items-center gap-[var(--spacing-sm)] py-[var(--spacing-sm)] hover:opacity-70"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <AppText variant="body" className="truncate" data-testid="sub-name">
                        {sub.nameKo}
                      </AppText>
                      <AppText variant="caption" color="textFaint" className="mt-[2px] truncate">
                        {sub.equipmentLabel}
                      </AppText>
                    </span>
                    <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AppText variant="caption" color="textFaint">
          {exercise.id}
          {exercise.isCustom ? " · 내가 만든 종목" : " · 기본 카탈로그"}
          {updated ? ` · 갱신 ${updated.toLocaleDateString("ko-KR")}` : ""}
        </AppText>
      </div>
    </>
  );
}
