// @plm SRS-077 SRS-078  체중 이력 저장소 — 측정 한 번이 한 줄. 미러(user_profiles.bodyweight_kg)를 맞추는 쓰기는 이 파일 한 곳(D-10).
//
// 미러 규칙(판정은 domain/bodyweight 순수 함수):
//   · 이력 쓰기(추가·수정·삭제) **같은 write 안에서** 미러 = 남은 이력의 최신 측정값(하나도 없으면 null — U-9).
//   · 동기 뒤·백업 가져오기 뒤·부팅 때 reconcileBodyweightMirror() 가 멱등으로 다시 맞춘다(다른 기기 이력 pull · 옛 경로 수정 흡수 ·
//     첫 정리 때 프로필 값 옮겨 심기 `bw-init-<profileId>`).
//   · 미러를 쓰는 프로필은 읽기(getUserBodyweightKg·getOrCreateLocalUser)와 같은 「가장 오래된 프로필」.
//   · 프로필을 **만들 수 있는** getOrCreateLocalUser 는 자기 write 를 연다 — 반드시 write 밖에서 먼저 확보한다(교착 방지 · D-8).
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { BodyweightLog, UserProfile } from '../db/models';
import type { BodyweightSource } from '../db/models/BodyweightLog';
import {
  isValidBodyweightKg,
  mirrorAfterLogWrite,
  planBodyweightMirror,
  type BodyweightLogLike,
  type MirrorPlan,
} from '../domain/bodyweight';
import { toKg } from '../domain/units';
import type { WeightUnit } from '../domain/types';
import { getOrCreateLocalUser } from './userRepository';
import { isLocalPullComplete, scheduleSync } from '../sync/syncEngine';

const TABLE = 'bodyweight_logs';
const logs = () => database.get<BodyweightLog>(TABLE);
const profiles = () => database.get<UserProfile>('user_profiles');

/** 모델 → 순수 함수 입력 */
export function toBodyweightLogLike(l: BodyweightLog): BodyweightLogLike {
  const raw = l._raw as unknown as Record<string, unknown>;
  return {
    id: l.id,
    measuredAt: (raw.measured_at as number | null | undefined) ?? null,
    weightKg: (raw.weight_kg as number | null | undefined) ?? null,
    updatedAt: Number(raw.updated_at ?? raw.created_at ?? 0) || 0,
    source: (raw.source as BodyweightSource | null | undefined) ?? null,
  };
}

/** 읽기와 같은 「가장 오래된 프로필」 — **만들지 않는다**(없으면 null). write 안에서도 불러도 된다. */
async function oldestProfile(): Promise<UserProfile | null> {
  const [u] = await profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
  return u ?? null;
}

function profileUpdatedAt(u: UserProfile): number {
  const raw = u._raw as unknown as Record<string, unknown>;
  return Number(raw.updated_at ?? raw.created_at ?? 0) || 0;
}

/** write 안에서: 남은 이력으로 미러를 맞춘다(값이 같으면 쓰지 않는다). */
async function applyMirrorInWrite(profile: UserProfile | null): Promise<number | null> {
  const all = (await logs().query().fetch()).map(toBodyweightLogLike);
  const next = mirrorAfterLogWrite(all);
  if (profile && (profile.bodyweightKg ?? null) !== next) {
    await profile.update((p) => {
      p.bodyweightKg = next;
    });
  }
  return next;
}

// ── 읽기 ────────────────────────────────────────────────────────────────

export interface BodyweightRange {
  /** 이 시각(포함) 이후 측정 — 미지정이면 처음부터 */
  startMs?: number;
  /** 이 시각(제외) 전 측정 — 미지정이면 끝까지 */
  endMs?: number;
}

function rangeClauses(range: BodyweightRange): Q.Clause[] {
  const c: Q.Clause[] = [];
  if (range.startMs !== undefined) c.push(Q.where('measured_at', Q.gte(range.startMs)));
  if (range.endMs !== undefined) c.push(Q.where('measured_at', Q.lt(range.endMs)));
  return c;
}

/** 반응형 구독용(측정 시각 오름차순). 화면은 observe() 로 쓴다. */
export function queryBodyweightLogs(range: BodyweightRange = {}): Query<BodyweightLog> {
  return logs().query(...rangeClauses(range), Q.sortBy('measured_at', Q.asc));
}

/** 기간 안 이력(측정 시각 오름차순). 무효 행(시각·무게 없음)도 그대로 돌려준다 — 거르는 일은 domain 이 한다. */
export async function listBodyweightLogs(range: BodyweightRange = {}): Promise<BodyweightLog[]> {
  return queryBodyweightLogs(range).fetch();
}

export async function countBodyweightLogs(): Promise<number> {
  return logs().query().fetchCount();
}

// ── 쓰기 ────────────────────────────────────────────────────────────────

export interface AddBodyweightInput {
  /** 표시 단위 값(예: 165.4) */
  weight: number;
  unit: WeightUnit;
  /** 측정 시각(ms) — 기본 지금 */
  measuredAt?: number;
  source?: BodyweightSource;
  note?: string | null;
}

/** 측정 한 줄을 더하고, 같은 write 안에서 미러를 맞춘다. 범위 밖 값은 오류. */
export async function addBodyweightLog(input: AddBodyweightInput): Promise<BodyweightLog> {
  const kg = toKg(input.weight, input.unit);
  if (!isValidBodyweightKg(kg)) throw new Error('체중 값이 범위를 벗어났어요');
  // write 밖에서 프로필을 먼저 확보한다 — getOrCreateLocalUser 는 없으면 자기 write 를 연다(교착 방지).
  await getOrCreateLocalUser();
  const created = await database.write(async () => {
    const rec = await logs().create((l) => {
      l.measuredAt = input.measuredAt ?? Date.now();
      l.weightKg = kg;
      l.source = input.source ?? 'manual';
      l.note = input.note?.trim() || null;
    });
    await applyMirrorInWrite(await oldestProfile());
    return rec;
  });
  scheduleSync();
  return created;
}

export interface UpdateBodyweightPatch {
  /** 표시 단위 값 — `unit` 과 함께 */
  weight?: number;
  unit?: WeightUnit;
  measuredAt?: number;
  note?: string | null;
}

/** 한 줄을 고치고 미러를 맞춘다. */
export async function updateBodyweightLog(id: string, patch: UpdateBodyweightPatch): Promise<void> {
  let kg: number | undefined;
  if (patch.weight !== undefined) {
    if (!patch.unit) throw new Error('단위가 필요해요');
    kg = toKg(patch.weight, patch.unit);
    if (!isValidBodyweightKg(kg)) throw new Error('체중 값이 범위를 벗어났어요');
  }
  await database.write(async () => {
    const rec = await logs().find(id);
    await rec.update((l) => {
      if (kg !== undefined) l.weightKg = kg;
      if (patch.measuredAt !== undefined) l.measuredAt = patch.measuredAt;
      if (patch.note !== undefined) l.note = patch.note?.trim() || null;
    });
    await applyMirrorInWrite(await oldestProfile());
  });
  scheduleSync();
}

/**
 * 한 줄을 지운다(동기 삭제 표시). 마지막 기록이면 미러가 null 이 된다 — 화면은 지우기 전에 countBodyweightLogs()===1 이면
 * 「체중 미설정으로 돌아가요」를 확인받는다(U-9).
 * @returns 지운 뒤 미러 값(null = 미설정)
 */
export async function deleteBodyweightLog(id: string): Promise<number | null> {
  const next = await database.write(async () => {
    const rec = await logs().find(id);
    await rec.markAsDeleted();
    return applyMirrorInWrite(await oldestProfile());
  });
  scheduleSync();
  return next;
}

// ── 멱등 정리(D-10) ─────────────────────────────────────────────────────

export interface ReconcileResult {
  /** 새로 심은 이력('init' = 첫 정리 · 'legacy' = 옛 경로 흡수) */
  created: 'init' | 'legacy' | null;
  /** 미러를 고쳤는가 */
  mirrorChanged: boolean;
  mirrorKg: number | null;
}

/**
 * 미러를 이력에 맞춘다 — 동기 뒤(normalizeCatalogRecords 옆)·백업 가져오기 직후·부팅 때 부른다. 바꿀 것이 없으면 쓰지 않는다.
 * 프로필이 없으면(새 기기 · 첫 동기 전) 아무것도 하지 않는다 — 프로필을 여기서 만들지 않는다(첫 동기를 기다리는 길과 겹치지 않게).
 * write 를 스스로 연다 — write 안에서 부르지 않는다.
 */
export async function reconcileBodyweightMirror(): Promise<ReconcileResult> {
  const none: ReconcileResult = { created: null, mirrorChanged: false, mirrorKg: null };
  const pre = await oldestProfile();
  if (!pre) return none;
  // 지운 표시가 남은 id 는 같은 id 로 다시 만들 수 없다(Loki 가 거부) — 판정에 넘긴다.
  const deleted = new Set(await database.adapter.getDeletedRecords(TABLE));
  // v26 첫 동기 전(옛 스키마로만 동기한 기기)에는 서버 이력을 아직 못 받았다 — 아무것도 하지 않는다(부팅 정리의 bw-init 중복·흡수 증거 유실 방지).
  const allowCreate = await isLocalPullComplete();
  const result = await database.write(async () => {
    // write 안에서 다시 읽는다 — 그사이 다른 쓰기가 끼었을 수 있다.
    const profile = (await oldestProfile()) ?? pre;
    const all = (await logs().query().fetch()).map(toBodyweightLogLike);
    // 무효 행(시각·무게 없음)도 id 는 차지한다 — 지운 표시 id 와 함께 「만들 수 없는 id」로 넘긴다.
    const taken = new Set<string>([...deleted, ...all.map((l) => l.id)]);
    const plan: MirrorPlan = planBodyweightMirror(
      { id: profile.id, bodyweightKg: profile.bodyweightKg, updatedAt: profileUpdatedAt(profile) },
      all,
      taken,
      allowCreate,
    );
    if (!plan.create && !plan.updateMirror) return { created: null, mirrorChanged: false, mirrorKg: plan.mirrorKg };
    const c = plan.create;
    if (c) {
      await logs().create((l) => {
        l._raw.id = c.id;
        l.measuredAt = c.measuredAt;
        l.weightKg = c.weightKg;
        l.source = c.source;
        l.note = null;
      });
    }
    if (plan.updateMirror) {
      await profile.update((p) => {
        p.bodyweightKg = plan.mirrorKg;
      });
    }
    return { created: c?.reason ?? null, mirrorChanged: plan.updateMirror, mirrorKg: plan.mirrorKg };
  });
  return result;
}
