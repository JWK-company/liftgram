// @plm SRS-017  DM 실시간 전송 게이트웨이 (SAD-011 · ADR-015: 자체호스팅 WebSocket).
// 핸드셰이크 미들웨어에서 JWT 검증(실패 시 connect_error로 거부) → user:<id> 룸 참가.
// 새 메시지는 REST(sendMessage)가 권위, 게이트웨이는 참여자 룸으로 push. 타이핑은 참여자 검증 후 relay.
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import type { MessageView } from './dm.service';

interface JwtPayload {
  sub: string;
  email: string | null;
}

@WebSocketGateway({ namespace: '/dm', cors: { origin: true }, maxHttpBufferSize: 1e5 })
export class DmGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // 핸드셰이크 인증 — 실패 시 next(err)로 연결 거부(클라이언트 connect_error).
  afterInit(server: Namespace): void {
    server.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const raw =
          (socket.handshake.auth?.token as string | undefined) ??
          socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (!raw) throw new Error('no token');
        const payload = await this.jwt.verifyAsync<JwtPayload>(raw);
        socket.data.userId = payload.sub;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect();
      return;
    }
    void client.join(`user:${userId}`);
  }

  // 새 메시지를 대화 참여자 전원의 user 룸으로 push(발신자 포함 — 클라이언트가 id로 dedupe).
  emitMessage(participantIds: string[], message: MessageView): void {
    if (!this.server || participantIds.length === 0) return;
    this.server.to(participantIds.map((id) => `user:${id}`)).emit('dm:message', message);
  }

  // 타이핑 표시 — 발신자가 해당 대화 참여자인지 확인 후 다른 참여자에게 relay.
  @SubscribeMessage('dm:typing')
  async onTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const conversationId = data?.conversationId;
    if (!userId || !conversationId) return;
    // 서버측 스로틀 — DB 조회 전 소켓당 1초 1회로 제한(타이핑 플러드/증폭 방지).
    const now = Date.now();
    const last = (client.data.lastTyping as number | undefined) ?? 0;
    if (now - last < 1000) return;
    client.data.lastTyping = now;
    const me = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!me) return;
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const o of others) {
      this.server.to(`user:${o.userId}`).emit('dm:typing', { conversationId, userId });
    }
  }
}
