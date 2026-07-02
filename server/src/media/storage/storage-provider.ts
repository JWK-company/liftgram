// @plm SRS-019  스토리지 포트 (SAD-012 · ADR-016). 로컬 디스크가 기본 구현.
// 클라우드(S3/R2/Supabase Storage)는 이 포트 구현으로 드롭인 — url이 CDN을 가리키고 서브 라우트는 불필요.
export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
}

export interface StorageProvider {
  readonly name: string;
  save(data: Buffer, contentType: string): Promise<StoredObject>;
  // 로컬 전용: key → 절대 파일 경로(서브 라우트에서 스트림). 클라우드는 CDN이라 미사용.
  resolvePath(key: string): string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
