import { Injectable } from '@nestjs/common';
import type { ImageScanner, ScanResult } from './image-scanner';

// 기본 스캐너 — 아무것도 플래그하지 않음(로컬/개발). 실제 스캔은 클라우드 어댑터로 교체(ADR-016).
@Injectable()
export class NoopImageScanner implements ImageScanner {
  readonly name = 'noop';
  async scan(): Promise<ScanResult> {
    return { flagged: false };
  }
}
