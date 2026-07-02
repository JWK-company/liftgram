// @plm SRS-019  미디어 REST — 업로드(인증) + 파일 서브(공개, 랜덤 키=capability URL). SAD-012.
import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
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
    res.setHeader('content-type', asset.contentType);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return new StreamableFile(createReadStream(this.media.resolvePath(key)));
  }
}
