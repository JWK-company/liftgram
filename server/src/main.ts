// @plm SRS-006  백엔드 부트스트랩 (ADR-018: Node/TS NestJS 모듈러 모놀리스)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = app.get(ConfigService);
  // JWT 시크릿 fail-closed — 미설정 시 부트 실패, 프로덕션에선 개발 기본값 금지.
  const jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  if (config.get<string>('NODE_ENV') === 'production' && jwtSecret === 'dev-change-me') {
    throw new Error('JWT_SECRET must be a strong non-default value in production');
  }
  // CORS — config CORS_ORIGINS(allowlist) 있으면 사용, 없으면 dev용 reflect-any.
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  app.enableCors({ origin: corsOrigins ? corsOrigins.split(',').map((s) => s.trim()) : true });
  app.setGlobalPrefix('api');
  const port = config.get<number>('PORT', 3000);
  // 0.0.0.0 바인딩 — 컨테이너/호스팅(Render 등)에서 외부 접근 가능하도록.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[server] listening on port ${port} (prefix /api)`);
}
void bootstrap();
