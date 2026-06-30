// 서버 베이스 URL. 개발 기본값=로컬. 실기기는 EXPO_PUBLIC_SERVER_URL로 머신 LAN IP 지정.
// @plm SRS-006
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000/api';
