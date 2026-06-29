// 사용자 프로필/설정 데이터 접근 (SRS-006). Phase 0: 로컬 단일 사용자 + 인증 스텁. @plm SRS-006
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { UserProfile } from '../db/models';
import { DEFAULT_BAR_KG } from '../domain';
import type { AppLanguage, EquipmentType, WeightUnit } from '../domain';

const profiles = () => database.get<UserProfile>('user_profiles');

// 로컬 사용자 1건 보장(없으면 기본값으로 생성).
export async function getOrCreateLocalUser(): Promise<UserProfile> {
  const existing = await profiles().query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
  if (existing[0]) return existing[0];
  return database.write(async () =>
    profiles().create((u) => {
      u.authProvider = 'local';
      u.preferredLanguage = 'ko';
      u.weightUnit = 'kg';
      u.barWeightKg = DEFAULT_BAR_KG;
      u.availableEquipment = [];
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
  displayName?: string | null;
  availableEquipment?: EquipmentType[];
}

export async function updateUserSettings(id: string, patch: UserSettingsPatch): Promise<void> {
  await database.write(async () => {
    const u = await profiles().find(id);
    await u.update((rec) => {
      if (patch.weightUnit !== undefined) rec.weightUnit = patch.weightUnit;
      if (patch.preferredLanguage !== undefined) rec.preferredLanguage = patch.preferredLanguage;
      if (patch.barWeightKg !== undefined) rec.barWeightKg = patch.barWeightKg;
      if (patch.displayName !== undefined) rec.displayName = patch.displayName;
      if (patch.availableEquipment !== undefined) rec.availableEquipment = patch.availableEquipment;
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
