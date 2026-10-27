// 사용자 프로필/설정 데이터 접근 (SRS-006). Phase 0: 로컬 단일 사용자 + 인증 스텁. @plm SRS-006
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { awaitFirstSync } from '../sync/syncEngine';
import { UserProfile } from '../db/models';
import { DEFAULT_BAR_KG } from '../domain';
import { normalizeGearTags } from '../domain';
import type { AppLanguage, EquipmentType, ExperienceLevel, GearTag, WeeklySchedule, WeightUnit } from '../domain';

const profiles = () => database.get<UserProfile>('user_profiles');

// 로컬 사용자 1건 보장(없으면 기본값으로 생성).
//
// **만드는 길은 하나다(single-flight).** 화면 여럿이 동시에 부르면, 모두가 "없음"을 본 뒤 각자 만들어
// 프로필이 둘 이상 생긴다 — 그러면 설정은 새 프로필에 쓰이는데 화면은 가장 오래된 것을 보여 줘서
// 바꾼 값이 안 바뀐 것처럼 보인다(첫 동기를 기다리게 한 뒤 실제로 그렇게 깨졌다 · 2026-10-26).
let creating: Promise<UserProfile> | null = null;

export async function getOrCreateLocalUser(): Promise<UserProfile> {
  const existing = await profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
  if (existing[0]) return existing[0];
  if (!creating) {
    creating = createLocalUserOnce().finally(() => {
      creating = null;
    });
  }
  return creating;
}

async function createLocalUserOnce(): Promise<UserProfile> {
  // 새 기기일 수 있다 — 서버의 프로필이 내려오기 전에 빈 것을 만들면 프로필이 기기마다 늘어난다.
  // 첫 동기를 잠깐 기다린 뒤 다시 본다(로그인 안 했거나 오프라인이면 곧바로 지나간다).
  await awaitFirstSync();
  const pulled = await profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
  if (pulled[0]) return pulled[0];
  return database.write(async () =>
    profiles().create((u) => {
      u.authProvider = 'local';
      u.preferredLanguage = 'ko';
      u.weightUnit = 'kg';
      u.barWeightKg = DEFAULT_BAR_KG;
      u.availableEquipment = [];
      u.machineVariantLabels = [];
      u.myGear = []; // v14 내 장비함. @plm SRS-041
      u.email = null;
      u.displayName = null;
      u.serverId = null;
      u.lastSyncAt = null;
    }),
  );
}

// 단일 프로필 반응형 구독용 쿼리.
export function queryLocalUser(): Query<UserProfile> {
  return profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1));
}

export interface UserSettingsPatch {
  weightUnit?: WeightUnit;
  preferredLanguage?: AppLanguage;
  barWeightKg?: number;
  bodyweightKg?: number | null; // v12: 체중 — 맨몸±가중/보조 볼륨. @plm SRS-033
  displayName?: string | null;
  availableEquipment?: EquipmentType[];
  machineVariantLabels?: string[];
  myGear?: GearTag[]; // v14: 내 장비함 — 저장 전 도메인 정규화를 강제한다. @plm SRS-041
  weeklySchedule?: WeeklySchedule | null; // v17: 주단위 스케줄·블록 — null=제거. @plm SRS-044
  experienceLevel?: ExperienceLevel | null; // v18: 운동 경력 — 선택·후입력 가능. @plm SRS-045
  trainerIntent?: boolean | null; // v18: 코칭 의향(회원 모집) — 자격 보증 아님. @plm SRS-045
  manualWorkoutDays?: number[] | null; // v19: 수동 '운동했어요' 표시일(dayNumber) — 캘린더 전용. @plm SRS-011
  calendarNotes?: Record<string, string> | null; // v20: 날짜별 간단 메모 — 캘린더. @plm SRS-011
  appPrefs?: Record<string, string> | null; // v21: 계정과 함께 옮기는 앱 설정 — 통째로 바꾼다(합치기는 부르는 쪽). @plm SRS-006
}

export async function updateUserSettings(id: string, patch: UserSettingsPatch): Promise<void> {
  // 체중은 미러 규칙 안으로(CD-1 ① · D-10): 같은 write 안에서 manual 이력 한 줄 + 미러. 동적 import — 저장소끼리 정적 순환을 만들지 않게.
  const bw = patch.bodyweightKg !== undefined ? await import('./bodyweightRepository') : null;
  const historyComplete = bw ? await bw.bodyweightHistoryComplete() : true;
  await database.write(async () => {
    const u = await profiles().find(id);
    let mirrorKg: number | null | undefined;
    if (bw) {
      mirrorKg = await bw.writeProfileBodyweightInWrite(patch.bodyweightKg ?? null, historyComplete);
      // 미러는 「가장 오래된 프로필」이 들고 있다(읽기와 같은 프로필) — 고치는 프로필이 그것이 아니면 그쪽도 맞춘다.
      const [oldest] = await profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
      if (oldest && oldest.id !== u.id && (oldest.bodyweightKg ?? null) !== mirrorKg)
        await oldest.update((rec) => {
          rec.bodyweightKg = mirrorKg ?? null;
        });
    }
    await u.update((rec) => {
      if (patch.weightUnit !== undefined) rec.weightUnit = patch.weightUnit;
      if (patch.preferredLanguage !== undefined) rec.preferredLanguage = patch.preferredLanguage;
      if (patch.barWeightKg !== undefined) rec.barWeightKg = patch.barWeightKg;
      // [원본] if (patch.bodyweightKg !== undefined) rec.bodyweightKg = patch.bodyweightKg;
      if (mirrorKg !== undefined) rec.bodyweightKg = mirrorKg;
      if (patch.displayName !== undefined) rec.displayName = patch.displayName;
      if (patch.availableEquipment !== undefined) rec.availableEquipment = patch.availableEquipment;
      if (patch.machineVariantLabels !== undefined) rec.machineVariantLabels = patch.machineVariantLabels;
      // 화이트리스트 밖·중복·상한 초과는 여기서 걸러 저장한다(sanitizer 는 읽기 방어, 이건 쓰기 방어).
      if (patch.myGear !== undefined) rec.myGear = normalizeGearTags(patch.myGear);
      if (patch.weeklySchedule !== undefined) rec.weeklySchedule = patch.weeklySchedule; // sanitizer가 읽기 방어. @plm SRS-044
      if (patch.experienceLevel !== undefined) rec.experienceLevel = patch.experienceLevel; // @plm SRS-045
      if (patch.trainerIntent !== undefined) rec.trainerIntent = patch.trainerIntent; // @plm SRS-045
      if (patch.manualWorkoutDays !== undefined) rec.manualWorkoutDays = patch.manualWorkoutDays; // @plm SRS-011
      if (patch.calendarNotes !== undefined) rec.calendarNotes = patch.calendarNotes; // v20 @plm SRS-011
      if (patch.appPrefs !== undefined) rec.appPrefs = patch.appPrefs; // v21 @plm SRS-006
    });
  });
}

// 인증 스텁 (SRS-006): 서버 연동은 Phase 1. 로컬 프로필에 신원만 기록. @phase-1-backend
export async function setLocalAuth(
  id: string,
  input: { email: string; displayName?: string | null; authProvider?: string },
): Promise<void> {
  await database.write(async () => {
    const u = await profiles().find(id);
    await u.update((rec) => {
      rec.email = input.email.trim();
      rec.displayName = input.displayName ?? rec.displayName;
      rec.authProvider = input.authProvider ?? 'email';
    });
  });
}

export async function signOutLocal(id: string): Promise<void> {
  await database.write(async () => {
    const u = await profiles().find(id);
    await u.update((rec) => {
      rec.email = null;
      rec.authProvider = 'local';
      rec.serverId = null;
    });
  });
}
