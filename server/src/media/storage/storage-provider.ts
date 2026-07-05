// @plm SRS-019  스토리지 포트 (SAD-012 · ADR-016). 로컬 디스크가 기본 구현.
// 클라우드(S3/R2/Supabase Storage)는 이 포트 구현으로 드롭인 — 서버가 /media/file/:key로 프록시 서브.
import type { Readable } from 'stream';

export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
}

export interface StorageProvider {
  readonly name: string;
  save(data: Buffer, contentType: string): Promise<StoredObject>;
  // 서버 프록시 서브(/media/file/:key)용 — 백엔드(로컬/R2) 무관하게 존재확인·스트림 제공.
  // 이래야 모더레이션(flagged→404)·capability URL·상대경로 모델이 백엔드 교체와 무관하게 유지된다.
  exists(key: string): Promise<boolean>;
  getStream(key: string): Promise<Readable>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
