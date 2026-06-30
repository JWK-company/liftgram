import { IsObject } from 'class-validator';

// WatermelonDB 동기 프로토콜의 changes 형태 (테이블별 created/updated/deleted).
// 레코드는 raw(`id` + 컬럼). 서버는 컬럼에 불투명 — payload(JSON)로 보관.
export interface RawRecord {
  id: string;
  [column: string]: unknown;
}

export interface TableChanges {
  created: RawRecord[];
  updated: RawRecord[];
  deleted: string[];
}

export type SyncChanges = Record<string, TableChanges>;

export class PushDto {
  // 동적 테이블 맵 — 깊은 검증은 생략(형태만). ValidationPipe whitelist 통과 위해 데코레이터 부착.
  @IsObject()
  changes!: SyncChanges;
}
