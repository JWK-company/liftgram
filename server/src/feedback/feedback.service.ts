// @plm SRS-006  개발 피드백 → PLM 아이디어보드 브릿지 (coworker/admin 전용).
// 앱에서 자연어로 적은 문제·개선사항을 PLM(plm-hub)의 아이디어/투표 기능에 아이디어로 등록하고,
// 프로젝트 아이디어 목록을 상태와 함께 되읽는다. PLM 토큰은 서버 env에만 보관(클라이언트 미노출).
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateFeedbackDto } from './dto/feedback.dto';

// PLM /ideas 응답 행(라이브 스키마 — jwk-plm.shoi.ch).
interface PlmIdea {
  id: number;
  title: string;
  body: string | null;
  author: string;
  state: string;
  anonymous: boolean;
  promoted_code: string | null;
  artifact_code: string | null;
}

// 앱으로 반환하는 피드백 항목(뷰 모델).
export interface FeedbackItem {
  id: number;
  category: string; // bug | improvement | other
  title: string; // [접두] 제거된 사람용 제목
  detail: string; // 마커·푸터 제거된 본문
  state: string; // submitted | discussion | voting | adopted | rejected | ...
  mine: boolean; // 현재 사용자가 올린 항목인가
  promotedCode: string | null; // 채택→승격된 아티팩트 코드(있으면)
}

const CATEGORY_PREFIX: Record<string, string> = { bug: '버그', improvement: '개선' };
const REQUEST_TIMEOUT_MS = 20000;
// body 하단에 심는 기계 판독 마커 — 분류·제출자 왕복용. 렌더 시 잘 드러나지 않는 HTML 주석.
const MARKER_RE = /<!--\s*liftgram-feedback v=1 cat=([a-z]+) uid=(\S+)\s*-->/;
const FOOTER_SEP = '\n\n---\n';

@Injectable()
export class FeedbackService {
  private readonly log = new Logger(FeedbackService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly project: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = (config.get<string>('PLM_API_URL') ?? 'https://jwk-plm.shoi.ch').replace(/\/+$/, '');
    this.token = config.get<string>('PLM_API_TOKEN') ?? '';
    this.project = config.get<string>('PLM_PROJECT') ?? 'liftgram';
  }

  private ensureConfigured(): void {
    // 토큰 미설정이면 기능 자체가 불가 — 503으로 명확히(무증상 실패 방지).
    if (!this.token) {
      throw new ServiceUnavailableException('feedback bridge not configured (PLM_API_TOKEN missing)');
    }
  }

  // Cloudflare가 기본 UA(node)를 403 차단할 수 있어 user-agent 명시. 헤더 수신부터 본문 소비까지
  // 단일 타임아웃으로 바운드(헤더만 오고 본문이 스톨하는 경우 방지) — text로 받아 호출부가 방어적 파싱.
  private async plmCall(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; text: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${this.token}`,
          'user-agent': 'liftgram-server/feedback',
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } finally {
      clearTimeout(timer);
    }
  }

  // 2xx라도 비JSON(Cloudflare 챌린지 HTML·빈 본문 등)이면 통제된 500 + 로그 컨텍스트로 표출.
  private parseJson<T>(text: string, ctx: string): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      this.log.error(`PLM ${ctx}: non-JSON body: ${text.slice(0, 200)}`);
      throw new InternalServerErrorException('unexpected PLM response');
    }
  }

  private async submitterLabel(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    return u?.displayName || u?.email || userId;
  }

  async create(user: AuthUser, dto: CreateFeedbackDto): Promise<{ id: number }> {
    this.ensureConfigured();
    const titleText = dto.title.trim();
    const detailText = dto.detail.trim();
    // trim 후 빈 값 방어 — DTO의 MinLength는 trim 이전 길이를 보므로 공백만 입력이 통과할 수 있음.
    if (titleText.length < 3 || detailText.length < 5) {
      throw new BadRequestException('title/detail too short after trim');
    }
    const prefix = CATEGORY_PREFIX[dto.category] ?? '기타';
    // 제출자 라벨의 개행 제거 — 표시 detail 스트립(마지막 FOOTER_SEP 기준)이 어긋나지 않도록.
    const who = (await this.submitterLabel(user.userId)).replace(/[\r\n]+/g, ' ').trim();
    const title = `[${prefix}] ${titleText}`;
    // 본문 = 자연어 상세 + 제출자 푸터 + 기계 마커(분류·uid 왕복용, 최후미).
    const body =
      `${detailText}${FOOTER_SEP}` +
      `_제출: ${who} · Liftgram 인앱 피드백_\n` +
      `<!-- liftgram-feedback v=1 cat=${dto.category} uid=${user.userId} -->`;

    let r: { ok: boolean; status: number; text: string };
    try {
      r = await this.plmCall('/ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: this.project, title, body, anonymous: false }),
      });
    } catch (e) {
      this.log.error(`PLM /ideas POST failed: ${String(e)}`);
      throw new ServiceUnavailableException('PLM idea board unreachable');
    }
    if (!r.ok) {
      this.log.error(`PLM /ideas POST ${r.status}: ${r.text.slice(0, 200)}`);
      throw new InternalServerErrorException('failed to register idea');
    }
    const json = this.parseJson<{ id?: number }>(r.text, '/ideas POST');
    if (typeof json.id !== 'number') throw new InternalServerErrorException('unexpected PLM response');
    return { id: json.id };
  }

  async list(user: AuthUser): Promise<FeedbackItem[]> {
    this.ensureConfigured();
    let r: { ok: boolean; status: number; text: string };
    try {
      r = await this.plmCall(`/ideas?project=${encodeURIComponent(this.project)}`, { method: 'GET' });
    } catch (e) {
      this.log.error(`PLM /ideas GET failed: ${String(e)}`);
      throw new ServiceUnavailableException('PLM idea board unreachable');
    }
    if (!r.ok) throw new InternalServerErrorException('failed to load ideas');
    const rows = this.parseJson<PlmIdea[]>(r.text, '/ideas GET');
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => this.toItem(row, user.userId))
      // 인앱 피드백으로 만든 항목(정상 마커+푸터)만 노출 — 대시보드 수기 아이디어와 섞이지 않게.
      .filter((it): it is FeedbackItem => it !== null)
      .sort((a, b) => b.id - a.id);
  }

  private toItem(row: PlmIdea, viewerId: string): FeedbackItem | null {
    const body = row.body ?? '';
    // 서버 항목의 구조: `<상세>FOOTER_SEP<제출자줄>\n<마커>` — 마커는 항상 최후미.
    // 사용자 상세에 위조 마커/구분자가 섞여도 마지막(진짜 서버) 것만 신뢰.
    let m: RegExpExecArray | null = null;
    const scan = new RegExp(MARKER_RE, 'g');
    for (let x = scan.exec(body); x; x = scan.exec(body)) m = x;
    if (!m) return null; // 마커 없음 → 인앱 피드백 아님
    // 정상 구조 검증: 마지막 푸터(FOOTER_SEP)가 마커보다 앞에 있어야 함. 푸터 없이 마커만 있는
    // 항목(대시보드에서 위조된 마커-only body)은 제외 → cat/uid 스푸핑·원시 마커 노출 차단.
    const sepIdx = body.lastIndexOf(FOOTER_SEP);
    if (sepIdx < 0 || sepIdx > m.index) return null;
    const category = m[1];
    const mine = m[2] === viewerId;
    // 표시용 상세 = 마지막 푸터 이전까지(마커·제출자줄 미노출, 사용자 '---'는 보존). 제목은 [접두] 제거.
    const detail = body.slice(0, sepIdx).trim();
    const title = row.title.replace(/^\[[^\]]*\]\s*/, '').trim();
    return {
      id: row.id,
      category,
      title,
      detail,
      state: row.state,
      mine,
      promotedCode: row.promoted_code,
    };
  }
}
