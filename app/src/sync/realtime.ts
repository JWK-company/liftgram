// @plm SRS-017  DM 실시간 클라이언트 (SAD-011 · ADR-015). socket.io 단일 소켓 공유.
// SERVER_URL은 '/api' 접두 포함 — 소켓은 오리진에 연결(socket.io 기본 path /socket.io).
// 인증: auth 콜백으로 매 (재)연결마다 최신 토큰 전송(만료·회전 후에도 재인증).
// 리스너 레지스트리: 소켓이 재생성돼도 등록된 핸들러를 재부착(고아화 방지).
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '../config';
import { loadToken } from './tokenStore';
import type { DmMessage } from './serverApi';

const ORIGIN = SERVER_URL.replace(/\/api\/?$/, '');

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();
let socket: Socket | null = null;

function ensure(): Socket {
  if (!socket) {
    socket = io(`${ORIGIN}/dm`, {
      // 함수형 auth — 연결·재연결 시점에 최신 토큰을 조회해 전송.
      auth: (cb: (data: { token: string }) => void) => {
        void loadToken().then((t) => cb({ token: t ?? '' }));
      },
      transports: ['websocket'],
      reconnection: true,
    });
    // 등록된 리스너를 (새) 소켓에 재부착.
    for (const [event, set] of listeners) {
      for (const cb of set) socket.on(event, cb);
    }
  }
  if (!socket.connected) socket.connect(); // 로그인/만료 후 재연결 유도(연결 중이면 no-op)
  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

function subscribe(event: string, cb: Handler): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(cb);
  ensure().on(event, cb);
  return () => {
    set?.delete(cb);
    socket?.off(event, cb);
  };
}

export function onDmMessage(cb: (m: DmMessage) => void): () => void {
  return subscribe('dm:message', cb as Handler);
}

export function onDmTyping(cb: (e: { conversationId: string; userId: string }) => void): () => void {
  return subscribe('dm:typing', cb as Handler);
}

export function emitTyping(conversationId: string): void {
  ensure().emit('dm:typing', { conversationId });
}
