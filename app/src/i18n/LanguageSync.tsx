// 활성 언어를 모듈 레벨(setActiveLang)에 동기화한다.
// imperative t()(알림 기본 버튼 등 렌더 밖 호출)가 항상 최신 언어를 쓰게 하기 위함.
// 사용자가 한 명(로컬)이고 이벤트 핸들러는 commit 이후 실행되므로 effect 동기로 충분.
// @plm SRS-013
import { useEffect } from 'react';
import { useUser } from '../state/userContext';
import { setActiveLang } from './index';

export function LanguageSync(): null {
  const { language } = useUser();
  useEffect(() => {
    setActiveLang(language);
  }, [language]);
  return null;
}
