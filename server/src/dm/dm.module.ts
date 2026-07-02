import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGateway } from './dm.gateway';

// 다이렉트 메시지 (SRS-017 · SAD-011). PrismaModule은 @Global.
// 실시간: DmGateway(WebSocket, ADR-015). 소켓 JWT 검증용 JwtModule 임포트.
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  providers: [DmService, DmGateway],
  controllers: [DmController],
})
export class DmModule {}
