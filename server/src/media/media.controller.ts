// @plm SRS-019  미디어 REST — 업로드(인증) + 파일 서브(공개, 랜덤 키=capability URL). SAD-012.
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream, existsSync } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { MediaService, MediaView } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MediaView> {
    return this.media.upload(user.userId, file);
  }

  // 파일 서브(로컬 스토리지). 공개 — 피드 이미지 로딩용(랜덤 키는 추측 불가). 클라우드 전환 시 CDN이 대체.
  @Get('file/:key')
  async file(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const asset = await this.media.findByKey(key);
    // 모더레이션 제거·자동스캔 위반 미디어는 바이트도 서브하지 않음(제거=불가시 보장, ADR-017).
    if (asset.flagged) throw new NotFoundException('media not found');
    const path = this.media.resolvePath(key);
    // 디스크에서 사라진 파일(무료 호스팅 재배포로 초기화 등) → 헤더 전에 깨끗한 404.
    // (헤더 먼저 세팅 후 스트림 ENOENT면 immutable 캐시된 깨진 200이 되어버림.)
    if (!existsSync(path)) throw new NotFoundException('media not found');
    res.setHeader('content-type', asset.contentType);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return new StreamableFile(createReadStream(path));
  }
}
