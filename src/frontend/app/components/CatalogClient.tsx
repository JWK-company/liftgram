"use client";
// @plm SRS-001  운동 카탈로그 화면 — 로컬 저장소를 읽는다 (ADR-002 · ADR-032)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 화면의 데이터는 **기기의 로컬 저장소**에서 온다. 서버는 그 저장소를 세우고 갱신하는
// 배포 채널일 뿐이다(lib/catalogSync.ts). 그래서 네트워크가 끊겨도 목록·검색·필터가 그대로 돈다.
//
// 목록은 WatermelonDB의 **반응형 쿼리**로 구독한다(app이 쓰던 useQueryData 그대로) —
// 로컬 데이터가 바뀌면(배포 갱신·커스텀 종목 추가) 화면이 알아서 따라온다. 다시 읽는 코드가 없다.
//
// ── 서버 렌더와의 경계 ──────────────────────────────────────────────────────
// 로컬 저장소는 브라우저에만 있으므로 **서버에서 미리 그릴 수 없다.** 그래서
//   · 저장소를 만지는 모듈은 전부 **동적 import**로 클라이언트에서만 불러온다
//     (모듈 최상단에 두면 SSR 시점에 실행돼 터진다)
//   · 첫 페인트에는 목록이 없다 — 그 대가로 오프라인에서도 동작한다
// ─────────────────────────────────────────────────────────────────────────────
import { ExerciseService, WatchCatalogResponse_Kind, routes } from "@app/contracts";
import { useQueryData } from "@app/core/db/hooks";
import { ALL_EQUIPMENT, ALL_MUSCLE_GROUPS } from "@app/core/domain/types";
import type { EquipmentType, MuscleGroup } from "@app/core/domain/types";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getExerciseMedia } from "@app/core/data/exerciseMedia";
import { exerciseAltName, exerciseListName } from "@app/core/domain/exerciseName";
import { t } from "@/lib/i18n";
import { equipmentLabelFromDomain, muscleLabelFromDomain } from "@/lib/labels";
import ExerciseFinderWizard, { type WizardResult } from "./ExerciseFinderWizard";
import { ErrorState } from "./States";
import { useToast } from "./Toast";
import { Chip } from "./ui/Chip";
import { Icon, type IconName } from "./ui/Icon";
import { TextField } from "./ui/inputs";
import { AppText, type ColorKey, EmptyState, Tag } from "./ui/primitives";

/** 저장소가 돌려주는 모델의 화면용 최소 모양 — 여기서 필요한 필드만 읽는다. */
type Row = {
  id: string;
  nameKo: string;
  nameEn: string | null;
  equipment: EquipmentType;
  primaryMuscles: MuscleGroup[];
  kind: string | null;
  isCustom: boolean;
  /** 커스텀 종목이 올린 사진 — 없으면 자세 미디어의 시작 프레임을 쓴다. */
  imageUrl: string | null;
};

type Repo = typeof import("@app/core/data/exerciseRepository");

/** 배포 상태 — 사용자가 "지금 서버와 맞춰져 있나"를 알 수 있게 한다. */
type SyncState = "여는 중" | "받는 중" | "최신" | "오프라인" | "실패";

export default function CatalogClient({ busKind, instance }: { busKind: string; instance: string }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [sync, setSync] = useState<SyncState>("여는 중");
  const [total, setTotal] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<EquipmentType | "">("");
  const [muscle, setMuscle] = useState<MuscleGroup | "">("");
  // 유산소는 부위와 별개 축이다(app과 같다) — 이 칩을 켜면 부위 선택은 풀린다.
  const [kind, setKind] = useState<"cardio" | "">("");
  // 스무고개가 골라 준 동작/자세 종목집합. 있으면 그 종목들로만 좁힌다(SRS-031).
  const [names, setNames] = useState<string[] | null>(null);
  const [finderLabel, setFinderLabel] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const mounted = useRef(false);

  // ── 부팅: 저장소를 열고, 서버 카탈로그와 맞춘다 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mod, { syncCatalogToLocal }] = await Promise.all([
          import("@app/core/data/exerciseRepository"),
          import("@/lib/catalogSync"),
        ]);
        if (cancelled) return;

        setSync("받는 중");
        const r = await syncCatalogToLocal();
        if (cancelled) return;

        // **구독은 배포가 끝난 뒤에 건다.** 저장소가 IndexedDB에서 다 읽히기 전에 쿼리를 만들면
        // 빈 결과를 한 번 받고 그대로 머문다 — 온라인일 때는 배포의 쓰기가 구독을 깨워 가려지지만,
        // 오프라인(쓰기 없음)에서는 목록이 영영 비어 보인다(프로덕션 빌드에서만 재현됐다).
        setRepo(mod);
        setTotal(r.count);
        setSync(r.status === "offline" ? "오프라인" : "최신");
      } catch (e) {
        if (cancelled) return;
        setSync("실패");
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 목록: 로컬 반응형 쿼리 ──
  // 저장소가 준비되기 전에는 null을 돌려준다(훅이 빈 배열을 준다).
  //
  // **검색어를 쿼리에 넣지 않는다.** 웹 어댑터(LokiJS)의 `Q.like`가 한글을 걸러내지 못한다 —
  // 넣으면 전건이 통과해 "검색해도 목록이 안 줄어드는" 상태가 된다(실측으로 다시 밟았다).
  // app도 같은 이유로 기구·부위만 쿼리하고 검색은 JS로 거른다(ExerciseListScreen의 주석 #10).
  const models = useQueryData(
    () =>
      repo
        ? repo.queryExercises({
            equipment: equipment || null,
            muscle: muscle || null,
            kind: kind || null,
          })
        : null,
    [repo, equipment, muscle, kind],
  );

  const rows: Row[] = useMemo(() => {
    const list = models.map((m) => {
      const r = m as unknown as Row;
      return {
        id: r.id,
        nameKo: r.nameKo,
        nameEn: r.nameEn,
        equipment: r.equipment,
        primaryMuscles: r.primaryMuscles,
        kind: r.kind,
        isCustom: r.isCustom,
        imageUrl: r.imageUrl,
      };
    });
    // 스무고개가 종목집합을 줬으면 부위 쿼리 결과 위에 교집합을 취한다(app과 같은 순서).
    const narrowed = names ? list.filter((e) => new Set(names).has(e.nameKo)) : list;
    // 검색은 여기서 — 대소문자 무시 부분일치(한글 이름 · 영문 이름). app과 같은 규칙이다.
    const q = query.trim().toLowerCase();
    if (!q) return narrowed;
    return narrowed.filter(
      (e) => e.nameKo.toLowerCase().includes(q) || (e.nameEn ?? "").toLowerCase().includes(q),
    );
  }, [models, query, names]);

  // ── 서버가 카탈로그를 바꾸면 다시 받는다 ──
  // 값이 아니라 "바뀌었다"는 사실만 온다(개정 번호). 받는 쪽이 배포를 다시 돌린다.
  const resync = useCallback(async () => {
    const { syncCatalogToLocal } = await import("@/lib/catalogSync");
    const r = await syncCatalogToLocal();
    setTotal(r.count);
    setSync(r.status === "offline" ? "오프라인" : "최신");
    if (mounted.current && r.status === "synced") toast("카탈로그가 갱신됐습니다");
  }, [toast]);

  useEffect(() => {
    const api = createClient(ExerciseService, createConnectTransport({ baseUrl: routes.apiPrefix }));
    const ctrl = new AbortController();
    (async () => {
      try {
        for await (const msg of api.watchCatalog({}, { signal: ctrl.signal })) {
          if (msg.kind === WatchCatalogResponse_Kind.DELTA) void resync();
        }
      } catch {
        // 서버가 없거나 끊겼다 — 로컬은 그대로 쓰면 되므로 화면을 죽이지 않는다.
      }
    })();
    return () => ctrl.abort();
  }, [resync]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  // 화면이 사라질 때 로컬 저장소를 디스크로 내려쓴다 — 기록한 직후 탭을 닫아도 잃지 않게(SRS-006).
  useEffect(() => {
    let stop: (() => void) | undefined;
    void import("@/lib/localDb").then((m) => {
      stop = m.flushOnHide();
    });
    return () => stop?.();
  }, []);

  // ── 화면 ── app의 ExerciseListScreen과 같은 뼈대다: 검색 → 부위/기구 칩 → 카드 목록.
  const TONE: Record<SyncState, { color: ColorKey; icon: IconName }> = {
    "여는 중": { color: "textFaint", icon: "hourglass-outline" },
    "받는 중": { color: "warning", icon: "cloud-download-outline" },
    최신: { color: "success", icon: "cloud-done-outline" },
    오프라인: { color: "warning", icon: "cloud-offline-outline" },
    실패: { color: "danger", icon: "alert-circle-outline" },
  };
  const hasFilter = equipment !== "" || muscle !== "" || kind !== "" || names !== null;
  const clearFilters = () => {
    setEquipment("");
    setMuscle("");
    setKind("");
    setNames(null);
    setFinderLabel(null);
  };

  // 스무고개 결과를 그대로 필터로 옮긴다 — 검색어는 지운다(app과 같다).
  const onWizardDone = (r: WizardResult) => {
    setMuscle(r.muscle ?? "");
    setEquipment(r.equipment ?? "");
    setKind(r.kind === "cardio" ? "cardio" : "");
    setNames(r.names);
    setFinderLabel(r.names || r.muscle || r.kind ? r.label : null);
    setQuery("");
    setWizardOpen(false);
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)]">
      <TextField
        testId="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("exercises.searchPlaceholder")}
        className="mb-0!"
      />

      {/* 스무고개 — 이름을 몰라도 부위→동작/기구로 좁힌다(SRS-031). app과 같은 자리·같은 모양. */}
      <div className="flex items-center">
        <button
          type="button"
          data-testid="btn-wizard"
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-[4px] rounded-[var(--radius-pill)] border border-(--color-brand) bg-(--color-brand-muted) px-[var(--spacing-sm)] py-[var(--spacing-xs)]"
        >
          <Icon name="compass-outline" size={16} color="var(--color-brand)" />
          <AppText variant="caption" color="primary" className="font-bold">
            {t("wizard.open")}
          </AppText>
        </button>

        {hasFilter ? (
          <button
            type="button"
            data-testid="filter-reset"
            onClick={clearFilters}
            className="ml-[var(--spacing-md)] flex items-center gap-[3px] py-[var(--spacing-xs)]"
          >
            <Icon name="close-circle" size={14} color="var(--color-ink2)" />
            <AppText variant="caption" color="textMuted">
              {t("wizard.reset")}
            </AppText>
          </button>
        ) : null}
      </div>

      {/* 스무고개로 들어온 경로를 알려 주는 배너(예: '가슴 · 평평하게 밀기'). */}
      {finderLabel ? (
        <div className="flex items-center gap-[4px]">
          <Icon name={kind === "cardio" ? "heart" : "funnel"} size={13} color="var(--color-brand)" />
          <AppText variant="caption" color="primary" className="truncate">
            {t("wizard.finderActive", { path: finderLabel })}
          </AppText>
        </div>
      ) : null}

      <FilterRow label={t("exercises.muscleFilter")}>
        {ALL_MUSCLE_GROUPS.map((m) => (
          <Chip
            key={m}
            testId={`chip-muscle-${m}`}
            label={muscleLabelFromDomain(m)}
            active={muscle === m && kind !== "cardio"}
            onPress={() => {
              setNames(null);
              setFinderLabel(null);
              setKind("");
              setMuscle((prev) => (prev === m ? "" : m));
            }}
          />
        ))}
        {/* 유산소는 부위와 별개 축이다 — 근육 라벨(전신 등)이 헷갈려 app이 따로 뽑아 둔 칩이다. */}
        <Chip
          testId="chip-kind-cardio"
          label="유산소"
          active={kind === "cardio"}
          onPress={() => {
            setNames(null);
            setFinderLabel(null);
            setMuscle("");
            setKind((prev) => (prev === "cardio" ? "" : "cardio"));
          }}
        />
      </FilterRow>

      <FilterRow label={t("exercises.equipmentFilter")}>
        {ALL_EQUIPMENT.map((e) => (
          <Chip
            key={e}
            testId={`chip-equipment-${e}`}
            label={equipmentLabelFromDomain(e)}
            active={equipment === e}
            onPress={() => {
              setNames(null);
              setFinderLabel(null);
              setEquipment((prev) => (prev === e ? "" : e));
            }}
          />
        ))}
      </FilterRow>

      {err ? <ErrorState message={err} onRetry={() => setErr(null)} /> : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={repo ? t("exercises.emptyTitle") : "카탈로그를 여는 중입니다"}
          message={repo ? t("exercises.emptyMessage") : "잠시만 기다려 주세요"}
        />
      ) : (
        <ul
          data-testid="exercise-list"
          className="mt-[var(--spacing-xs)] flex flex-col gap-[var(--spacing-sm)]"
        >
          {rows.map((r) => (
            <ExerciseRow key={r.id} row={r} />
          ))}
        </ul>
      )}

      {/* 스택 진단용 각주 — 배포 상태·전파 방식·응답한 인스턴스. app에는 없는 줄이라
          화면 흐름 밖(맨 아래)에 작게 둔다. 로컬 카탈로그가 서버와 맞는지 눈으로 확인하는 자리다. */}
      <div className="mt-[var(--spacing-lg)] flex flex-wrap items-center gap-[var(--spacing-xs)]">
        <Icon name={TONE[sync].icon} size={12} color={`var(--color-${sync === "최신" ? "ok" : "ink3"})`} />
        <AppText variant="caption" color={TONE[sync].color} data-testid="sync-state">
          {sync}
        </AppText>
        <AppText variant="caption" color="textFaint">
          · 로컬 <span data-testid="catalog-count">{total ?? "—"}</span>종 · bus{" "}
          <span data-testid="bus-kind">{busKind}</span> · instance{" "}
          <span data-testid="instance-id">{instance}</span>
        </AppText>
      </div>

      <ExerciseFinderWizard visible={wizardOpen} onClose={() => setWizardOpen(false)} onDone={onWizardDone} />
    </div>
  );
}

/** 라벨 + 가로 스크롤 칩 줄 — app의 FilterRow와 같다. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[var(--spacing-xs)]">
      <AppText variant="label" color="textFaint">
        {label}
      </AppText>
      <div className="no-scrollbar flex gap-[var(--spacing-sm)] overflow-x-auto py-[2px]">{children}</div>
    </div>
  );
}

/**
 * 목록 한 줄 — 썸네일 · 이름 · 대체이름 · 태그 · chevron.
 *
 * 이름과 태그 규칙은 전부 도메인에서 온다(app과 같은 함수): 목록 이름은 기구가 이름에
 * 이미 있으면 중복을 빼고, 유산소는 근육 대신 '유산소' 태그를 단다.
 */
function ExerciseRow({ row }: { row: Row }) {
  const item = { nameKo: row.nameKo, nameEn: row.nameEn, equipment: row.equipment };
  const altName = exerciseAltName(item);
  const thumb = row.imageUrl || getExerciseMedia(row.nameKo)?.start || null;

  return (
    <li className="relative">
      {/* 내가 만든 종목은 **로컬에만** 있어 서버가 렌더하는 상세(/exercise/…)가 404다.
          그래서 고치기 진입을 목록 행에 둔다 — 만든 사람이 곧바로 손볼 수 있는 유일한 자리다. */}
      {row.isCustom ? (
        <a
          href={`/exercises/${encodeURIComponent(row.id)}/edit`}
          data-testid={`edit-${row.id}`}
          aria-label={t("common.edit")}
          className="absolute top-[var(--spacing-md)] right-[var(--spacing-md)] z-10 flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt)"
        >
          <Icon name="create-outline" size={16} color="var(--color-ink2)" />
        </a>
      ) : null}
      <a
        href={routes.exercise(row.id)}
        data-testid={`exercise-${row.id}`}
        className="flex items-center gap-[var(--spacing-md)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)] hover:opacity-80"
      >
        {thumb ? (
          // eslint 규칙이 아니라 의도다 — CDN 원본을 그대로 쓴다(next/image 최적화 서버 불필요).
          // biome-ignore lint/performance/noImgElement: 외부 CDN 썸네일 40px — 최적화 파이프라인이 필요 없다
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
            <Icon name="barbell-outline" size={18} color="var(--color-ink3)" />
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col">
          <AppText variant="heading" className="truncate">
            {exerciseListName(item)}
          </AppText>
          {altName ? (
            <AppText variant="caption" color="textFaint" className="mt-[2px] truncate">
              {altName}
            </AppText>
          ) : null}
          <span className="mt-[var(--spacing-sm)] flex flex-wrap gap-[var(--spacing-xs)]">
            {row.kind === "cardio" ? (
              <Tag label={t("wizard.cardio")} tone="success" />
            ) : (
              row.primaryMuscles.map((m) => <Tag key={m} label={muscleLabelFromDomain(m)} tone="primary" />)
            )}
            <Tag label={equipmentLabelFromDomain(row.equipment)} />
            {row.isCustom ? <Tag label={t("exercises.customTag")} tone="muted" /> : null}
          </span>
        </span>

        <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
      </a>
    </li>
  );
}
