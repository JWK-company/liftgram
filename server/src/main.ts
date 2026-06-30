// @plm SRS-006  백엔드 부트스트랩 (ADR-018: Node/TS NestJS 모듈러 모놀리스)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(); // 웹/PWA 클라이언트(ADR-012) — 추후 origin 화이트리스트
  app.setGlobalPrefix('api');
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}/api`);
}
void bootstrap();
