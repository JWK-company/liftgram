// 이미지 자동 스캔 어댑터 포트 (SAD-012 · ADR-016/017).
// 기본 noop(플래그 안 함) — 클라우드(Rekognition/Hive/Sightengine) 드롭인 지점.
export interface ScanResult {
  flagged: boolean;
  reason?: string;
}

export interface ImageScanner {
  readonly name: string;
  scan(data: Buffer, contentType: string): Promise<ScanResult>;
}

export const IMAGE_SCANNER = Symbol('IMAGE_SCANNER');
