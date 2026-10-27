// @plm SRS-081 SRS-082  가져오기 계산 본체 — 파싱·종목 맞추기·계획(순수 · DB·window 를 만지지 않는다).
//
// Worker(lib/importWorker.entry.ts)와 메인 대체(lib/importWorker.ts)가 같은 함수를 부른다. 이 파일은 Worker 를 만들지 않는다 —
// Worker 진입점이 「Worker 를 만드는 파일」을 가져오면 번들러(Turbopack)가 자기 자신을 가리키는 Worker 청크를 풀다 멈춘다(실측: next build 정지).
// 원본 내용 로그 금지: 파일 본문·종목 이름·메모를 console 에 찍지 않는다. 오류도 코드(문자열 하나)로만 돌려준다.
import { buildExerciseSearchIndex } from "@app/core/domain/exerciseSearch";
import {
  buildImportPlan,
  distinctExerciseNames,
  ImportPlanError,
  matchExerciseNames,
  parseImportFile,
  sha16,
  type ExerciseDecision,
  type ExerciseMatch,
  type ImportFormat,
  type ImportPlan,
  type ImportSourceKind,
  type ImportWeightUnit,
  type ParseFatal,
  type ParseIssue,
} from "@app/core/domain/import/index";
import type { ImportContext } from "@app/core/data/importRepository";

/** 단계 이름 — 진행률 문구의 키 */
export type ImportTaskStage = "hash" | "parse" | "match" | "plan";

export interface ImportTaskProgress {
  stage: ImportTaskStage;
  /** 0~1 — 끝낸 단계 비율(단계 안에서는 나누지 않는다: core 함수는 한 번에 끝난다) */
  ratio: number;
}

export interface AnalyzeRequest {
  kind: "analyze";
  text: string;
  ctx: ImportContext;
}

export interface PlanRequest {
  kind: "plan";
  text: string;
  ctx: ImportContext;
  /** [원본 종목 이름, 결정] — Map 은 구조화 복제가 되지만 순서를 확실히 하려고 배열로 */
  decisions: [string, ExerciseDecision][];
  weightUnit: ImportWeightUnit | null;
  fileLabel: string;
  now: number;
}

export type ImportTaskRequest = AnalyzeRequest | PlanRequest;

/** 표본 한 줄(「벤치프레스 100 × 5」) — 무게는 원본 숫자(단위 변환 전) */
export interface ImportSample {
  sourceName: string;
  weight: number;
  reps: number;
}

export interface AnalyzeResult {
  kind: "analyze";
  /** 파일 내용 해시(sha16) — 맞추기 결정 임시 저장의 키 */
  fileHash: string;
  fatal: ParseFatal | null;
  missingColumns: string[];
  source: ImportSourceKind | null;
  format: ImportFormat | null;
  /** 파일이 밝힌 무게 단위(null = 사용자가 고른다 · Strong 쉼표) */
  fileWeightUnit: ImportWeightUnit | null;
  workouts: number;
  sets: number;
  rowCount: number;
  /** 정규화 현지 시각(가장 이른·늦은 운동) */
  firstLocal: string | null;
  lastLocal: string | null;
  /** 깨진 줄(앞 50개) · 전체 수 */
  issues: ParseIssue[];
  issueCount: number;
  names: string[];
  matches: ExerciseMatch[];
  sample: ImportSample | null;
}

export interface PlanResult {
  kind: "plan";
  plan: ImportPlan;
}

export type ImportTaskResult = AnalyzeResult | PlanResult;

/** 계산 오류 코드 — 원본 내용을 싣지 않는다 */
export type ImportTaskErrorCode = "unit_required" | "unreadable" | "failed";

export class ImportTaskError extends Error {
  constructor(public readonly code: ImportTaskErrorCode) {
    super(`가져오기 계산 실패: ${code}`);
    this.name = "ImportTaskError";
  }
}

const ISSUE_MAX = 50;

function firstSample(parsed: ReturnType<typeof parseImportFile>): ImportSample | null {
  for (const w of parsed.workouts)
    for (const e of w.exercises)
      for (const s of e.sets)
        if (s.kind !== "warmup" && s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0)
          return { sourceName: e.name, weight: s.weight, reps: s.reps };
  return null;
}

/**
 * 계산 본체 — Worker 와 메인 대체가 같이 부른다(순수: DB·window 를 만지지 않는다).
 * @throws ImportTaskError
 */
export function computeImportTask(
  req: ImportTaskRequest,
  onProgress: (p: ImportTaskProgress) => void = () => {},
): ImportTaskResult {
  try {
    if (req.kind === "analyze") {
      onProgress({ stage: "hash", ratio: 0 });
      const fileHash = sha16(req.text);
      onProgress({ stage: "parse", ratio: 0.25 });
      const parsed = parseImportFile(req.text);
      onProgress({ stage: "match", ratio: 0.6 });
      const names = parsed.fatal ? [] : distinctExerciseNames(parsed);
      const matches =
        parsed.source && names.length
          ? matchExerciseNames(parsed.source, names, {
              index: buildExerciseSearchIndex(req.ctx.exercises),
              aliases: new Map(Object.entries(req.ctx.aliases)),
              attachmentsFor: (id) => req.ctx.attachments[id],
            })
          : [];
      let firstLocal: string | null = null;
      let lastLocal: string | null = null;
      for (const w of parsed.workouts) {
        if (firstLocal == null || w.localStart < firstLocal) firstLocal = w.localStart;
        if (lastLocal == null || w.localStart > lastLocal) lastLocal = w.localStart;
      }
      onProgress({ stage: "match", ratio: 1 });
      return {
        kind: "analyze",
        fileHash,
        fatal: parsed.fatal,
        missingColumns: parsed.missingColumns ?? [],
        source: parsed.source,
        format: parsed.format,
        fileWeightUnit: parsed.fileWeightUnit,
        workouts: parsed.workouts.length,
        sets: parsed.setCount,
        rowCount: parsed.rowCount,
        firstLocal,
        lastLocal,
        issues: parsed.issues.slice(0, ISSUE_MAX),
        issueCount: parsed.issues.length,
        names,
        matches,
        sample: firstSample(parsed),
      };
    }
    onProgress({ stage: "parse", ratio: 0 });
    const parsed = parseImportFile(req.text);
    onProgress({ stage: "plan", ratio: 0.4 });
    const plan = buildImportPlan({
      parsed,
      weightUnit: req.weightUnit ?? undefined,
      decisions: new Map(req.decisions),
      exerciseInfo: new Map(Object.entries(req.ctx.exerciseInfo)),
      bodyweightKg: req.ctx.bodyweightKg,
      existingAliases: new Map(Object.entries(req.ctx.aliases)),
      existingIds: new Set(req.ctx.takenWorkoutIds),
      fileLabel: req.fileLabel,
      now: req.now,
    });
    onProgress({ stage: "plan", ratio: 1 });
    return { kind: "plan", plan };
  } catch (e) {
    if (e instanceof ImportPlanError) throw new ImportTaskError(e.code);
    if (e instanceof ImportTaskError) throw e;
    throw new ImportTaskError("failed");
  }
}

// ── Worker 쪽 메시지 ────────────────────────────────────────────────────────
export type WorkerInbound = { id: number; req: ImportTaskRequest };
export type WorkerOutbound =
  | { id: number; type: "progress"; progress: ImportTaskProgress }
  | { id: number; type: "done"; result: ImportTaskResult }
  | { id: number; type: "error"; code: ImportTaskErrorCode };
