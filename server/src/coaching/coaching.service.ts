// @plm SRS-048  코칭 권한·회원 리포트 (SAD-022) — 계약+동의 기반 접근 제어·감사 로그·서버측 집계.
// 원칙(ADR-028): 앱은 사실 집계만 제공, 자동 제안·개입 없음 — 판단은 트레이너(사람).
// 구독 검증(SRS-014)은 미구현 스텁: assertTrainerEligible 이 trainerIntent 만 확인한다.
// 구독 도입 시 이 함수 한 곳만 교체하면 3중 조건(계약·동의·구독)이 완성된다(스펙 명기 편차).
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CoachingPeer {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  experienceLevel: string | null;
  trainerIntent: boolean;
}

export interface GrantView {
  id: string;
  status: string;
  requestedBy: string;
  consentAt: string | null;
  createdAt: string;
  roleOfMe: 'trainer' | 'member';
  peer: CoachingPeer; // 상대방(회원이 보면 트레이너, 트레이너가 보면 회원)
}

// 회원 리포트 — 사실 집계만(추정치는 클라이언트에서 '추정' 라벨 강제 — wellness 규약).
export interface MemberReport {
  weeks: number;
  sessionsCount: number;
  sessionsPerWeek: number;
  totalVolumeKg: number;
  muscleVolume: { muscle: string; volumeKg: number }[];
  recentSessions: { name: string | null; startedAt: number; durationSeconds: number | null; totalVolumeKg: number; prCount: number }[];
}

const REPORT_WEEKS = 8;

type RawRecord = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

@Injectable()
export class CoachingService {
  constructor(private readonly prisma: PrismaService) {}

  private toPeer(u: { id: string; displayName: string | null; avatarUrl: string | null; experienceLevel: string | null; trainerIntent: boolean }): CoachingPeer {
    return { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl, experienceLevel: u.experienceLevel, trainerIntent: u.trainerIntent };
  }

  // 구독 검증 스텁(SRS-014 미구현) — 트레이너 자격 = 코칭 의향 표시 여부만. TODO: 구독 활성 검증으로 교체.
  private async assertTrainerEligible(trainerId: string): Promise<void> {
    const t = await this.prisma.user.findUnique({ where: { id: trainerId } });
    if (!t) throw new NotFoundException('trainer not found');
    if (!t.trainerIntent) throw new BadRequestException('trainer has not enabled coaching');
  }

  // 차단 관계면 코칭 연결 금지(기존 Block 정책 준수).
  private async assertNotBlocked(a: string, b: string): Promise<void> {
    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    });
    if (blocked) throw new ForbiddenException('blocked relation');
  }

  // 트레이너 탐색 — 코칭 의향 사용자만, 표시명 부분 일치, 차단 관계 제외.
  async searchTrainers(meId: string, q?: string): Promise<CoachingPeer[]> {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: meId }, { blockedId: meId }] },
    });
    const excluded = new Set<string>([meId]);
    for (const b of blocks) {
      excluded.add(b.blockerId);
      excluded.add(b.blockedId);
    }
    const users = await this.prisma.user.findMany({
      where: {
        trainerIntent: true,
        id: { notIn: [...excluded] },
        ...(q?.trim() ? { displayName: { contains: q.trim(), mode: 'insensitive' as Prisma.QueryMode } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });
    return users.map((u) => this.toPeer(u));
  }

  // 코칭 요청 — 회원이 trainerId 지정 또는 트레이너가 memberId 지정(정확히 하나). 쌍당 1행 upsert:
  // 해지된 관계 재요청은 같은 행을 pending으로 되살린다(이력은 감사 로그가 보존).
  async createRequest(meId: string, input: { trainerId?: string; memberId?: string }): Promise<GrantView> {
    const asMember = !!input.trainerId;
    if (asMember === !!input.memberId) throw new BadRequestException('specify exactly one of trainerId|memberId');
    const trainerId = asMember ? input.trainerId! : meId;
    const memberId = asMember ? meId : input.memberId!;
    if (trainerId === memberId) throw new BadRequestException('cannot coach yourself');
    await this.assertNotBlocked(trainerId, memberId);
    await this.assertTrainerEligible(trainerId);
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('member not found');

    const existing = await this.prisma.coachingGrant.findUnique({
      where: { trainerId_memberId: { trainerId, memberId } },
    });
    if (existing && existing.status !== 'revoked') throw new BadRequestException('request already exists');
    const grant = existing
      ? await this.prisma.coachingGrant.update({
          where: { id: existing.id },
          data: { status: 'pending', requestedBy: asMember ? 'member' : 'trainer', consentAt: null, revokedAt: null },
        })
      : await this.prisma.coachingGrant.create({
          data: { trainerId, memberId, status: 'pending', requestedBy: asMember ? 'member' : 'trainer' },
        });
    await this.audit(grant.id, meId, 'request');
    return this.view(grant.id, meId);
  }

  // 내 grants(양방향) — 상대 프로필 포함.
  async listGrants(meId: string): Promise<GrantView[]> {
    const grants = await this.prisma.coachingGrant.findMany({
      where: { OR: [{ trainerId: meId }, { memberId: meId }] },
      include: { trainer: true, member: true },
      orderBy: { updatedAt: 'desc' },
    });
    return grants.map((g) => ({
      id: g.id,
      status: g.status,
      requestedBy: g.requestedBy,
      consentAt: g.consentAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      roleOfMe: g.trainerId === meId ? 'trainer' : 'member',
      peer: this.toPeer(g.trainerId === meId ? g.member : g.trainer),
    }));
  }

  private async view(grantId: string, meId: string): Promise<GrantView> {
    const g = await this.prisma.coachingGrant.findUniqueOrThrow({
      where: { id: grantId },
      include: { trainer: true, member: true },
    });
    return {
      id: g.id,
      status: g.status,
      requestedBy: g.requestedBy,
      consentAt: g.consentAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      roleOfMe: g.trainerId === meId ? 'trainer' : 'member',
      peer: this.toPeer(g.trainerId === meId ? g.member : g.trainer),
    };
  }

  // 수락(동의) — 요청의 '반대편'만 가능. 수락 = consentAt 기록 → active.
  async accept(meId: string, grantId: string): Promise<GrantView> {
    const g = await this.prisma.coachingGrant.findUnique({ where: { id: grantId } });
    if (!g) throw new NotFoundException('grant not found');
    if (g.status !== 'pending') throw new BadRequestException('not pending');
    const accepterSide = g.trainerId === meId ? 'trainer' : g.memberId === meId ? 'member' : null;
    if (!accepterSide) throw new ForbiddenException('not a party');
    if (accepterSide === g.requestedBy) throw new ForbiddenException('requester cannot accept');
    await this.assertTrainerEligible(g.trainerId);
    await this.prisma.coachingGrant.update({
      where: { id: grantId },
      data: { status: 'active', consentAt: new Date() },
    });
    await this.audit(grantId, meId, 'accept');
    return this.view(grantId, meId);
  }

  // 해지 — 양쪽 모두 가능. 즉시 revoked(모든 코칭 접근 즉시 차단 — 가드가 active만 통과).
  async revoke(meId: string, grantId: string): Promise<GrantView> {
    const g = await this.prisma.coachingGrant.findUnique({ where: { id: grantId } });
    if (!g) throw new NotFoundException('grant not found');
    if (g.trainerId !== meId && g.memberId !== meId) throw new ForbiddenException('not a party');
    if (g.status === 'revoked') throw new BadRequestException('already revoked');
    await this.prisma.coachingGrant.update({
      where: { id: grantId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.audit(grantId, meId, 'revoke');
    return this.view(grantId, meId);
  }

  // 코칭 접근 가드 — 트레이너 me가 member에 대해 scope 권한을 가진 active grant 보유해야 통과.
  private async assertActiveGrant(trainerId: string, memberId: string, scopeKey: 'routineEdit' | 'scheduleEdit' | 'logView') {
    const g = await this.prisma.coachingGrant.findUnique({
      where: { trainerId_memberId: { trainerId, memberId } },
    });
    if (!g || g.status !== 'active') throw new ForbiddenException('no active coaching grant');
    const scope = (g.scope ?? {}) as Record<string, unknown>;
    if (scope[scopeKey] !== true) throw new ForbiddenException(`scope ${scopeKey} not granted`);
    return g;
  }

  // 회원 리포트 — 회원이 동기한 SyncRecord(raw WatermelonDB payload)를 서버측에서만 집계(SAD-022).
  // 사실 집계만: 세션 수·주당 세션·총볼륨·부위별 볼륨·최근 세션. 신체정보는 다루지 않는다(범위 밖).
  async memberReport(trainerId: string, memberId: string): Promise<MemberReport> {
    const g = await this.assertActiveGrant(trainerId, memberId, 'logView');
    await this.audit(g.id, trainerId, 'report_view');

    const since = Date.now() - REPORT_WEEKS * 7 * 24 * 3600 * 1000;
    const recs = await this.prisma.syncRecord.findMany({
      where: { userId: memberId, deleted: false, collection: { in: ['workouts', 'workout_exercises', 'set_logs', 'exercises'] } },
    });
    const byCol = new Map<string, RawRecord[]>();
    for (const r of recs) {
      const list = byCol.get(r.collection) ?? [];
      list.push(r.payload as RawRecord);
      byCol.set(r.collection, list);
    }
    const workouts = (byCol.get('workouts') ?? []).filter(
      (w) => w.state === 'completed' && num(w.started_at) >= since,
    );
    const workoutIds = new Set(workouts.map((w) => String(w.id)));
    const wes = (byCol.get('workout_exercises') ?? []).filter((we) => workoutIds.has(String(we.workout_id)));
    const weToExercise = new Map(wes.map((we) => [String(we.id), String(we.exercise_id)]));
    const muscleByExercise = new Map(
      (byCol.get('exercises') ?? []).map((e) => {
        let muscles: string[] = [];
        try {
          const parsed = JSON.parse(String(e.primary_muscles ?? '[]')) as unknown;
          if (Array.isArray(parsed)) muscles = parsed.filter((m): m is string => typeof m === 'string');
        } catch {
          /* 불량 payload 무해화 */
        }
        return [String(e.id), muscles[0] ?? 'other'] as const;
      }),
    );

    const muscleVol = new Map<string, number>();
    for (const s of byCol.get('set_logs') ?? []) {
      const exId = weToExercise.get(String(s.workout_exercise_id));
      if (!exId) continue; // 기간 밖 세션의 세트
      if (s.done === false || s.is_warmup === true || s.is_failed === true) continue;
      const vol = num(s.weight_kg) * num(s.reps);
      if (vol <= 0) continue;
      const muscle = muscleByExercise.get(exId) ?? 'other';
      muscleVol.set(muscle, (muscleVol.get(muscle) ?? 0) + vol);
    }

    const sorted = [...workouts].sort((a, b) => num(b.started_at) - num(a.started_at));
    return {
      weeks: REPORT_WEEKS,
      sessionsCount: workouts.length,
      sessionsPerWeek: Math.round((workouts.length / REPORT_WEEKS) * 10) / 10,
      totalVolumeKg: Math.round(workouts.reduce((sum, w) => sum + num(w.total_volume_kg), 0)),
      muscleVolume: [...muscleVol.entries()]
        .map(([muscle, volumeKg]) => ({ muscle, volumeKg: Math.round(volumeKg) }))
        .sort((a, b) => b.volumeKg - a.volumeKg),
      recentSessions: sorted.slice(0, 5).map((w) => ({
        name: typeof w.name === 'string' ? w.name : null,
        startedAt: num(w.started_at),
        durationSeconds: w.duration_seconds == null ? null : num(w.duration_seconds),
        totalVolumeKg: Math.round(num(w.total_volume_kg)),
        prCount: num(w.pr_count),
      })),
    };
  }

  // 감사 로그 열람 — grant 당사자만(회원의 "내 코칭 이력" 표면).
  async listAudit(meId: string, grantId: string) {
    const g = await this.prisma.coachingGrant.findUnique({ where: { id: grantId } });
    if (!g) throw new NotFoundException('grant not found');
    if (g.trainerId !== meId && g.memberId !== meId) throw new ForbiddenException('not a party');
    const rows = await this.prisma.coachingAudit.findMany({
      where: { grantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((a) => ({ id: a.id, actorId: a.actorId, action: a.action, createdAt: a.createdAt.toISOString() }));
  }

  private async audit(grantId: string, actorId: string, action: string, detail?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.coachingAudit.create({ data: { grantId, actorId, action, detail } });
  }
}
