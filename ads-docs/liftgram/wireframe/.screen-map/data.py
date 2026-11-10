# -*- coding: utf-8 -*-
# kind: tab page redirect global sheet system native entry raw dead
N=[]; E=[]
def n(id,name,kind,group,desc='',cond='',url=''): N.append(dict(id=id,name=name,kind=kind,group=group,desc=desc,cond=cond,url=url))
def e(a,b,label,ev='',t='go'): E.append(dict(a=a,b=b,label=label,ev=ev,t=t))
def pg(u,name,kind,group,desc,cond=''): n(u,name,kind,group,desc,cond,u)
# ── 탭
pg('/','운동','tab','운동','앱 첫 화면. 오늘의 운동, 루틴 목록(줄마다 종목 이름 한 줄 · 누르면 미리보기), 빠른 시작','누구나')
pg('/history','기록','tab','기록','완료한 운동 목록','누구나')
pg('/feed','피드','tab','소셜','추천(기본)·팔로잉 두 탭, 두 탭 모두 스토리, 공식 예시 글(공식 배지·AI 사진 고지·루틴 칸), 공개 범위를 고르는 글쓰기, 추천은 3글마다 광고','로그인 필요. 비로그인은 안내와 /account 버튼')
pg('/stats','분석','tab','분석','기간별 집계, 1RM, 근육 분포, 최근 PR(› 누르면 그 운동 기록), 체중 그래프(「그래프를 눌러 값 보기」)','누구나')
pg('/profile','프로필','tab','프로필','단위 등 설정(맨 끝 「안내 다시 보기」), 계정·데이터 줄, 약관 링크','누구나')
# ── 기능
pg('/workout','운동 중','page','운동','진행 중인 운동 기록. 탭바가 숨겨진다. 누를 수 있는 값은 옅은 칩(「이전」·PR·휴식·메모·kg│lb), 세트 번호·세트 방식 이름은 ▾. 루틴 횟수 범위 목표·다음 무게 제안, 「확인 필요」 칩','진행 중인 운동이 없으면 /로 넘어감')
pg('/calendar','기록(달력)','page','기록','월 달력, 연속일, 주간 목표, 날짜 메모. 다른 달이면 「오늘」 칩','누구나')
pg('/history/[id]','기록 상세','page','기록','지난 운동 상세, 수정, 삭제, 다시 시작','없는 id는 「세션을 찾을 수 없어요」')
pg('/exercises','종목 목록','page','운동','종목 카탈로그, 검색, 필터','누구나')
pg('/exercise/[id]','운동 상세','page','운동','종목 설명, 자세, 진행 그래프, 대체운동','없는 id는 404')
pg('/exercises/new','커스텀 운동','page','운동','내 종목 만들기','누구나')
pg('/exercises/[id]/edit','운동 수정','page','운동','내 종목 고치기','없는 id는 오류 토스트')
pg('/routines/new','새 루틴','page','운동','새 루틴 만들기','누구나')
pg('/routines/[id]','루틴 편집','page','운동','기존 루틴 편집','없는 id의 결과는 미확인')
pg('/program','프로그램 생성(삭제됨)','redirect','넘김','2026-11-05 기능 삭제. 옛 주소는 운동 탭으로 넘김','누구나')
pg('/gyms','주변 헬스장','page','소셜','위치 기반 헬스장 검색','위치 권한 필요')
pg('/feed/[postId]','게시물(글 보기)','page','소셜','글 카드 하나. 💬 를 누르면 댓글 시트가 아래에서 올라온다. 공유 링크·앱 링크·알림이 여기로 온다(2026-11-09)','로그인 필요(비로그인은 로그인 안내 → 로그인 뒤 이 글로) · 볼 수 없는 글은 「볼 수 없는 글이에요」 · 댓글 알림(?comments=1)이면 시트를 바로 연다')
pg('/explore','발견','page','소셜','검색, 인기 태그, 추천, 인기 글','로그인 필요. 비로그인은 로그인 안내')
pg('/discover','사람 찾기','page','소셜','사용자 검색, 팔로우. 시행 전까지 피드 「발견」 탭에 같은 내용, 시행 뒤에는 팔로잉이 빌 때 피드에 함께 나옴','로그인 필요')
pg('/hashtag/[tag]','#태그','page','소셜','태그가 달린 공개 글','로그인 필요')
# [원본] pg('/u/[userId]','공개 프로필','page','소셜','다른 사람의 프로필','로그인 필요')
pg('/u/[userId]','공개 프로필','page','소셜','다른 사람의 프로필 · 이름 옆 「코치」 배지(활성 회원이 있을 때만) · 버튼 줄 아래 코칭 줄 — 연결이 없으면 누구에게나 두 버튼 「코치로 요청」(범위 시트)·「내 회원으로 초대」(확인창) · 내게 이미 코치가 있으면 요청 버튼 대신 「이미 코치가 있어요」 안내(누르면 /coaching) · 연결돼 있으면 「코칭 중」/「코칭 수락 대기」(v0.91.0 · SPEC-052)','로그인 필요 · 코칭 줄은 관계 목록을 다 읽은 뒤 그린다(그 전에는 자리만)')
pg('/u/[userId]/follows','팔로워·팔로잉','page','소셜','팔로우 목록','로그인 필요')
pg('/messages','메시지','page','소셜','대화 목록','로그인 필요')
pg('/messages/[id]','대화방','page','소셜','대화, 요약 카드','로그인·참여자')
pg('/messages/new','새 메시지','page','소셜','사람 고르기 — 한 명이면 1:1 대화, 여럿이면 단체 대화(이름 칸)','로그인 필요')
# [원본] pg('/people','사람','page','소셜','이름 찾기 · 팔로잉/팔로워 탭 · 줄마다 팔로우·메시지','로그인 필요')
pg('/people','사람','page','소셜','이름 찾기 · 팔로잉/팔로워 탭 · 줄마다 팔로우·메시지 · 이름 옆 「코치」 배지(활성 회원이 있을 때만 · v0.91.0)','로그인 필요')
pg('/notifications','알림','page','소셜','알림 목록, 열면 모두 읽음','로그인 필요')
pg('/bookmarks','저장한 게시물','page','소셜','저장한 글 목록','로그인 필요')
# [원본] pg('/coaching','코칭','page','코칭','코치·회원 관계와 요청','로그인 필요')
# [원본] pg('/coaching','코칭','page','코칭','자격 아님 고지 · (코치만) 초대 코드 카드(코드 만들기·링크 복사·공유·새로 만들기) · 내 코치 · 코드로 연결(8자리 → 범위 시트) · 담당 회원(줄마다 이번 주 n회·마지막 운동·코치 루틴 n회 · 3일 이상 쉬면 「n일째 쉬는 중」, 쉰 회원이 위로 · 줄을 누르면 회원 화면) · 트레이너 찾기(「코칭 요청」 → 범위 시트). 줄 버튼은 「수락」 하나, 나머지는 ⋯ 시트(v0.87.0~0.90.0 · SPEC-050)','로그인 필요(비로그인은 로그인 안내) · 초대 카드는 코칭 의향을 켠 사람만')
pg('/coaching','코칭','page','코칭','자격 아님 고지(「코치」 표시는 코칭 연결 뜻) · 내 코치 · 코드로 연결(8자리 → 범위 시트) · 담당 회원(줄마다 이번 주 n회·마지막 운동·코치 루틴 n회 · 3일 이상 쉬면 「n일째 쉬는 중」, 쉰 회원이 위로 · 줄을 누르면 회원 화면) · 초대 코드 카드(누구나 · 담당 회원 목록 아래 · 코드 만들기·링크 복사·공유·새로 만들기 · 코치가 아니면 「코드 만들기」는 보조 버튼) · 코치 찾기(결과 줄 「코치」 배지 · 「코치로 요청」 → 범위 시트). 줄 버튼은 「수락」 하나, 나머지는 ⋯ 시트(v0.87.0~0.91.0 · SPEC-050 · SPEC-052)','로그인 필요(비로그인은 로그인 안내)')
# [원본] pg('/coaching/join','코치와 연결(초대 링크)','page','코칭','코치 카드(이름·코치 배지·소개·태그) · 코드 4-4 · 「연결하기」 → 범위 시트 → 연결 뒤 /coaching. 범위 시트는 처음 한 번 저절로 열린다(v0.87.0 · SPEC-050 P1b)','코드 없음·엉터리 → 「초대 코드가 없어요」 · 비로그인 → 「로그인하고 연결해요」(로그인 뒤 이 화면으로) · 못 쓰는 코드 → 오류 + 「코칭 화면으로」')
pg('/coaching/join','코치와 연결(초대 링크)','page','코칭','코치 카드(이름 · 「코치」 배지는 활성 회원이 있을 때만 · 소개·태그는 코치 찾기 노출을 켰을 때만) · 코드 4-4 · 「연결하기」 → 범위 시트 → 연결 뒤 /coaching. 범위 시트는 처음 한 번 저절로 열린다(v0.87.0 · SPEC-050 P1b · v0.91.0 SPEC-052)','코드 없음·엉터리 → 「초대 코드가 없어요」 · 비로그인 → 「로그인하고 연결해요」(로그인 뒤 이 화면으로) · 못 쓰는 코드 → 오류 + 「코칭 화면으로」')
pg('/coaching/m/[memberId]','회원 화면(코치용)','page','코칭','청록 띠 「○○님 기록 · 코칭 중」+「나가기」 · 기록│분석│루틴 탭(?tab=). 기록 = 날짜별 운동(코치 루틴 칩·코멘트 수 · 펼치면 세트·처방 대 실제·코멘트) · 분석 = 기간 고르기·요약(체중 카드는 체중 공개 때만) · 루틴 = 보낸 루틴 + 「새 루틴 짜 주기」 + 회원이 만든 루틴(처방 고치기). 읽기만, 오프라인 캐시 안 함(v0.88.0~0.90.0 · SPEC-050 P2~P4)','코치 쪽 활성 연결만 · 기록 보기 꺼짐 → 「회원이 기록 보기를 꺼 두었어요」 · 루틴 받기 꺼짐 → 「회원이 루틴 처방을 꺼 두었어요」(이 기기 초안은 보임) · 지난 기록 꺼짐 → 「연결한 날 뒤 기록만 보여요」 · 해지·연결 없음 → 「코칭이 끝났어요」 · 읽기 실패 → 다시 시도')
pg('/offline','오프라인이에요','page','시스템','받아 두지 못한 화면의 대체 화면','서비스 워커가 보여 줌')
pg('/gear','내 장비함','page','프로필','보유 장비 관리','누구나')
pg('/blocked','차단 목록','page','프로필','차단한 사람과 해제','로그인 필요')
pg('/account','계정·로그인','page','계정','로그인 폼, 또는 계정·보안·백업·가져오기·삭제','상태에 따라 내용이 다름')
pg('/account/import','다른 앱 기록 가져오기','page','계정','Strong·Hevy 기록 가져오기','누구나')
pg('/signin','로그인','page','계정','로그인 폼(계정 화면과 같은 컴포넌트). 폼 전환 때 주소만 이렇게 바뀜','이미 로그인 상태면 계정 화면')
pg('/signup','가입','page','계정','가입 폼(같은 컴포넌트). 폼 전환 때 주소만 이렇게 바뀜','이미 로그인 상태면 계정 화면')
pg('/forgot','비밀번호 찾기','page','계정','재설정 메일 요청','메일 기능이 켜져 있을 때 링크가 보임')
pg('/reset','새 비밀번호','page','계정','메일에서 새 비밀번호 설정','토큰 필요')
pg('/verify-email','이메일 확인','page','계정','열자마자 이메일 확인','토큰 필요')
pg('/auth/complete','로그인 완료','page','계정','소셜 로그인 착지, 코드 교환','코드 필요')
pg('/app','안드로이드 앱 안내','page','계정','공개 APK 안내와 설치 순서','누구나')
pg('/app/continue','앱에 로그인','page','계정','웹 계정을 앱으로 넘기는 확인','앱에서 만든 주소만 유효')
pg('/profile/feedback','의견 보내기','page','계정','앱 사용자가 보내는 의견과 내가 보낸 목록','로그인 사용자(비로그인은 로그인 안내)')
pg('/terms','이용약관','page','법적','약관','누구나')
pg('/privacy','개인정보처리방침','page','법적','처리방침','누구나')
pg('/licenses','오픈소스 고지','page','법적','라이선스 고지','누구나')
pg('/diag/db','로컬 저장소 자가진단','page','개발','기기 DB 왕복 검사','운영 빌드는 404')
pg('/account/delete','계정 삭제(공개 주소)','redirect','넘김','Play 제출용 공개 주소. /account#delete-account로 넘김','비로그인은 로그인 폼이 보임')
pg('/stats/summary','성과 요약(옛 주소)','redirect','넘김','/stats로 넘기는 옛 주소','누구나')
# ── 전역
n('g.tabbar','하단 탭바','global','전역','/workout과 인증 화면을 뺀 모든 화면 아래에 있음. 그래서 어디서든 다섯 탭으로 갈 수 있다')
n('g.bar','운동 진행 막대','global','전역','「{name} 진행 중」. 운동으로 복귀, 취소','활성 운동이 있고 /workout이 아닐 때')
n('g.sync','백업 경고 띠','global','전역','기록이 서버에 백업되지 않을 때 안내. 하루 접기 가능','/account 제외')
n('g.dist','앱 배포 띠','global','전역','새 앱, 필수 업데이트, 전용 앱으로 바꾸기','홈에서만. 운동 중과 iOS는 안 뜸')
n('g.boot','앱 시작(모든 화면 위)','global','전역','첫 실행과 저장소 상태에 따라 전체 화면 가드가 뜨는 자리')
# ── 앱 밖
for i,nm,d in [('x.url','주소 직접 입력·PWA 시작','start_url은 /. 모든 주소는 입력으로도 열 수 있다'),('x.mail','메일 링크','인증 메일 5종. 링크는 APP_URL 고정'),('x.oauth','소셜 로그인 복귀','Google·Kakao·Naver·Apple 동의 화면에서 복귀'),('x.applink','앱 링크·유니버설 링크','/feed/, /u/, /hashtag/ 대상. 공유 링크를 만드는 코드는 없음'),('x.scheme','liftgram:// 스킴','workout·auth·start 세 갈래'),('x.sw','서비스 워커','네트워크 실패 때 대체 화면'),('x.play','Play 제출 정보','스토어 계정 삭제 안내로 제출하는 공개 주소'),('x.notif','앱 내 알림 탭','서버 푸시는 없음. 앱 안 알림 목록의 이동'),('x.nat','앱 자체 화면','Android 잠금 화면, 알림 카드')]:
    n(i,nm,'entry','앱 밖',d)
# 탭바
# [원본] for u,l,ev in [('/','운동','C/ui/TabBar.tsx:36'),('/history','기록','C/ui/TabBar.tsx:43'),('/feed','피드','C/ui/TabBar.tsx:50'),('/stats','분석','C/ui/TabBar.tsx:67'),('/profile','프로필','C/ui/TabBar.tsx:70')]:
# [개선] 탭 순서 피드·운동·기록·분석·프로필(2026-11-10)
for u,l,ev in [('/feed','피드','C/ui/TabBar.tsx:51'),('/','운동','C/ui/TabBar.tsx:36'),('/history','기록','C/ui/TabBar.tsx:44'),('/stats','분석','C/ui/TabBar.tsx:68'),('/profile','프로필','C/ui/TabBar.tsx:71')]:
    e('g.tabbar',u,l,ev)
e('x.url','/','PWA start_url','F/public/manifest.json','ext')
# 운동 흐름
e('g.bar','/workout','막대 누르기','C/GlobalWorkoutBar.tsx:153')
e('/','/workout','운동 시작·이어 하기','C/routines/RoutinesClient.tsx:263')
e('/routines/[id]','/workout','이 루틴으로 시작','C/routines/RoutineEditor.tsx:615')
e('/feed','/workout','피드 카드에서 시작','C/useStartGuard.tsx:58 · C/feed/WorkoutBox.tsx:63')
e('/history/[id]','/workout','다시 하기','C/analytics/WorkoutDetailClient.tsx:45')
e('s.summary','/workout','이 운동 다시 시작','C/session/WorkoutSummary.tsx:60')
e('x.scheme','/workout','liftgram://workout','C/LockBridge.tsx:22','ext')
e('/workout','/','세션 닫기, 세션 없음','C/session/ActiveWorkout.tsx:360','redir')
e('/','/exercises','앱바 돋보기','C/routines/RoutinesClient.tsx:387')
e('/stats','/exercises','안 한 근육 칩','C/analytics/MuscleBalanceCard.tsx:229')
e('/exercises','/exercise/[id]','종목 줄','C/CatalogClient.tsx:403')
e('/stats','/exercise/[id]','1RM 줄, 변화 카드','C/analytics/StatsClient.tsx:283 · C/analytics/ExerciseChangeCards.tsx:67')
e('/workout','/exercise/[id]','종목 ⋯ 메뉴 「운동 정보」','C/session/ExerciseBlock.tsx:732')
e('/exercise/[id]','/exercise/[id]','대체운동 링크','F/app/exercise/[id]/page.tsx:254')
e('/exercises','/exercises/new','머리 + 버튼','F/app/exercises/page.tsx:36')
e('/exercises','/exercises/[id]/edit','내 종목 줄 연필','C/CatalogClient.tsx:394')
e('/','/routines/new','새 루틴 만들기','C/routines/RoutinesClient.tsx:519')
e('s.routine-actions','/routines/[id]','편집','C/routines/RoutinesClient.tsx:722')
e('/feed','/gyms','주변 헬스장 찾기 줄','C/feed/FeedClient.tsx:479')
e('/gyms','/feed','뒤로','C/NearbyGymsClient.tsx:86','back')
e('/','/calendar','주간 요약','C/routines/WeekSummary.tsx:115')
e('/','/history','최근 운동 「전체」','C/routines/WeekSummary.tsx:196')
e('/','/history/[id]','최근 운동 줄','C/routines/WeekSummary.tsx:208')
e('/history','/calendar','목록·달력 전환','C/analytics/RecordsHeader.tsx:20')
e('/calendar','/history','목록·달력 전환','C/analytics/RecordsHeader.tsx:19')
e('/history','/history/[id]','기록 줄','C/analytics/HistoryClient.tsx:117')
e('/calendar','/history/[id]','날짜의 운동','C/analytics/CalendarClient.tsx:571')
e('/workout','/history/[id]','지난 세트','C/session/ExerciseBlock.tsx:828')
e('/account/import','/history','가져오기 완료 후','C/sync/ImportFlow.tsx:999')
e('/account/import','/stats','가져오기 완료 후','C/sync/ImportFlow.tsx:1005')
e('/program','/','옛 주소 넘김','F/app/program/page.tsx:22','redir')
e('/history/[id]','/history','기록 삭제 후','C/analytics/WorkoutDetailClient.tsx:301','redir')
e('/routines/new','/','저장·나가기','C/routines/RoutineEditor.tsx:339','redir')
e('/routines/[id]','/','저장·나가기','C/routines/RoutineEditor.tsx:346','redir')
e('/exercises/new','/exercises','저장 후','C/ExerciseFormClient.tsx:120','redir')
e('/exercises/[id]/edit','/exercises','저장 후','C/ExerciseFormClient.tsx:120','redir')
e('/offline','/','운동 탭으로','F/app/offline/page.tsx:17')
e('/app','/','홈 링크','F/app/app/AppPageClient.tsx:107')
# 소셜
e('/feed','/people','머리 👤 사람','C/feed/FeedClient.tsx:434')
e('/people','/u/[userId]','사람 줄','C/feed/PeopleClient.tsx:210')
e('/people','/messages/[id]','줄의 「메시지」','C/feed/PeopleClient.tsx:115','redir')
e('/people','/feed','뒤로','C/feed/PeopleClient.tsx:129','back')
e('/feed','/explore','머리 돋보기','C/feed/FeedClient.tsx:276')
e('/feed','/messages','머리 메시지','C/feed/FeedClient.tsx:282')
e('/feed','/notifications','머리 종','C/feed/FeedClient.tsx:288')
e('/feed','/u/[userId]','글 작성자','C/feed/PostCard.tsx:99')
e('/feed','/hashtag/[tag]','본문 #태그','C/feed/HashtagText.tsx:23')
e('/explore','/hashtag/[tag]','태그','C/feed/ExploreClient.tsx:165')
e('/explore','/u/[userId]','추천·검색 결과','C/feed/ExploreClient.tsx:295')
e('/messages','/people','빈 목록 버튼','C/dm/ConversationsClient.tsx:109')
e('/discover','/u/[userId]','사람 줄','C/feed/DiscoverClient.tsx:112')
e('/u/[userId]','/u/[userId]/follows','팔로워·팔로잉 숫자','C/feed/UserProfileClient.tsx:182')
e('/u/[userId]/follows','/u/[userId]','사람 줄','C/feed/FollowListClient.tsx:90')
e('/u/[userId]','/messages/[id]','메시지 버튼','C/feed/UserProfileClient.tsx:220')
e('/messages','/messages/[id]','대화 줄','C/dm/ConversationsClient.tsx:122')
e('/messages','/messages/new','머리 ✎ 새 메시지','C/dm/ConversationsClient.tsx:81')
e('/messages/new','/messages/[id]','대화 시작·단체 대화 만들기 후','C/dm/NewGroupClient.tsx:94','redir')
e('/messages/[id]','/messages','방 나간 후','C/dm/ConversationClient.tsx:176','redir')
e('/notifications','/u/[userId]','팔로우 알림','C/dm/NotificationsClient.tsx:39')
e('/notifications','/feed/[postId]','좋아요 알림 · 댓글 알림(시트까지 바로)','C/dm/NotificationsClient.tsx:45')
e('/notifications','/messages/[id]','코칭 요약 알림','C/dm/NotificationsClient.tsx:51')
e('/notifications','/messages','대화를 못 열었을 때','C/dm/NotificationsClient.tsx:53')
e('/notifications','/feed','글이 없을 때','C/dm/NotificationsClient.tsx:41')
e('x.notif','/notifications','목록 열기','C/dm/NotificationsClient.tsx:21','ext')
e('x.applink','/feed/[postId]','앱 링크 · 공유 링크(글 카드 공유 버튼)','C/AppWebLinkBridge.tsx:15','ext')
e('/feed/[postId]','/account','비로그인 안내 「로그인 / 가입」(로그인 뒤 이 글로)','C/feed/CommentsClient.tsx:94')
e('x.applink','/u/[userId]','앱 링크','src/mobile/android/app/src/main/AndroidManifest.xml:48','ext')
e('x.applink','/hashtag/[tag]','앱 링크','src/mobile/android/app/src/main/AndroidManifest.xml:49','ext')
# 프로필·계정
for u,l,ev in [('/account','계정 줄·백업 파일','C/profile/ProfileClient.tsx:363'),('/gear','내 장비함 줄','C/profile/ProfileClient.tsx:372'),('/coaching','코칭 줄(로그인 시)','C/profile/ProfileClient.tsx:397'),('/bookmarks','저장한 게시물 줄(로그인 시)','C/profile/ProfileClient.tsx:385'),('/blocked','차단 목록 줄(로그인 시)','C/profile/ProfileClient.tsx:391'),('/terms','맨 아래 약관','C/profile/ProfileClient.tsx:455'),('/privacy','맨 아래 처리방침','C/profile/ProfileClient.tsx:458'),('/licenses','맨 아래 오픈소스','C/profile/ProfileClient.tsx:462')]:
    e('/profile',u,l,ev)
e('g.sync','/account','경고 띠','C/sync/SyncHealthBanner.tsx:68')
e('s.nudge','/account','로그인하고 보관하기','C/session/LoginNudgeSheet.tsx:35')
e('/feed','/account','비로그인 안내 「로그인 / 가입」','C/feed/FeedClient.tsx:381')
e('/explore','/account','비로그인 안내 「로그인 / 가입」','C/feed/ExploreClient.tsx:150')
e('/coaching','/account','비로그인 안내','C/coaching/CoachingClient.tsx:289')
e('s.switch','/account','앱 바꾸기 시트','C/appdist/SwitchToAppSheet.tsx:177')
e('/auth/complete','/account','실패 때','F/app/auth/complete/CompleteClient.tsx:73')
e('/verify-email','/account','무효 토큰 안내','F/app/verify-email/VerifyClient.tsx:43')
e('/reset','/account','완료 후','F/app/reset/ResetClient.tsx:38')
e('/auth/complete','/','성공 후','F/app/auth/complete/CompleteClient.tsx:46','redir')
e('/account','/account/import','가져오기 카드','C/sync/ImportCard.tsx:123')
e('/account','/forgot','비밀번호 찾기 링크','C/profile/AuthClient.tsx:386')
e('/account','/terms','가입 동의','C/profile/AuthClient.tsx:399')
e('/account','/privacy','가입 동의','C/profile/AuthClient.tsx:403')
e('/account','/app/continue','앱: 웹 계정으로 계속','C/auth/AppContinueEntry.tsx:59')
e('/reset','/forgot','실패 때','F/app/reset/ResetClient.tsx:47')
e('s.switch','/app','앱 바꾸기 시트','C/appdist/SwitchToAppSheet.tsx:111')
e('x.mail','/verify-email','이메일 확인 메일','B/internal/mailer/template.go:44','ext')
e('x.mail','/reset','비밀번호 재설정 메일','B/internal/mailer/template.go:57','ext')
e('x.mail','/account','로그인 방법 안내 메일','B/internal/mailer/template.go:80','ext')
e('x.mail','/forgot','변경·연결 알림 메일','B/internal/mailer/template.go:90','ext')
e('x.oauth','/auth/complete','성공 복귀','B/internal/oauth/handler.go:259','ext')
e('x.oauth','/account','실패 복귀(?err=)','B/internal/oauth/handler.go:214','ext')
e('x.sw','/offline','네트워크 실패 대체','src/frontend/sw/sw.template.js:187','ext')
e('x.sw','/stats','/stats/summary 캐시 넘김','src/frontend/sw/sw.template.js:137','ext')
e('x.play','/account/delete','계정 삭제 안내 주소','F/app/account/delete/page.tsx:1','ext')
e('/account/delete','/account','#delete-account로 넘김','F/app/account/delete/page.tsx:1','redir')
e('/stats/summary','/stats','넘김','F/app/stats/summary/page.tsx:11','redir')
e('x.nat','/workout','잠금 화면 「앱에서 하기」','src/mobile/android/app/src/main/java/org/tarae/liftgram/LockWorkoutActivity.java:1082','ext')
# 운영 화면은 앱에 없다(SPEC-033). 운영 웹 liftgram-admin.tarae.org 로 옮겼다.
n('x.admin','운영 웹(별도 사이트)','entry','앱 밖','요약·통계·신고 검토·사용자 의견·운영 피드백·운영 상태·설정. 앱에서 들어가는 입구는 없다','운영진만(Cloudflare Access + 비밀번호)','https://liftgram-admin.tarae.org')
e('/profile','/profile/feedback','의견 보내기 줄','C/profile/ProfileClient.tsx:321')
# 뒤로 가기
for a,b,ev in [('/feed/[postId]','/feed','C/feed/CommentsClient.tsx:73'),('/explore','/feed','C/feed/ExploreClient.tsx:131'),('/discover','/feed','C/feed/DiscoverClient.tsx:78'),('/hashtag/[tag]','/feed','C/feed/PostListScreen.tsx:80'),('/bookmarks','/profile','C/feed/BookmarksClient.tsx:25'),('/u/[userId]','/feed','C/feed/UserProfileClient.tsx:263'),('/messages','/feed','C/dm/ConversationsClient.tsx:73'),('/notifications','/feed','C/dm/NotificationsClient.tsx:86'),('/messages/[id]','/messages','C/dm/ConversationClient.tsx:239'),('/messages/new','/messages','C/dm/NewGroupClient.tsx:107'),('/terms','/profile','C/legal/LegalPage.tsx:20'),('/privacy','/profile','C/legal/LegalPage.tsx:20'),('/licenses','/profile','C/legal/LegalPage.tsx:20'),('/coaching','/profile','C/coaching/CoachingClient.tsx:327'),('/gear','/profile','C/profile/MyGearClient.tsx:62'),('/blocked','/profile','C/moderation/BlockedUsersClient.tsx:58'),('/account','/profile','C/profile/AuthClient.tsx:190'),('/account/import','/account','C/sync/ImportFlow.tsx:652'),('/exercises','/','F/app/exercises/page.tsx:31'),('/program','/','C/routines/ProgramGeneratorClient.tsx:251'),('/exercise/[id]','/exercises','F/app/exercise/[id]/page.tsx:119'),('/exercises/new','/exercises','C/ExerciseFormClient.tsx:133'),('/exercises/[id]/edit','/exercises','C/ExerciseFormClient.tsx:133'),('/history/[id]','/history','C/analytics/WorkoutDetailClient.tsx:122')]:
    e(a,b,'뒤로',ev,'back')
# ── 시트 도우미: 표 그대로
def sh(id,name,parent,label,ev,desc='',cond='',group=None,kind='sheet'):
    gp=group or {'/workout':'운동 중','/':'운동','/routines/[id]':'운동','/routines/new':'운동'}.get(parent,'기타')
    n(id,name,kind,gp,desc,cond); e(parent,id,label,ev,'open')
# 전역 가드
for id,name,ev,desc,cond in [
 # [원본] ('s.onboard','온보딩','C/OnboardingOverlay.tsx:107','2장 첫 안내. 경력과 코치 의향 저장, 건너뛰기','첫 실행 1회'),
 ('s.onboard','온보딩','C/OnboardingOverlay.tsx:107','2장 첫 안내. 둘째 장은 운동 경력만 저장(트레이너·코치 질문 없음 · 켜 둔 코치 찾기 노출은 그대로), 건너뛰기','첫 실행 1회'),
 ('s.schema','새 버전으로 새로고침해 주세요','C/SchemaGuard.tsx:86','뒤 화면을 막는 알림창','기기 DB 스키마가 번들보다 높을 때'),
 ('s.tabseal','다른 탭에서 열려 있어요','C/TabElsewhereOverlay.tsx:47','이 탭을 멈추고 「여기서 계속하기」','쓰기 주인을 빼앗겼거나 디스크가 바깥에서 바뀜'),
 ('s.tabold','옛 버전 탭 띠','C/TabElsewhereOverlay.tsx:83','상단 띠 안내','다른 탭에 옛 버전이 열려 있음'),
 ('s.tabimport','다른 탭에서 기록을 가져오는 중이에요','C/sync/ImportElsewhereNotice.tsx:48','새로고침으로만 풀리는 덮개','다른 탭이 가져오기 중이거나 방금 끝남'),
 ('s.update','업데이트하는 중이에요','C/UpdateOverlay.tsx:53','진행, 실패, 운동 중 차단 안내','프로필 「업데이트」 또는 필수 업데이트 자동'),
 ('s.owner','이 기기에 다른 계정의 기록이 있어요','C/sync/AccountGuard.tsx:23','로그아웃 또는 내보내고 지운 뒤 계속','계정 충돌'),
]:
    sh(id,name,'g.boot',{'s.update':'업데이트 시작'}.get(id,'조건 충족 때 자동'),ev,desc,cond,'전역 가드')
e('/profile','s.update','앱 버전 줄 「업데이트」','C/profile/AppVersionRow.tsx:73','open')
sh('s.story','스토리 뷰어','/feed','스토리 누르기','C/feed/StoryViewer.tsx:74','전체 화면 스토리, 신고','',"피드")
sh('s.compose','새 글','/feed','글쓰기 버튼','C/feed/FeedClient.tsx:397','글 작성, 장비 태그, 이미지','',"피드")
sh('s.picker','운동 추가·바꾸기(종목 피커)','/workout','종목 추가·교체','C/session/ExercisePickerScreen.tsx:254','전체 화면 종목 선택','','운동 중')
e('/routines/new','s.picker','종목 추가','C/routines/RoutineEditor.tsx:528','open'); e('/routines/[id]','s.picker','종목 추가·교체','C/routines/RoutineEditor.tsx:528','open')
sh('s.finder','스무고개 찾기','/exercises','찾기 버튼','C/ExerciseFinderWizard.tsx:99','부위→동작→기구 2단계 마법사','','운동')
e('s.picker','s.finder','찾기 버튼','C/ExercisePickerScreen.tsx:295','open')
W='/workout'
for id,name,label,ev,desc,cond in [
 ('s.pr','PR 축하','세트 체크','C/PrCelebration.tsx:83','터치를 막지 않고 2.4초 뒤 사라짐','최고 기록일 때'),
 ('s.lockcheck','잠금화면 기록 확인 중','앱 열기','C/session/LockNotices.tsx:85','잠금 화면 기록을 합치는 동안 막음','앱 안, 첫 합치기 전'),
 ('s.summary','운동 요약','운동 종료 확인 후','C/session/ActiveWorkout.tsx:293','주소는 그대로 두고 내용만 교체',''),
 ('s.finish','운동 종료','완료 버튼','C/session/ActiveWorkout.tsx:685','종료 확인창',''),
 ('s.discard','운동 취소','⋯ 메뉴','C/session/ActiveWorkout.tsx:737','기록을 지울지 묻는 확인창',''),
 ('s.wmenu','세션 ⋯ 메뉴','⋯ 탭','C/session/ActiveWorkout.tsx:430','이름 변경, 취소',''),
 ('s.rename','운동 이름 변경','이름 탭','C/session/ActiveWorkout.tsx:582','이름 입력',''),
 ('s.superset','슈퍼셋으로 묶을 종목 선택','종목 메뉴','C/session/ActiveWorkout.tsx:622','짝 고르기',''),
 ('s.swapscope','루틴도 바꿀까요?','종목 교체','C/session/ActiveWorkout.tsx:662','교체 범위 선택','루틴 운동에서 교체'),
 ('s.weighin','오늘 체중','맨 위 「오늘 체중」 줄','C/session/WeighInSheet.tsx:696','체중 ± · 인바디(골격근량·체지방률) 펼쳐 적기 · 오늘 기록이 있으면 그 줄 고치기',''),
 ('s.muscle','오늘 근육','헤더 버튼','C/session/TodayMuscleSheet.tsx:82','오늘 자극 부위','근육 그림 설정 켬'),
 ('s.lockready','잠금화면 운동 화면 준비 카드','운동 중 자동','C/session/LockReadiness.tsx:107','허용 항목 안내','앱 안, 허용 항목 빠짐'),
 ('s.lockdiff','잠금화면 값 불일치 안내','운동 중 자동','C/session/LockNotices.tsx:98','인라인 알림','값이 다를 때'),
 ('s.rest','휴식 막대','세트 완료','C/session/ActiveWorkout.tsx:508','고정 휴식 타이머','휴식 중'),
 ('s.emenu','종목 ⋯ 메뉴','종목 ⋯ 탭','C/session/ExerciseBlock.tsx:724','운동 정보, 슈퍼셋, 교체, 삭제',''),
 ('s.slots','조합별 기록','칸 전환','C/session/ExerciseBlock.tsx:1078','칸별 기록 보기','유산소 아님, 다른 칸 있음'),
 # [원본] ('s.resttime','휴식 시간','휴식 설정','C/session/ExerciseBlock.tsx:1153','휴식 길이 설정',''),
 ('s.resttime','휴식 시간','블록 도구 줄 ⏱ 휴식 칩','C/session/BlockTools.tsx:109 · C/session/ExerciseBlock.tsx:1534','일반 세트는 한 줄(15초 단위). 세트 방식 블록은 「기본 세트」 + 그 블록에 나오는 종류만 한 줄씩(웜업 사이·피더 전·탑 직전·탑 뒤·백오프 사이·첫 본세트 직전·본세트 사이·세트 사이(점점 늘림)) · 바꾼 줄은 점 · 「권장값으로」 · 종류별 값은 이 종목에 계속 쓰인다(칩에도 점) · 이번 운동에 저장(v0.88.0 · SPEC-051)',''),
 ('s.rmex','운동 삭제','종목 메뉴','C/session/ExerciseBlock.tsx:1186','종목 삭제 확인',''),
 ('s.variant','변형 선택','변형 칩','C/ui/RecordSlotSelector.tsx:183','기록 칸 변형',''),
 ('s.settype','세트 타입','세트 타입 탭','C/session/SetRowEdit.tsx:553','세트 종류 선택',''),
 ('s.setvar','세트 옵션(원암·원레그)','변형 칸 탭','C/session/SetRowEdit.tsx:594','원암·투암, 그립·부착물(종목 전체에 적용)',''),
 ('s.rir','몇 개 더 할 수 있었나요?','여유 칩','C/session/RirSheet.tsx:76','여유 입력','세트 힘든 정도 설정 켬'),
]:
    sh(id,name,W,label,ev,desc,cond)
e('g.bar','s.discard','취소','C/GlobalWorkoutBar.tsx:199','open')
for id,name,label,ev,desc,cond in [
 ('s.finroutine','루틴과 달라졌어요','완료 후','C/session/FinishRoutineSheets.tsx:57','루틴 반영 질문','변경이 있을 때'),
 ('s.finpick','루틴에 남길 변경','고르기','C/session/FinishRoutineSheets.tsx:118','반영할 변경 고르기',''),
 ('s.finname','루틴으로 저장할까요?','빠른 운동 완료','C/session/FinishRoutineSheets.tsx:235','이름 입력 후 저장',''),
 ('s.nudge','이 기록은 이 폰에만 있어요','완료 후','C/session/LoginNudgeSheet.tsx:17','로그인 권유','비로그인, 1·3회째 뒤 7일마다'),
 ('s.share','피드에 공유','공유 버튼','C/session/WorkoutSummary.tsx:310','요약에서 글 올리기','로그인 필요'),
 ('s.nameroutine','이 운동으로 루틴 만들기','루틴 만들기','C/session/WorkoutSummary.tsx:339','이름 입력',''),
]:
    sh(id,name,'s.summary',label,ev,desc,cond,'운동 중')
e('/history/[id]','s.nameroutine','메뉴 「루틴 만들기」','C/analytics/WorkoutDetailClient.tsx:278','open')
e('/calendar','s.share','이번 달 자랑하기','C/analytics/CalendarClient.tsx:212','open')
H='/'
for id,name,label,ev,desc in [
 ('s.ctopic','크리에이터 주제 시트','프로 루틴·초보자 루틴 카드','C/routines/CreatorRoutineSheet.tsx:55','주제 안내'),
 ('s.cver','크리에이터 루틴 시트','버전 카드','C/routines/CreatorRoutineSheet.tsx:194','버전 상세와 저장'),
 ('s.cdupe','이미 있는 루틴','저장 이름 중복','C/routines/CreatorRoutineSheet.tsx:181','중복 안내'),
 ('s.sched','주간 스케줄 편집','운동 홈(S-01) 주간 스케줄 카드 첫 줄 오른쪽 「📅 편집」으로 연다 — 버튼 모습은 S-01 사진','C/routines/ScheduleEditor.tsx:134','요일별 배정'),
 ('s.schedday','요일 배정 시트','요일 탭','C/routines/ScheduleEditor.tsx:95','요일에 배정'),
 ('s.schedrm','주간 스케줄 삭제','삭제 탭','C/routines/ScheduleEditor.tsx:121','삭제 확인'),
 ('s.routine-actions','루틴 동작 시트','루틴 메뉴','C/routines/RoutinesClient.tsx:714','루틴 메뉴'),
 ('s.rmroutine','루틴 삭제','동작 시트 삭제','C/routines/RoutinesClient.tsx:747','삭제 확인'),
 ('s.active','진행 중인 운동이 있어요','새로 시작','C/routines/RoutinesClient.tsx:784','이어서 하기, 그만두고 새로 시작'),
]:
    sh(id,name,H,label,ev,desc)
e('/feed','s.active','새로 시작','C/feed/WorkoutBox.tsx:373','open'); e('s.summary','s.active','다시 시작','C/session/WorkoutSummary.tsx:336','open'); e('/history/[id]','s.active','다시 하기','C/analytics/WorkoutDetailClient.tsx:275','open')
R='/routines/[id]'
for id,name,label,ev,desc in [
 ('s.rxtype','세트 타입(처방)','세트 번호','C/routines/PrescriptionRows.tsx:471','세트 종류 바꾸기 · 복사 · 삭제(루틴 편집의 세트 메뉴)'),
 # [원본] ('s.rmenu','루틴 ⋯ 메뉴','⋯ 탭','C/routines/RoutineEditor.tsx:350','루틴 편집 메뉴'), — S-104 v0.84.5 에서 없앴다(화면 맨 아래 「루틴 삭제」)
 ('s.rss','루틴 슈퍼셋 짝','종목 메뉴','C/routines/RoutineEditor.tsx:629','짝 고르기'),
 ('s.rrmex','종목 삭제','종목 메뉴','C/routines/RoutineEditor.tsx:679','삭제 확인'),
 ('s.rrm','루틴 삭제(편집기)','맨 아래 「루틴 삭제」','C/routines/RoutineEditor.tsx:513','삭제 확인'),
 ('s.rexit','저장하지 않고 나갈까요?','뒤로','C/routines/RoutineEditor.tsx:718','나가기 확인'),
]:
    sh(id,name,R,label,ev,desc)
e('/routines/new','s.rexit','뒤로','C/routines/RoutineEditor.tsx:718','open'); e('/routines/new','s.rxtype','처방 줄','C/routines/RoutineEditor.tsx:1138','open')
for id,name,par,label,ev,desc in [
 ('s.goal','이번 주 목표','/calendar','목표 줄','C/analytics/CalendarClient.tsx:318','주간 목표 설정'),
 ('s.recmenu','기록 ⋯ 메뉴','/calendar','⋯ 탭','C/analytics/CalendarClient.tsx:255','이번 달 자랑하기'),
 ('s.dmenu','기록 상세 ⋯ 메뉴','/history/[id]','⋯ 탭','C/analytics/WorkoutDetailClient.tsx:125','다시 하기, 루틴 만들기, 삭제'),
 ('s.rmworkout','기록 삭제','/history/[id]','메뉴 삭제','C/analytics/WorkoutDetailClient.tsx:286','삭제 확인'),
 ('s.editset','N세트 고치기','/history/[id]','세트 줄','C/analytics/WorkoutDetailClient.tsx:555','끝난 세트 수정'),
 ('s.rmset','이 세트 지우기','/history/[id]','수정 시트','C/analytics/WorkoutDetailClient.tsx:620','삭제 확인'),
 ('s.bw','체중 기록','/stats','머리 「기록」','C/analytics/BodyweightCard.tsx:167','체중 입력 · 인바디 펼쳐 적기'),
 ('s.bwgoal','목표 체중','/stats','머리 ⋯ 목표','C/analytics/BodyweightCard.tsx:178','목표 입력(인바디 칸 없음)'),
]:
    sh(id,name,par,label,ev,desc,'','기록·분석')
# [원본] e('/profile','s.bw','체중 줄','C/profile/BodyweightRow.tsx:91','open')
# [개선] v0.91.1 — 프로필 「기록」 버튼이 없어져 기록 시트(s.bw)로 가는 길은 분석 카드 「기록」만 남는다
P='/profile'
# [원본] for id,name,label,ev in [('s.p.exp','운동 경력·코칭 의향','경력 줄','C/profile/ProfileClient.tsx:608'),('s.p.unit','단위','단위 줄','C/profile/ProfileClient.tsx:472'),('s.p.theme','화면 테마','테마 줄','C/profile/ProfileClient.tsx:485'),('s.p.lang','언어','언어 줄','C/profile/ProfileClient.tsx:501'),('s.p.sound','휴식 알림음','알림음 줄','C/profile/ProfileClient.tsx:514'),('s.p.equip','내 가용 기구','기구 줄','C/profile/ProfileClient.tsx:552'),('s.p.custom','커스텀 기구 이름','기구 이름 줄','C/profile/ProfileClient.tsx:580'),('s.p.bwall','체중 기록 전체','전체 기록','C/profile/BodyweightRow.tsx:199'),('s.p.bwedit','기록 고치기','기록 항목','C/profile/BodyweightRow.tsx:154'),('s.p.bwrm','이 기록을 지울까요?','삭제 탭','C/profile/BodyweightRow.tsx:297'),('s.p.bwnone','체중 미설정으로 두기','미설정','C/profile/BodyweightRow.tsx:320')]:
# [원본] for id,name,label,ev in [('s.p.exp','운동 경력·코치 찾기 노출','경력 줄','C/profile/ProfileClient.tsx:283 · C/profile/ProfileClient.tsx:592'),('s.p.unit','단위','단위 줄','C/profile/ProfileClient.tsx:472'),('s.p.theme','화면 테마','테마 줄','C/profile/ProfileClient.tsx:485'),('s.p.lang','언어','언어 줄','C/profile/ProfileClient.tsx:501'),('s.p.sound','휴식 알림음','알림음 줄','C/profile/ProfileClient.tsx:514'),('s.p.equip','내 가용 기구','기구 줄','C/profile/ProfileClient.tsx:552'),('s.p.custom','커스텀 기구 이름','기구 이름 줄','C/profile/ProfileClient.tsx:580'),('s.p.bwall','체중 기록 전체','전체 기록','C/profile/BodyweightRow.tsx:199'),('s.p.bwedit','기록 고치기','기록 항목','C/profile/BodyweightRow.tsx:154'),('s.p.bwrm','이 기록을 지울까요?','삭제 탭','C/profile/BodyweightRow.tsx:297'),('s.p.bwnone','체중 미설정으로 두기','미설정','C/profile/BodyweightRow.tsx:320')]:
for id,name,label,ev in [('s.p.exp','운동 경력·코치 찾기 노출','경력 줄','C/profile/ProfileClient.tsx:283 · C/profile/ProfileClient.tsx:592'),('s.p.unit','단위','단위 줄','C/profile/ProfileClient.tsx:472'),('s.p.theme','화면 테마','테마 줄','C/profile/ProfileClient.tsx:485'),('s.p.lang','언어','언어 줄','C/profile/ProfileClient.tsx:501'),('s.p.sound','휴식 알림음','알림음 줄','C/profile/ProfileClient.tsx:514'),('s.p.equip','내 가용 기구','기구 줄','C/profile/ProfileClient.tsx:552'),('s.p.custom','커스텀 기구 이름','기구 이름 줄','C/profile/ProfileClient.tsx:580')]:
    sh(id,name,P,label,ev,'','','프로필')
# [개선] 체중 한 줄(v0.91.1) — 프로필 「체중 ‹최근 값› ›」 한 줄 → 「체중」 시트(바로 입력 + 지난 기록 + 미설정으로 두기 + 확인).
#   고치기·지우기·미설정 확인은 그 시트에서 연다. 「기록」 버튼·「체중 기록 전체」 줄·부가 설명은 없어졌다(설명은 미설정 확인 창에만).
BR='C/profile/BodyweightRow.tsx'
sh('s.p.bwall','체중',P,'체중 줄 ‹최근 값› ›',BR+':126 · '+BR+':269','맨 위 바로 입력(체중 ± · 인바디 펼쳐 적기 · 저장해도 시트는 열린 채 새 줄이 목록 맨 위) · 「지난 기록」 목록(최근 것이 위 · 줄마다 「고치기」·「지우기」) · 「체중 미설정으로 두기」(값이 있을 때) · 「확인」','기록이 없으면 「지난 기록이 없어요 — 값을 맞춰 주세요」·「아직 기록이 없어요」 · 미설정 버튼 없음','프로필')
sh('s.p.bwedit','기록 고치기','s.p.bwall','지난 기록 줄 「고치기」',BR+':364 · '+BR+':213','값·날짜 고치기(날짜가 지금보다 뒤면 지금으로) · 떠 있는 동안 「체중」 시트는 내린다','','프로필')
sh('s.p.bwrm','이 기록을 지울까요?','s.p.bwall','지난 기록 줄 「지우기」',BR+':377 · '+BR+':418','어느 기록인지(값 · 날짜) 한 줄 · 「지우기」','마지막 기록이면 제목 「마지막 기록이에요」 + 「마지막 기록을 지우면 체중이 미설정으로 돌아가요」','프로필')
sh('s.p.bwnone','체중 미설정으로 두기','s.p.bwall','「체중 미설정으로 두기」',BR+':395 · '+BR+':441','확인 창 — 「기록은 남아요. 맨몸·어시스트 볼륨은 체중 없이 계산해요」(설명은 여기에만) · 확인하면 줄 값 「미설정」, 다음 기록이 오면 다시 그 값','체중 값이 있을 때만 버튼이 보임','프로필')
[x for x in N if x['id']=='s.p.exp'][0].update(desc='경력 칩(초보·중급·상급) · 「코치 찾기에 나를 보여 주기」 스위치(기본 꺼짐 · 켜면 코치 찾기 검색에 이름·소개·태그가 보임, 꺼 두어도 초대 코드로 연결 가능) · 켜면 코치 소개·태그 칸 · 프로필 요약 줄 「코치 찾기에 보임」(v0.91.0 · SPEC-052)',cond='로그인했으면 서버 계정 값을 보인다')
sh('s.updatecard','프로필 앱 업데이트 카드',P,'앱 업데이트 카드','C/appdist/AppUpdateCard.tsx:74','시트를 띄우는 카드와 뱃지','','앱 배포')
n('s.apksheet','앱 설치 파일 업데이트','sheet','앱 배포','다운로드, 설치 단계'); e('g.dist','s.apksheet','띠 누르기','C/appdist/AppUpdateSheet.tsx:381','open'); e('s.updatecard','s.apksheet','카드 누르기','C/appdist/AppUpdateSheet.tsx:381','open')
n('s.switch','전용 앱으로 바꾸기','sheet','앱 배포','확인, 내려받기, 열기, 완료'); e('g.dist','s.switch','띠 누르기','C/appdist/SwitchToAppSheet.tsx:114','open'); e('s.updatecard','s.switch','카드 누르기','C/appdist/SwitchToAppSheet.tsx:114','open')
for id,name,par,label,ev,desc,g in [
 ('s.report','신고','/feed','⋯ 신고','C/moderation/ReportSheet.tsx:55','글, 댓글, 스토리 신고','피드'),
 ('s.ownmenu','게시물 수정(메뉴)','/feed','내 글 ⋯','C/feed/OwnPostMenu.tsx:79','내 글 메뉴','피드'),
 ('s.caption','캡션 수정','/feed','메뉴 선택','C/feed/OwnPostMenu.tsx:103','캡션 편집','피드'),
 ('s.rmpost','게시물을 삭제할까요?','/feed','메뉴 선택','C/feed/OwnPostMenu.tsx:130','삭제 확인','피드'),
 ('s.geartag','오늘의 착용장비','s.compose','장비 태그','C/feed/GearTagPicker.tsx:99','장비 태그 고르기','피드'),
 ('s.importroutine','루틴 가져오기','/feed','루틴 가져오기 버튼','C/feed/WorkoutBox.tsx:376','글의 운동을 내 루틴으로','피드'),
 ('s.officialroutine','공식 글의 루틴','/feed','공식 글 루틴 가져오기','C/feed/OfficialRoutineCard.tsx:61','출처·제휴 아님 고지를 보고 영상 루틴을 내 루틴에 저장','피드'),
 ('s.pmenu','프로필 메뉴(차단)','/u/[userId]','⋯ 탭','C/feed/UserProfileClient.tsx:150','차단','피드'),
 ('s.leave','그룹 나가기','/messages/[id]','그룹 메뉴','C/dm/ConversationClient.tsx:260','나가기 확인','피드'),
 ('s.sumopen','성과 요약','/messages/[id]','요약 카드','C/summary/SummaryOpen.tsx:129','DM 카드에서 요약 열기','코칭'),
 # [원본] ('s.chist','코칭 이력','/coaching','이력 버튼','C/coaching/CoachingClient.tsx:279','이력 판','코칭'),
 # [원본] ('s.mreport','회원 리포트','/coaching','리포트 버튼','C/summary/MemberReportDialog.tsx:118','회원 리포트','코칭'),
 # [원본] ('s.mrx','회원 루틴 처방','/coaching','처방 버튼','C/coaching/CoachingClient.tsx:276','처방 관리','코칭'),
 # [원본] ('s.rxed','처방 편집기','s.mrx','종목 탭','C/coaching/PrescriptionEditor.tsx:168','세트 처방 편집','코칭'),
 # [개선 11-10] 네 판은 그대로 있다 — 줄 버튼이 ⋯ 연결 시트(s.cgrant)로 옮겨 갔다(아래 코칭 v2 묶음)
 ('s.chist','코칭 이력','s.cgrant','⋯ 「이력」','C/coaching/CoachingClient.tsx:343 · C/coaching/CoachingClient.tsx:530','요청·수락·범위 바꿈·루틴 보냄·코멘트 등 최근 30줄','코칭'),
 ('s.mreport','기록 요약(회원 리포트)','s.cgrant','⋯ 「기록 요약」','C/coaching/CoachingClient.tsx:325 · C/summary/MemberReportDialog.tsx:72','빠른 보기 판 · 회원 화면 분석 탭과 같은 부품','코칭'),
 ('s.mrx','회원 루틴 처방','s.cgrant','⋯ 「루틴」','C/coaching/CoachingClient.tsx:330 · C/coaching/CoachingClient.tsx:814','회원 루틴 목록 · 종목을 누르면 처방 편집기 · 회원 화면 루틴 탭 아래 「회원이 만든 루틴」과 같은 부품','코칭'),
 ('s.rxed','처방 편집기','s.mrx','종목 탭','C/coaching/PrescriptionEditor.tsx:168','세트 처방(무게·횟수 범위·RIR) 편집 · 저장하면 회원 루틴에 들어가고 이력에 남는다','코칭'),
 # [원본] ('s.archive','운동 보관','/exercise/[id]','보관 버튼','C/ExerciseAdminBar.tsx:68','종목 보관 확인','운동'), — S-145 v0.84.6 에서 없앴다
 ('s.exdel','이 종목을 지울까요?','/exercises/[id]/edit','「종목 삭제」','C/ExerciseFormClient.tsx:286','직접 만든 종목 삭제 확인 · 지난 기록은 남는다','운동'),
 # [원본] ('s.alias','이 종목을 무엇이라 부를까요?','/exercise/[id]','이름 탭','C/ExerciseNameHeader.tsx:67','별칭 고르기','운동'), — S-146 v0.84.6 에서 ✎ 그 자리 입력으로
 ('s.imppick','가져오기 종목 피커','/account/import','종목 대응','C/sync/ImportFlow.tsx:1027','종목 대응 고르기','가져오기'),
 ('s.impun','확인 안 한 종목이 있어요','/account/import','진행','C/sync/ImportFlow.tsx:1043','진행 확인','가져오기'),
 ('s.impleave','고른 내용이 사라져요','/account/import','나가기','C/sync/ImportFlow.tsx:1060','나가기 확인','가져오기'),
 ('s.impundo','이 가져오기를 되돌릴까요?','/account','가져오기 이력','C/sync/ImportCard.tsx:198','되돌리기 확인','가져오기'),
 ('s.human','사람 확인(Turnstile)','/account','로그인 폼','C/auth/HumanCheck.tsx:25','내장 위젯','계정'),
 ('s.geo','브라우저 위치 권한 창','/gyms','검색','F/lib/gymSearch.ts:37','위치 사용','소셜'),
 ('s.files','시스템 파일 선택창','/account','파일 고르기','C/sync/BackupCard.tsx:85','이미지, 백업 파일 등. 여러 화면에서 뜸','기타'),
 ('s.ad','광고 자리','/stats','미리 보기','C/ads/AdSlot.tsx','실광고 없음. 관리자 미리 보기만','기타'),
]:
    sh(id,name,par,label,ev,desc,'',g)
e('/forgot','s.human','폼','C/auth/ForgotClient.tsx:62','open')
e('s.story','s.report','신고','C/feed/StoryViewer.tsx:136','open')
# 댓글 시트(2026-11-09) — 어느 화면이든 글 카드 💬 → 바닥 시트(본문 없음 · 댓글·답글·입력칸)
sh('s.comments','댓글 시트','/feed','글 카드 💬','C/feed/PostCard.tsx:310','댓글·답글·좋아요·삭제·신고, 바닥에 붙은 입력칸. 글 본문은 싣지 않는다(밑의 카드가 그 글)','뒤로·닫기·바깥 누르기 = 시트만 닫기 · 비로그인은 로그인 안내',"피드")
for p in ['/explore','/hashtag/[tag]','/bookmarks','/u/[userId]','/feed/[postId]']:
    e(p,'s.comments','글 카드 💬','C/feed/PostCard.tsx:310','open')
e('s.comments','s.report','댓글 신고','C/feed/CommentsSheet.tsx:247','open')
e('s.comments','/account','비로그인 「로그인 / 가입」(로그인 뒤 그 글로)','C/feed/CommentsSheet.tsx:213')
e('/account','s.owner','계정 충돌','C/sync/AccountGuard.tsx:23','open')
# 시스템
for id,name,desc,cond,ev in [
 ('y.error','오류 화면(문제가 발생했습니다)','「다시 시도」','렌더 오류','F/app/error.tsx'),
# [원본]  ('y.404','404(Next 기본)','not-found 파일이 없어 기본 화면이 뜬다','없는 주소, 없는 종목, 운영의 /diag/db','F/app/exercise/[id]/page.tsx:62'),
 ('y.404','없는 화면(자연어)','「죄송해요. 찾는 화면이 없어요」 + 「운동 홈으로」·「뒤로 가기」 · 없는 종목·모양 틀린 종목 id 는 「죄송해요. 이 종목을 찾을 수 없어요」 + 「종목 목록으로」 · 숫자 404·영어 글자는 안 보임(상태 코드만 404)','없는 주소, 없는 종목, 모양 틀린 종목 id, 운영의 /diag/db','F/app/not-found.tsx:31 · F/app/exercise/[id]/not-found.tsx:5 · C/notfound/NotFoundView.tsx:7'),
 ('y.boot','부팅 덮개','로고 스피너, 상한 2500ms','앱 웹뷰','F/app/layout.tsx:74'),
 ('y.updboot','업데이트 직후 덮개','재시작 깜빡임을 가림, 15초 뒤 해제','업데이트 후 60초 이내','F/app/layout.tsx:69'),
 ('y.sw503','서비스 워커 최후 대체(글자 offline)','상태 503','/offline도 캐시에 없을 때','src/frontend/sw/sw.template.js'),
 ('y.appoff','앱 오프라인: 인터넷에 연결되어 있지 않아요','「다시 시도」','앱 웹뷰 로드 실패','src/mobile/www/offline.html'),
# [원본]  ('y.apk404','APK 404(글자 not found)','','/downloads 파일 없음','F/server.mjs:145'),
 ('y.apk404','설치 파일 없음(자연어)','「죄송해요. 이 설치 파일을 찾을 수 없어요」 + 「최신 앱 받기」·「리프트그램 홈으로」 · 상태 404 · .apk 로 저장되지 않는 HTML','/downloads 파일 없음','F/server.mjs:157 · F/server.mjs:182'),
 ('y.states','화면별 로딩·오류 상태','Loading, Empty, ErrorState, LogoSpinner','데이터 로딩 중','C/States.tsx'),
]:
    n(id,name,'system','시스템 상태',desc,cond); e('g.boot',id,'조건 충족 때',ev,'open')
# 네이티브
MJ='src/mobile/android/app/src/main/java/org/tarae/liftgram/'
for id,name,desc,cond,ev in [
 ('a.main','MainActivity(웹뷰 껍데기)','앱 아이콘으로 시작','포함','MainActivity.java:15'),
 ('a.splash','Android 시작 화면','로고 윤곽, 웹이 먼저 내림','포함','M:src/mobile/capacitor.config.ts:33'),
 ('a.lock','잠금 운동 화면','운동 시간, 쉬는 시간 링(끝나면 총시간), 무게·횟수, 꾹 눌러 세트 완료, 잠금 해제','설정 켬, 운동 중, 잠금','LockScreenGate.java:49'),
 ('a.fs','전체 화면 알림','탭하면 잠금 화면','화면 켜짐 또는 휴식 끝','LockScreenGate.java:307'),
 ('a.card','운동 카드 알림','+30초, 건너뛰기, 완료, 앱 열기','운동 중, 알림 허용','WorkoutNotification.java:119'),
 ('a.fgs','포그라운드 서비스 2종','같은 카드 알림을 공유','운동 중','src/mobile/android/app/src/main/AndroidManifest.xml:80'),
 ('a.updnotif','업데이트 완료 알림','눌러서 열기','앱이 시작한 설치 후','PackageReplacedReceiver.java:66'),
 ('a.install','시스템 설치 화면','Android 설치 확인, 대체 설치, 설치 허용 설정','앱 업데이트','InstallResultReceiver.java:33'),
 ('a.perm','시스템 권한·설정 창','알림, 위치, 배터리, 오버레이, 정확 알람, 전체 화면','필요할 때','LiftgramLockPlugin.java:241'),
 ('a.tabs','로그인 Custom Tabs','소셜 로그인 브라우저 탭','앱 모드 로그인','F/lib/native.ts:286'),
 ('i.splash','iOS 시작 화면','LaunchScreen','앱 시작','src/mobile/ios/App/App/'),
 ('i.notif','iOS 휴식 끝 알림','탭 처리 없음, 앱만 열림(미확인)','iOS 17 이상','src/mobile/ios/App/App/'),
 ('i.perm','iOS 권한·인증 창','알림, 카메라, 사진, 위치, Apple 로그인, 인증 시트','필요할 때','src/mobile/ios/App/App/Info.plist:44'),
]:
    n(id,name,'native','앱 전용',desc,cond); e('x.nat',id,'앱 조건 충족','' if not ev else (ev if ev.startswith(('src','F/')) else (ev[2:] if ev.startswith('M:') else MJ+ev)),'open')
e('a.fs','a.lock','탭','','open'); e('a.lock','/workout','잠금 해제','','go'); e('a.card','/workout','본문·앱 열기',MJ+'WorkoutNotification.java:129','go')
n('i.live','iOS Live Activity','dead','앱 전용','잠금화면 작업(SPEC-017)용 코드. Xcode 프로젝트에 위젯 타깃을 연결하면 빌드에 들어간다 — 지우지 않음','미포함')
# 도달 불가 — 2026-11-09 옛 코드 12개(콘셉트 루틴·가이드·옛 변형 선택·옛 리포트·성과 요약·요약 입구·옛 폐기 확인·옛 피커·옛 처방 시트·옛 ⋯ 메뉴·옛 업데이트 띠·InfoDialog)를 지웠다. 남은 것은 iOS Live Activity 하나(SPEC-017 · Xcode 타깃 연결 대기)
N[[x['id'] for x in N].index('i.live')]['ev']='src/mobile/ios/App/LiftgramWidgets/WorkoutLiveActivity.swift:23'
# 브라우저 응답
for u,d in [('/api/[...path]','백엔드 프록시'),('/api/session','세션 쿠키(POST·DELETE)'),('/api/session/refresh','세션 갱신(POST)'),('/.well-known/assetlinks.json','Android 앱 링크 검증. 값 없으면 404'),('/.well-known/apple-app-site-association','iOS 유니버설 링크 검증. 값 없으면 404'),('/healthz','상태 JSON'),('/readyz','준비 상태 JSON'),('/app-version','버전 JSON'),('/ws','WebSocket 터널'),('/api/healthz','백엔드 상태'),('/api/readyz','백엔드 준비 상태'),('/media/file/*','업로드 이미지'),('/api/auth/oauth/*','소셜 로그인 시작·콜백 리다이렉트'),('/manifest.json','PWA 매니페스트'),('/sw.js','서비스 워커'),('/sw-nudge.html','숨은 iframe용 빈 문서'),('/downloads/android.json','앱 버전 정보'),('/downloads/*.apk','APK 파일'),('/icon-*.png · /brand/* · /fonts/*','정적 파일')]:
    n(u,u,'raw','화면 아닌 응답',d,'',u)
# ── 2026-11-09 반영(v0.77~v0.82) — 세트 방식 · 다른 세트도 똑같이 · 횟수 범위·다음 무게 · 확인 필요 · 루틴 미리보기 · 값 칩 · 첫 안내
sh('s.routinepreview','루틴 미리보기','/','루틴 줄 왼쪽(이름·종목 줄)','C/routines/RoutinesClient.tsx:1252','종목마다 세트 요약(운동 화면과 같은 순서·슈퍼셋) · 「편집」 · 「이 루틴으로 시작」(v0.81.0 · SPEC-045)','','운동')
e('s.routinepreview','/workout','이 루틴으로 시작','C/routines/RoutinePreviewSheet.tsx:207')
e('s.routinepreview','/routines/[id]','편집','C/routines/RoutinePreviewSheet.tsx:199')
sh('s.wescheme','세트 방식 바꾸기(운동 중)','/workout','블록 머리 빨간 세트 방식 이름 · 종목 ⋯ 「세트 방식 바꾸기」','C/session/ExerciseBlock.tsx:1513','5×5·탑+백오프 같은 이름 있는 틀로 이 종목 세트를 바꾼다(SPEC-041 · 이름을 누르는 길은 v0.82.0)')
e('s.emenu','s.wescheme','세트 방식 바꾸기','C/session/ExerciseBlock.tsx:990','open')
sh('s.rxscheme','세트 방식(루틴 편집)','/routines/[id]','세트 표 위 「세트 방식」','C/routines/PrescriptionRows.tsx:743','루틴 세트를 이름 있는 틀로(SPEC-041)')
e('/routines/new','s.rxscheme','세트 방식','C/routines/PrescriptionRows.tsx:450','open')
sh('s.check','이 기록이 맞나요?','/workout','「확인 필요」 칩','C/session/ExerciseBlock.tsx:1575','튀는 기록 확인 — 「lb로 적었어요」 · 「제대로 적었어요」 · 「직접 고치기」 · 되돌리기 토스트(v0.80.0 · SPEC-044)','평소보다 1.3배 넘게 튐','운동 중')
e('s.summary','s.check','확인 필요 목록','C/session/WorkoutSummary.tsx:148','open')
e('/exercise/[id]','s.check','확인 필요 목록','C/analytics/ExerciseProgress.tsx:39','open')
e('s.editset','s.check','고치기 시트 위 확인 패널','C/analytics/WorkoutDetailClient.tsx:36','open')
e('/stats','/history/[id]','최근 PR 줄 ›','C/analytics/StatsClient.tsx:341')
# [원본] 첫 안내(v0.82.0 · SPEC-046) — 화면 아래 말풍선 · 한 번에 하나 · 창·입력 중엔 숨음 · 프로필 「안내 다시 보기」로 다시
# 첫 안내(v0.82.0 · SPEC-046 · v0.91.1 #T18) — 가리키는 버튼 옆 말풍선(길게 눌러 안내는 휴식 막대 위) · 「알겠어요」 없음 · 5초 뒤·어디를 눌러도 사라짐 · 한 번에 하나 · 창·입력 중엔 숨음 · 프로필 「안내 다시 보기」로 다시
for id,name,par,ev,desc,cond in [
# [원본]  ('h.prev','첫 안내: 「이전」 누르기','/workout','C/CoachHints.tsx:15','「「이전」을 누르면 지난 무게·횟수가 그대로 들어가요」','이전 기록이 있는 「이전」 칩이 보일 때 · 처음 한 번'),
# [원본]  ('h.longdone','첫 안내: 길게 눌러 이 종목만','/workout','C/CoachHints.tsx:22','「묶음 전체가 완료됐어요 · 이 종목만은 체크를 길게 눌러요」 · 휴식 막대 위','슈퍼셋 묶음 완료로 휴식이 걸린 순간 · 처음 한 번'),
# [원본]  ('h.rxtype','첫 안내: 세트 번호 누르기','/routines/[id]','C/CoachHints.tsx:46','「세트 번호를 누르면 종류 바꾸기·복사·삭제가 나와요」','세트 표가 보일 때 · 처음 한 번'),
 ('h.prev','첫 안내: 「이전」 누르기','/workout','C/CoachHints.tsx:20 · C/ui/CoachMark.tsx:183','「이전」 칩 바로 위(공간 없으면 아래) 꼬리 달린 말풍선 「「이전」을 누르면 지난 무게·횟수가 그대로 들어가요」 · 「알겠어요」 없음 · 5초 뒤 저절로·어디를 눌러도 사라짐(누른 버튼 동작은 그대로) · 스크롤을 따라감','이전 기록이 있는 「이전」 칩이 보일 때 · 처음 한 번'),
 ('h.longdone','첫 안내: 길게 눌러 이 종목만','/workout','C/CoachHints.tsx:37 · C/ui/CoachMark.tsx:183','「묶음 전체가 완료됐어요 · 이 종목만은 체크를 길게 눌러요」 · 자리는 휴식 막대 위 그대로 · 「알겠어요」 없음 · 저절로/누르면 사라짐','슈퍼셋 묶음 완료로 휴식이 걸린 순간 · 처음 한 번'),
 ('h.rxtype','첫 안내: 세트 번호 누르기','/routines/[id]','C/CoachHints.tsx:65 · C/ui/CoachMark.tsx:183','세트 번호 바로 위(공간 없으면 아래) 말풍선 「세트 번호를 누르면 종류 바꾸기·복사·삭제가 나와요」 · 「알겠어요」 없음 · 저절로/누르면 사라짐','세트 표가 보일 때 · 처음 한 번'),
]:
    sh(id,name,par,'조건 충족 때 자동',ev,desc,cond,'첫 안내')
# [원본] e('/routines/new','h.rxtype','조건 충족 때 자동','C/CoachHints.tsx:46','open')
e('/routines/new','h.rxtype','조건 충족 때 자동','C/CoachHints.tsx:65','open')
e('/profile','h.prev','「안내 다시 보기」(세 안내를 다시)','C/profile/HintsResetRow.tsx:9','open')

# ── 화면 안 구역(2026-11-09) — build.py 가 S-nn.k 번호를 붙인다. 순서를 바꾸면 번호가 바뀌니 새 구역은 끝에 더한다.
# (이름, 설명, 근거) · 근거 C/=app/components F/=src/frontend
RC='C/routines/RoutinesClient.tsx'; WS='C/routines/WeekSummary.tsx'; AW='C/session/ActiveWorkout.tsx'; EB='C/session/ExerciseBlock.tsx'; SR='C/session/SetRowEdit.tsx'
RE='C/routines/RoutineEditor.tsx'; PR='C/routines/PrescriptionRows.tsx'; CA='C/analytics/CalendarClient.tsx'; WD='C/analytics/WorkoutDetailClient.tsx'
SU='C/session/WorkoutSummary.tsx'; ST='C/analytics/StatsClient.tsx'; PC='C/profile/ProfileClient.tsx'; CC='C/CatalogClient.tsx'; EX='F/app/exercise/[id]/page.tsx'
FC='C/feed/FeedClient.tsx'; AC='C/profile/AuthClient.tsx'; PK='C/ExercisePickerScreen.tsx'
AREAS={
'/':[('앱바','로고 · 「운동」 · 🔍 종목 목록',RC+':419'),('주간 스케줄 카드','주차·디로딩 · 요일 줄 · 첫 줄 오른쪽 「📅 편집」(없으면 「주간 스케줄 만들기」 줄)',RC+':460'),
 ('이번 주 목표 카드','연속일 · n/목표 · 진행 막대 · 볼륨·세션·PR',WS+':110'),('오늘의 안내 카드','다음 운동 / 오늘 할 루틴 / 추천 중 하나',RC+':519'),
 ('놓친 루틴 카드','놓친 루틴이 있고 오늘 운동 전일 때',RC+':526'),('버튼 줄','「새 루틴 만들기」 · 「빠른 운동 시작」',RC+':547'),
 ('「내 루틴」 머리 · 폴더','폴더 묶음 접기·펼치기',RC+':591'),('내 루틴 목록','줄마다 이름 · 종목 이름 한 줄 · 「오늘」 칩 · ▶ 시작 · ⋯. 줄을 누르면 루틴 미리보기',RC+':614'),
 ('프로·초보자 루틴','2열 카드',RC+':676'),('최근 운동','3줄 · 전체 ›',WS+':195')],
'/workout':[('고정 머리','⌄ 닫기 · 경과 시간 · 운동 이름✎ · 실시간 볼륨 · 오늘 근육 · 일시정지 · 「완료」 · ⋯',AW+':361'),('운동 블록 목록','종목마다 블록(아래 「블록 ·」 구역). 비면 빈 안내',AW+':460'),
 ('슈퍼셋 묶음 틀','묶음 머리 ⌃⌄ · 묶음 풀기',AW+':471'),('「운동 추가」 버튼','종목 피커를 연다',AW+':500'),('휴식 막대','남은 시간 · +15초 · 건너뛰기','C/session/RestBar.tsx:16'),
 ('덮개','첫 안내 말풍선 · PR 축하',AW+':517'),('종목 피커','추가·교체 중 전체 화면',AW+':555'),
 ('블록 · 머리','그림 · 종목 이름 · 종목 볼륨 · ⋮ 메뉴',EB+':908'),('블록 · 세트 방식','방식 이름▾ + 한 줄 안내(일반이 아닐 때)',EB+':1015'),
 ('블록 · 메타 줄','기구 조합 · 슈퍼셋 · PR 금색 칩 · 체중 경고 · 오른쪽 「더 보기」',EB+':1047'),('블록 · PR 한 줄','중량 PR과 볼륨 PR이 다를 때',EB+':1117'),
 ('블록 · 더 보기 펼침','운동 방법 보기 · 다른 조합 · 이전 기록 지우기',EB+':1140'),('블록 · 세트 표 머리','세트 · 이전 · kg│lb · 회',EB+':1165'),
 ('블록 · 다음 무게 제안','제안 줄 + 「적용」',EB+':1221'),('블록 · 세트 줄 목록','세트 줄(아래 「세트 줄 ·」 구역)',EB+':1256'),
 ('블록 · 「다른 세트도 똑같이」','방금 고친 값을 남은 세트에',EB+':1326'),('블록 · 원판 한쪽 질문','플레이트 머신에서 아직 안 정했을 때',EB+':1340'),
 ('블록 · 「세트 추가」','',EB+':1349'),('블록 · 도구 줄','⌃⌄ 순서 · 휴식 n초 칩 · 메모 칩','C/session/BlockTools.tsx:88'),('블록 · 메모','메모 입력 · 지난 메모',EB+':1371'),
 ('세트 줄 · 본 줄','세트 번호 · 「이전」 칩 · 무게 · 횟수 · ✓ · ⋯',SR+':324'),('세트 줄 · 변형 이름표','변형이 있을 때',SR+':494'),('세트 줄 · 확인 필요 칩','튀는 기록일 때 → 「이 기록이 맞나요?」',SR+':511'),
 ('세트 줄 · 목표 줄','목표 횟수·RIR·결과',SR+':529'),('세트 줄 · 무게 근거·제안','',SR+':576'),('세트 줄 · ⋯ 펼침','부분 반복 · 변형 · 이 종목만 완료 · 삭제',SR+':606'),('오늘 체중 줄','블록 목록 맨 위 한 줄 · 기록 전 「오늘 체중 기록 · 지난 72.5kg」 · 뒤 「오늘 체중 72.6kg ✓」 · 누르면 체중 시트',AW+':459')],
'/routines/[id]':[('하위 앱바','← · 루틴 이름 · ⋯ 삭제',RE+':342'),('루틴 이름','',RE+':373'),('폴더','입력칸 또는 폴더 칩 + 새 폴더',RE+':382'),('메모','',RE+':442'),
 ('종목 카드 목록','카드 머리 · 휴식·무게 · 세트 표 · 슈퍼셋·교체·🗑',RE+':451'),('「운동 추가」','',RE+':494'),('하단 고정','「완료」 · 「이 루틴으로 시작」',RE+':549'),
 ('세트 표 · 세트 방식','「세트 방식: ○○ ▾」 + 안내 + 되돌리기',PR+':444'),('세트 표 · 머리','세트 · 무게 · 횟수',PR+':481'),
 ('세트 표 · 세트 줄','종류 번호 · 무게 · 최소–최대 횟수/AMRAP · ⋯',PR+':504'),('세트 표 · 「다른 세트도 똑같이」','',PR+':640'),('세트 표 · 추가','「세트 추가」 · 「웜업 추가」',PR+':656')],
's.routinepreview':[('시트 머리','루틴 이름','C/routines/RoutinePreviewSheet.tsx:158'),('종목 목록','번호 · 이름 · 「n세트 · 횟수」 · 슈퍼셋 묶음','C/routines/RoutinePreviewSheet.tsx:159'),('버튼 줄','편집 · ▶ 시작','C/routines/RoutinePreviewSheet.tsx:193')],
'/history':[('앱바','「기록」','C/analytics/RecordsHeader.tsx:13'),('목록│달력 전환','','C/analytics/RecordsHeader.tsx:15'),('달별 머리','○월 · n회 · 볼륨','C/analytics/HistoryClient.tsx:86'),
 ('기록 줄','날짜 · 이름 · 시간·볼륨 · PR 금색','C/analytics/HistoryClient.tsx:115'),('광고 자리','','C/analytics/HistoryClient.tsx:100'),('빈 상태','기록이 없을 때','C/analytics/HistoryClient.tsx:76')],
'/calendar':[('앱바·전환','「기록」 · ⋯ 이달 자랑하기 · 목록│달력',CA+':284'),('목표·연속일 줄','누르면 목표 시트',CA+':308'),('월 이동','‹ ○월 › · 이달 요약 · 「오늘」 칩',CA+':417'),
 ('달력 칸','',CA+':472'),('고른 날 머리','날짜 + 「메모」',CA+':542'),('그날 메모','',CA+':559'),('그날 내용','운동 줄 · 수동 표시 · 「운동한 날로 표시」',CA+':579')],
'/history/[id]':[('하위 앱바','「기록」 + ⋯ 다시 시작·루틴 만들기·삭제',WD+':141'),('이름·날짜','',WD+':192'),('숫자 카드','총 볼륨 · 소요시간',WD+':201'),
 ('「그대로 다시 시작」','',WD+':229'),('종목 카드 목록','머리(이름·추정 1RM·⋯) · 메타 줄 · 세트 줄(✎ 고치기 칩)',WD+':245'),('1RM 주석','',WD+':311'),('운동 총평','',WD+':319')],
's.summary':[('축하 머리','「운동 완료!」 + PR 금색 줄',SU+':97'),('숫자 셋','볼륨 · 시간 · 세트',SU+':123'),('확인 필요 목록','튀는 기록이 있을 때',SU+':148'),
 ('종목별 기록','칸 이름 · 1RM · PR',SU+':167'),('광고 자리','',SU+':277'),('부가 행동','루틴 만들기 · 다시 시작 · 공유',SU+':282'),('운동 총평','',SU+':329'),('하단 「완료」','',SU+':376')],
'/stats':[('앱바','「분석」',ST+':160'),('기간 선택','',ST+':163'),('대표 카드','볼륨 · 증감 · 주별 막대',ST+':185'),('숫자 줄','세션 · 세트 · 평균 + 증감',ST+':201'),
 ('추정 1RM 목록','',ST+':249'),('1RM 변화','','C/analytics/ExerciseChangeCards.tsx:113'),('근육 균형','',ST+':317'),('세트 힘든 정도','',ST+':319'),('최근 PR','1RM 목록에 없는 PR · 줄을 누르면 그 기록',ST+':325'),
 ('광고 자리','',ST+':369'),('그대로인 종목','','C/analytics/ExerciseChangeCards.tsx:146'),('근육별 주간 세트','',ST+':375'),('체중','숫자 줄 바로 아래로 옮김 · 머리 최근 값·날짜 · 「기록」 · ⋯ 목표 · 체중/골격근량/체지방률 고르기 · 곡선',ST+':260'),('의료 아님 고지','',ST+':380')],
'/profile':[('앱바','「프로필」',PC+':255'),('나 카드','아바타 · 이름 · 경력 · 편집',PC+':258'),('의견 보내기','',PC+':285'),
 
# [원본]  ('설정 묶음','단위 · 테마 · 언어 · 체중 · 알림음 · 잠금화면 카드 · 힘든 정도 · 추천 표시 · 근육 그림 · 사용 통계 · 가용 기구 · 기구 이름 · 안내 다시 보기',PC+':295'),
 ('설정 묶음','단위 · 테마 · 언어 · 「체중 ‹최근 값› ›」 한 줄(설명 없음 · 누르면 「체중」 시트) · 알림음 · 잠금화면 카드 · 힘든 정도 · 추천 표시 · 근육 그림 · 사용 통계 · 가용 기구 · 기구 이름 · 안내 다시 보기',PC+':303 · C/profile/BodyweightRow.tsx:126'),
 ('계정과 데이터','로그인·보안 · 백업 · 장비함 · 코칭 · 저장한 글 · 차단 목록',PC+':366'),('앱 버전·업데이트','',PC+':408'),('바닥 고지','의료 아님 · 약관 · 개인정보 · 오픈소스 · 사업자',PC+':417')],
'/exercises':[('머리','← · 「운동」 · + 커스텀 운동','F/app/exercises/page.tsx:29'),('검색칸','',CC+':241'),('스무고개·초기화 줄','',CC+':249'),('스무고개 경로','',CC+':282'),
 ('근육군 칩','',CC+':291'),('기구 칩','',CC+':320'),('종목 목록','그림 · 이름 · 부위·기구',CC+':336'),('오프라인 안내','',CC+':361')],
'/exercise/[id]':[('머리','← · 「운동 상세」',EX+':121'),('이름','✎ 그 자리에서 이름 바꾸기 · 별칭 칩 · 원래 이름으로',EX+':140'),('내 기록','추정 1RM 추세',EX+':145'),('자세 그림·영상','',EX+':151'),
 ('시연 사진','',EX+':163'),('동작 주의','',EX+':173'),('자세 설명','',EX+':179'),('분류','주동근 · 보조근 · 기구 · 하중',EX+':199'),('대체 운동','',EX+':258')],
'/feed':[('앱바','사람 · 탐색 · 메시지 · 알림',FC+':434'),('탭','추천 · 팔로잉 · 발견',FC+':434'),('주변 헬스장 줄','',FC+':457'),('스토리 줄','',FC+':459'),
 ('추천 목록','',FC+':470'),('발견 탭','',FC+':495'),('팔로잉 글 목록','글 카드 · 광고 · 끝없이 불러오기','C/feed/PostCard.tsx:134'),('+ 글쓰기','',FC+':552')],
'/account':[('하위 앱바','「계정」',AC+':200'),('계정 카드','이름 · 주소 · 로그아웃',AC+':202'),('프로필 편집','',AC+':243'),('로그인·보안','',AC+':244'),
 ('서버 동기','',AC+':245'),('백업 파일','',AC+':248'),('다른 앱 기록 가져오기','',AC+':252'),('계정 삭제','',AC+':255'),
 ('로그인 전 · 소셜 버튼','',AC+':325'),('로그인 전 · 이메일 양식','',AC+':326'),('로그인 전 · 링크','비밀번호 찾기 · 약관 · 가입 전환',AC+':414')],
's.picker':[('머리','✕ · 제목',PK+':272'),('검색칸','',PK+':289'),('스무고개·초기화','',PK+':297'),('근육군 칩','',PK+':332'),('기구 칩','',PK+':360'),
 ('종목 목록','이름 · 별칭 · 고른 순서',PK+':376'),('비슷한 종목','검색 중',PK+':402'),('하단 「n개 추가」','',PK+':427')],
's.check':[('시트 머리','「이 기록이 맞나요?」','C/session/SuspectSetSheet.tsx:153'),('본문','종목 · 무게×횟수 · 평소 값','C/session/SuspectSetSheet.tsx:95'),
 ('안내','확인 전까지 PR·1RM 계산에서 빠짐','C/session/SuspectSetSheet.tsx:103'),('버튼','lb로 적었어요 · 제대로 적었어요 · 직접 고치기','C/session/SuspectSetSheet.tsx:106')],
}

# 11-09 — 루틴 편집에서는 줄 ⋯ 이 없다(SPEC-041 · 세트 번호 시트가 대신). 처방 줄 ⋯ 은 코칭 처방 편집에만 남았다.
sh('s.rxmenu','세트 설정','s.rxed','처방 줄 ⋯','C/routines/PrescriptionRows.tsx:597','처방 세트 메뉴(무게 기준 · 삭제). 코칭 처방 편집에서만',group='코칭')

# ── 코칭 v2(2026-11-10 · 웹 0.87.0~0.90.0 · SPEC-050 P1~P4) — 초대 코드·범위·회원 화면·코치 루틴·코멘트·점검
CO='C/coaching/'; CCL=CO+'CoachingClient.tsx'; MC=CO+'MemberClient.tsx'; JC=CO+'JoinClient.tsx'; UP='C/feed/UserProfileClient.tsx'
# [원본] sh('s.cscope','범위 고르기 시트','/coaching','「확인」(코드) · 「코칭 요청」 · 「수락」(회원 쪽)',CCL+':412 · '+CCL+':507 · '+CCL+':551',
# [원본]    '제목은 코칭 요청 / 코칭 수락 / 코치와 연결 / 범위 바꾸기 · 코치 카드 · 「무엇을 보여 줄까요」 스위치 넷(운동 기록·분석 · 코치가 짠 루틴 받기·처방 고치기 · 체중·인바디 · 지난 기록도) · 요청 때만 「코치에게 한 줄」(100자) · 주 버튼 「요청 보내기/수락하기/연결하기/저장」',
# [원본]    '기본값 = 기록·루틴 켬, 체중·지난 기록 꺼짐 · 코치가 수락할 때는 묻지 않는다(회원이 고른 범위 그대로)','코칭')
sh('s.cscope','범위 고르기 시트','/coaching','「확인」(코드) · 「코치로 요청」 · 「수락」(회원 쪽)',CCL+':412 · '+CCL+':507 · '+CCL+':551',
   '제목은 코치로 요청 / 코칭 수락 / 코치와 연결 / 범위 바꾸기 · 코치 카드 · 「무엇을 보여 줄까요」 스위치 넷(운동 기록·분석 · 코치가 짠 루틴 받기·처방 고치기 · 체중·인바디 · 지난 기록도) · 요청 때만 「코치에게 한 줄」(100자) · 주 버튼 「요청 보내기/수락하기/연결하기/저장」',
   '기본값 = 기록·루틴 켬, 체중·지난 기록 꺼짐 · 코치가 수락할 때는 묻지 않는다(회원이 고른 범위 그대로)','코칭')
e('/coaching/join','s.cscope','「연결하기」(처음 한 번은 저절로)',JC+':171 · '+JC+':77','open')
# [원본] e('/u/[userId]','s.cscope','「코칭 요청」(상대가 코치)',UP+':531 · '+UP+':366','open')
e('/u/[userId]','s.cscope','「코치로 요청」',UP+':531 · '+UP+':366','open')
sh('s.cgrant','연결 ⋯ 시트','/coaching','줄 끝 ⋯',CCL+':739',
   '제목 = 상대 이름. 코치 쪽 활성: 기록 요약 · 루틴 · 이력 · 연결 끊기 / 회원 쪽 활성: 범위 바꾸기 · 이력 · 연결 끊기 / 대기: 이력 · 요청 취소','','코칭')
e('s.cgrant','s.cscope','범위 바꾸기(회원 쪽)',CCL+':338','open')
sh('s.crevoke','연결을 끊을까요?','s.cgrant','연결 끊기 · 요청 취소',CCL+':348 · '+CCL+':563',
   '확인창 · 회원 쪽 「코치가 더는 기록을 볼 수 없어요」 / 코치 쪽 「회원 기록을 더는 볼 수 없어요」 · 「연결 끊기」(빨강)','','코칭')
# [원본] sh('s.invrenew','새 코드를 만들까요?','/coaching','초대 카드 「새로 만들기」',CO+'InviteCard.tsx:189 · '+CO+'InviteCard.tsx:196',
# [원본]    '확인창 · 「지금 코드와 링크는 더 쓸 수 없어요」','코치만 · 코드가 있을 때','코칭')
sh('s.invrenew','새 코드를 만들까요?','/coaching','초대 카드 「새로 만들기」',CO+'InviteCard.tsx:189 · '+CO+'InviteCard.tsx:196',
   '확인창 · 「지금 코드와 링크는 더 쓸 수 없어요」','코드가 있을 때(누구나 · v0.91.0)','코칭')
# [원본] sh('s.cinvite','코칭 초대를 보낼까요?','/u/[userId]','「코칭 초대」(내가 코치)',UP+':543 · '+UP+':387',
# [원본]    '확인창 · 「○○님이 수락하면 연결돼요. 보여 줄 범위는 ○○님이 골라요」','내가 코치이고 상대와 연결이 없을 때 · 상대가 이미 코치가 있으면 버튼 대신 안내 줄','코칭')
sh('s.cinvite','○○님을 내 회원으로 초대할까요?','/u/[userId]','「내 회원으로 초대」',UP+':543 · '+UP+':387',
   '확인창 · 「수락하면 내가 ○○님의 코치가 돼요. 보여 줄 범위는 ○○님이 골라요」 · 주 버튼 「내 회원으로 초대」 · 보내면 「회원 초대를 보냈어요」','상대와 연결이 없으면 누구나(v0.91.0 · SPEC-052)','코칭')
# [원본] sh('s.homemembers','홈 「담당 회원」 카드','/','운동 탭 맨 아래(저절로)','C/routines/RoutinesClient.tsx:725',
# [원본]    '「담당 회원 n명」 + 「n명이 3일 이상 쉬는 중이에요」 또는 「회원 기록·루틴은 코칭 화면에서」 · 왼쪽 청록 띠 · 누르면 /coaching',
# [원본]    '코칭 의향을 켠 사람 · 활성 회원 1명 이상 · 60초 메모리','코칭')
sh('s.homemembers','홈 「담당 회원」 카드','/','운동 탭 맨 아래(저절로)','C/routines/RoutinesClient.tsx:725',
   '「담당 회원 n명」 + 「n명이 3일 이상 쉬는 중이에요」 또는 「회원 기록·루틴은 코칭 화면에서」 · 왼쪽 청록 띠 · 누르면 /coaching',
   '코치로서 활성 연결이 있는 사람(활성 회원 1명 이상 · 다른 기기에서 회원이 연결되면 홈을 열 때·앱이 다시 보일 때 계정을 다시 받아 나타남) · 60초 메모리','코칭')
sh('s.sent','보낸 루틴 목록','/coaching/m/[memberId]','루틴 탭',MC+':222 · '+CO+'SentRoutines.tsx:101',
   '「새 루틴 짜 주기」 · 줄마다 루틴 이름 + 「○월 ○일 보냄 / 아직 보내지 않음 / 보내지 않은 변경 있음 / 코칭 끝남 / 이 기기에만 있는 초안」 · 줄을 누르면 초안 편집기 · 아래 「회원이 만든 루틴」(처방 고치기)',
   '루틴 받기 꺼짐이면 「이 기기의 초안」만 · 못 읽으면 「보낸 루틴을 불러오지 못했어요」','코칭')
sh('s.cdraft','코치 루틴 초안 편집기','s.sent','「새 루틴 짜 주기」 · 보낸 루틴 줄',CO+'SentRoutines.tsx:108 · '+CO+'SentRoutines.tsx:186',
   '평소 루틴 편집기(/routines/[초안 id])에 청록 띠 「○○님께 보낼 루틴」 + 안내 · 폴더·시작 없음 · 하단 「나중에 보내기」·「○○님께 보내기」 · 맨 아래 「초안 지우기 — 회원 루틴은 그대로 남아요」 · 다시 보내면 같은 회원 루틴이 바뀐다',
   '주소는 /routines/[id] 그대로 · 직접 만든 종목은 보낼 수 없음 · 코칭 끝남·루틴 받기 꺼짐이면 보내기 막힘(지우기는 남음)','코칭')
e('s.cdraft','/coaching/m/[memberId]','보내기 · 나중에 보내기 · ←(빈 초안은 치움)','C/routines/RoutineEditor.tsx:780 · C/routines/RoutineEditor.tsx:764 · C/routines/RoutineEditor.tsx:420','redir')
sh('s.planactual','처방 대 실제·코멘트 쓰기','/coaching/m/[memberId]','기록 탭 운동 줄 펼치기',MC+':927 · '+MC+':971 · '+MC+':999',
   '종목·세트 · 코치 루틴 운동이면 「처방 대 실제」 표(계획 n세트 중 n세트 · 범위 안 n · 줄마다 처방│실제│범위 안/적게/많이/안 함/계획 밖) · 「코치 코멘트」 말풍선(숨기기) + 입력칸(300자 · 「남기기」)',
   '처방 대 실제는 코치 루틴으로 한 운동만 · 코멘트는 한 회원에게 하루 20개 · 기록 보기 꺼짐이면 쓰기 막힘','코칭')
e('/coaching/m/[memberId]','s.rxed','루틴 탭 「회원이 만든 루틴」 종목',CCL+':915 · '+CCL+':870','open')
sh('s.coachroutine','회원 쪽 코치 루틴(보기 화면)','s.routine-actions','코치 루틴 ⋯ 「보기」','C/routines/RoutinesClient.tsx:788 · C/routines/RoutineEditor.tsx:1042',
   '같은 주소 /routines/[id] 를 편집기 대신 읽기 보기로 · 청록 안내 「코치 ○○님이 짠 루틴이에요」 · 이름·메모·종목 줄(n세트 · 횟수) · 폴더만 고침 · 「루틴 삭제」 · 하단 「내 루틴으로 복사」·「이 루틴으로 시작」. 홈 줄은 왼쪽 청록 띠 + 「코치 ○○」 칩 + 새로 받음 점, 미리보기는 「편집」 대신 「내 루틴으로 복사」, ⋯ 맨 위도 「내 루틴으로 복사」',
   '코치가 보낸 루틴(origin coach)만 · 코칭이 끝나면 회색 「코칭 끝남」 칩·편집 가능','코칭')
e('s.routinepreview','s.coachroutine','코치 루틴 미리보기 「내 루틴으로 복사」 → 복사본','C/routines/RoutinePreviewSheet.tsx:366')
sh('s.ccomment','기록 상세 코치 코멘트','/history/[id]','운동 상세 아래(저절로)','C/analytics/WorkoutDetailClient.tsx:325 · '+CO+'CoachComments.tsx:334',
   '「코치 코멘트」 · 청록 말풍선(○○ 코치 · 날짜 · 본문) · 회원도 「숨기기」(확인창) · 코치가 탈퇴하면 「탈퇴한 코치」',
   '코멘트가 있을 때 · 코멘트 알림(?comments=1)으로 오면 그 자리로 · 코칭을 안 하는 사람은 묻지 않음','코칭')
# 들어가는 길·나가는 길
e('/coaching','/coaching/m/[memberId]','담당 회원 줄(아바타·이름)',CCL+':695 · '+CCL+':627')
e('/coaching/m/[memberId]','/coaching','띠 「나가기」 · 「코칭 화면으로」(끝남)',MC+':271 · '+MC+':301')
e('/messages/[id]','/coaching/m/[memberId]','머리 「코칭 중」 배지(내가 코치일 때)','C/dm/ConversationClient.tsx:298')
e('s.homemembers','/coaching','카드 누르기',CO+'HomeMembersCard.tsx:114')
e('/coaching/join','/coaching','← · 연결 뒤 · 「코칭 화면으로」',JC+':181 · '+JC+':98 · '+JC+':228')
e('/coaching/join','/account','「로그인」(로그인 뒤 이 화면으로)',JC+':135')
e('/account','/coaching/join','로그인 뒤 next(초대 링크)','C/profile/AuthClient.tsx:175','redir')
e('x.url','/coaching/join','코치가 복사·공유한 초대 링크 /coaching/join?code=',CO+'InviteCard.tsx:177','ext')
e('/u/[userId]','/coaching','「코칭 중」·「코칭 수락 대기」·「이미 코치가 있어요」 줄',UP+':507 · '+UP+':554')
e('/notifications','/coaching','코칭 요청·수락·해지 알림','C/dm/NotificationsClient.tsx:73')
e('/notifications','/','코치 루틴 받음·바뀜 알림(동기 뒤)','C/dm/NotificationsClient.tsx:76')
e('/notifications','/history/[id]','코치 코멘트 알림(동기 뒤 · 코멘트 자리로)','C/dm/NotificationsClient.tsx:79')
# 구역
# [원본] AREAS['/coaching']=[('하위 앱바','← 프로필 · 「코칭」',CCL+':639'),('자격 아님 고지','',CCL+':371'),
# [원본]  ('초대 코드 카드','코치만 · 코드 4-4 · ○월 ○일까지 · 링크 복사·공유 · 링크 · 「새로 만들기」(없으면 「코드 만들기」)',CO+'InviteCard.tsx:89'),
# [원본]  ('내 코치','줄 = 아바타 · 이름 · 코치 배지 · 상태(코칭 중 청록) · ⋯',CCL+':379'),('코드로 연결','8자리 입력 + 「확인」 → 범위 시트 · 오류 한 줄',CCL+':395'),
# [원본]  ('담당 회원','줄 = 이름 · 상태 · 점검(이번 주 n회 · 마지막 ○ · 코치 루틴 n회 · 「n일째 쉬는 중」) · 요청 한 줄 메시지 · 「수락」 · ⋯ · 줄을 누르면 회원 화면',CCL+':434'),
# [원본]  ('트레이너 찾기','이름 검색 · 결과 줄 「코칭 요청」/「요청됨」',CCL+':459')]
AREAS['/coaching']=[('하위 앱바','← 프로필 · 「코칭」',CCL+':639'),('자격 아님 고지','',CCL+':371'),
 ('초대 코드 카드','누구나 · 자리는 담당 회원 목록 아래 · 코드 4-4 · ○월 ○일까지 · 링크 복사·공유 · 링크 · 「새로 만들기」(없으면 「코드 만들기」 — 코치가 아니면 보조 버튼)',CO+'InviteCard.tsx:89 · '+CCL+':457'),
 ('내 코치','줄 = 아바타 · 이름 · 코치 배지 · 상태(코칭 중 청록) · ⋯',CCL+':379'),('코드로 연결','8자리 입력 + 「확인」 → 범위 시트 · 오류 한 줄',CCL+':395'),
 ('담당 회원','줄 = 이름 · 상태 · 점검(이번 주 n회 · 마지막 ○ · 코치 루틴 n회 · 「n일째 쉬는 중」) · 요청 한 줄 메시지 · 「수락」 · ⋯ · 줄을 누르면 회원 화면',CCL+':434'),
 ('코치 찾기','이름 검색(코치 찾기 노출을 켠 사람만) · 결과 줄 「코치」 배지(활성 회원이 있을 때) · 「코치로 요청」/「요청됨」',CCL+':459 · '+CCL+':497')]
# [원본] AREAS['/coaching/join']=[('하위 앱바','← 코칭 · 「코치와 연결」',JC+':179'),('코치 카드','이름 · 코치 배지 · 소개 · 태그',JC+':161'),('코드','4-4',JC+':168'),('「연결하기」','범위 시트를 연다',JC+':171'),
AREAS['/coaching/join']=[('하위 앱바','← 코칭 · 「코치와 연결」',JC+':179'),('코치 카드','이름 · 코치 배지(활성 회원이 있을 때만) · 소개·태그(코치 찾기 노출을 켰을 때만)',JC+':161 · '+JC+':166'),('코드','4-4',JC+':168'),('「연결하기」','범위 시트를 연다',JC+':171'),
 ('상태별 안내','코드 없음 · 로그인 필요 · 못 쓰는 코드',JC+':111')]
AREAS['/coaching/m/[memberId]']=[('청록 띠','「○○님 기록 · 코칭 중」 · 「나가기」',MC+':258'),('탭','기록 · 분석 · 루틴',MC+':171'),
 ('기록 탭','날짜별 운동 줄(코치 루틴 칩 · 시간·세트·볼륨·코멘트 n) · 펼치면 세트·처방 대 실제·코멘트',MC+':750'),
 ('기록 탭 · 아래','「연결한 날 뒤 기록만 보여요」 · 「더 보기」 · 「더 이전 기록이 없어요」',MC+':823'),
 ('분석 탭','보는 기간 · 요약 숫자·부위별 볼륨·최근 세션 · 체중·인바디 카드(체중 공개 때만)',MC+':244'),
 ('루틴 탭','보낸 루틴(「새 루틴 짜 주기」) · 회원이 만든 루틴',MC+':216'),('범위 꺼짐 안내','기록 보기 꺼짐 · 루틴 받기 꺼짐',MC+':340'),('끝남','「코칭이 끝났어요」 · 「코칭 화면으로」',MC+':291')]
AREAS['/']=AREAS['/']+[('담당 회원 카드','코치만 · 맨 아래 · 「담당 회원 n명」 · 쉬는 회원 수','C/routines/RoutinesClient.tsx:725')]
