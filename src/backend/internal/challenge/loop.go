// 판정 루프(SPEC-064 · SRS-120) — 시작/취소 · 첫 판정 · 확정 · 21시 미완료 알림 · 끝 · 사진 보관 삭제.
//
// 한 회차 = 트랜잭션 하나 + pg_try_advisory_xact_lock(서버가 여러 대여도 한 곳만 돈다 · REV-159).
// 알림은 challenge_notices 에 처음 넣을 때만 보내고, 커밋한 뒤에 보낸다(되돌린 회차의 알림이 새지 않게).
// 21시 알림은 「now ≥ 21:00 이고 기록 없음」이라 재시작해도 놓치거나 겹치지 않는다.
package challenge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

type pendingNotice struct{ user, kind, ref string }

// Loop 는 every 마다 RunOnce 를 돈다. 뜨자마자 한 번 돈다.
func (s *Service) Loop(ctx context.Context, every time.Duration) {
	if every <= 0 {
		every = 10 * time.Minute
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := s.runOnceSafe(ctx, s.now()); err != nil && ctx.Err() == nil {
			slog.Warn("챌린지 판정 회차 실패", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// runOnceSafe — 회차 밖(목록·보관 삭제)의 panic 도 루프를 죽이지 않게.
func (s *Service) runOnceSafe(ctx context.Context, now time.Time) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("챌린지 판정 회차 panic: %v", r)
		}
	}()
	return s.RunOnce(ctx, now)
}

// RunOnce 는 한 회차다(시험은 now 를 넣어 부른다).
//
// [개선] 챌린지마다 트랜잭션을 따로 연다(REV-160 2) — 한 챌린지의 오류가 회차 전체를 되돌려 모든 챌린지의
// 판정이 멈추지 않게. 같은 챌린지는 pg_try_advisory_xact_lock(7321064, hashtext(id)) 로 한 서버만 돈다.
// 실패한 챌린지는 로그를 남기고 다음으로 넘어간다(다음 회차에 다시).
func (s *Service) RunOnce(ctx context.Context, now time.Time) error {
	var ids []string
	if err := s.repo.InTx(ctx, func(tx Tx) error {
		ids = nil
		for _, st := range []string{StatusRecruiting, StatusActive} {
			cs, err := tx.ListByStatus(ctx, st)
			if err != nil {
				return err
			}
			for _, c := range cs {
				ids = append(ids, c.ID)
			}
		}
		return nil
	}); err != nil {
		return err
	}
	var errsOut []error
	for _, id := range ids {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := s.runChallenge(ctx, id, now); err != nil {
			slog.Warn("챌린지 판정 실패", "challenge", id, "err", err)
			errsOut = append(errsOut, err)
		}
	}
	if err := s.purge(ctx, now); err != nil {
		errsOut = append(errsOut, err)
	}
	return errors.Join(errsOut...)
}

// runChallenge — 챌린지 하나의 시작/취소 · 판정 · 알림 · 끝(트랜잭션 하나).
func (s *Service) runChallenge(ctx context.Context, id string, now time.Time) (rerr error) {
	// 이상한 옛 기록 하나로 panic 이 나도 그 챌린지만 건너뛴다 — API 전체가 재시작을 되풀이하지 않게(REV-163 2차 M-2)
	defer func() {
		if r := recover(); r != nil {
			rerr = fmt.Errorf("챌린지 %s 판정 panic: %v", id, r)
		}
	}()
	var out []pendingNotice
	err := s.repo.InTx(ctx, func(tx Tx) error {
		out = nil
		ok, err := tx.TryChallengeLock(ctx, id)
		if err != nil || !ok {
			return err
		}
		add := func(chID, user, kind, ref string) error {
			first, err := tx.InsertNotice(ctx, chID, user, kind, ref)
			if err != nil {
				return err
			}
			if first {
				out = append(out, pendingNotice{user, kind, ref})
			}
			return nil
		}
		c, err := tx.GetChallenge(ctx, id, false)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil
			}
			return err
		}
		switch c.Status {
		case StatusRecruiting:
			if now.Before(c.Rule.StartsOn.Start()) {
				return nil
			}
			ms, err := tx.Members(ctx, c.ID)
			if err != nil {
				return err
			}
			act := activeIDs(ms)
			if len(act) >= 2 {
				_, err := tx.SetStatus(ctx, c.ID, StatusRecruiting, StatusActive, now)
				return err
			}
			if ok, err := tx.SetStatus(ctx, c.ID, StatusRecruiting, StatusCancelled, now); err != nil {
				return err
			} else if ok {
				for _, u := range act {
					if err := add(c.ID, u, NoticeCancelled, c.Rule.StartsOn.String()); err != nil {
						return err
					}
				}
			}
			return nil
		case StatusActive:
			return s.judgeChallenge(ctx, tx, c, now, add)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, n := range out {
		s.notify.NotifySelf(ctx, n.user, n.kind, id)
	}
	return nil
}

// [원본] 모든 챌린지를 트랜잭션 하나로 돌던 회차 — 하나가 실패하면 전체가 되돌려졌다(REV-160 2). 부르지 않는다.
func (s *Service) runOnceOneTx(ctx context.Context, now time.Time) error {
	var out []pendingNotice
	var chOf []string
	err := s.repo.InTx(ctx, func(tx Tx) error {
		ok, err := tx.TryLoopLock(ctx)
		if err != nil || !ok {
			return err
		}
		out, chOf = nil, nil
		add := func(chID, user, kind, ref string) error {
			first, err := tx.InsertNotice(ctx, chID, user, kind, ref)
			if err != nil {
				return err
			}
			if first {
				out = append(out, pendingNotice{user, kind, ref})
				chOf = append(chOf, chID)
			}
			return nil
		}
		// 1. 시작 / 취소
		rec, err := tx.ListByStatus(ctx, StatusRecruiting)
		if err != nil {
			return err
		}
		for _, c := range rec {
			if now.Before(c.Rule.StartsOn.Start()) {
				continue
			}
			ms, err := tx.Members(ctx, c.ID)
			if err != nil {
				return err
			}
			act := activeIDs(ms)
			if len(act) >= 2 {
				if _, err := tx.SetStatus(ctx, c.ID, StatusRecruiting, StatusActive, now); err != nil {
					return err
				}
				continue
			}
			if ok, err := tx.SetStatus(ctx, c.ID, StatusRecruiting, StatusCancelled, now); err != nil {
				return err
			} else if ok {
				for _, u := range act {
					if err := add(c.ID, u, NoticeCancelled, c.Rule.StartsOn.String()); err != nil {
						return err
					}
				}
			}
		}
		// 2. 진행 중 — 판정·알림·끝
		act, err := tx.ListByStatus(ctx, StatusActive)
		if err != nil {
			return err
		}
		for _, c := range act {
			if err := s.judgeChallenge(ctx, tx, c, now, add); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	for i, n := range out {
		s.notify.NotifySelf(ctx, n.user, n.kind, chOf[i])
	}
	return s.purge(ctx, now)
}

func (s *Service) judgeChallenge(ctx Ctx, tx Tx, c Challenge, now time.Time, add func(ch, user, kind, ref string) error) error {
	r := c.Rule
	ms, err := tx.Members(ctx, c.ID)
	if err != nil {
		return err
	}
	rows, err := tx.Days(ctx, c.ID)
	if err != nil {
		return err
	}
	// 기간 + 다음 날(마지막 날 만회) 운동을 한 번에 읽는다
	ws, err := tx.JudgeWorkouts(ctx, memberIDs(ms), r.StartsOn.Start(), r.LastDay().Add(2).Start())
	if err != nil {
		return err
	}
	ps, err := tx.Proofs(ctx, c.ID, "")
	if err != nil {
		return err
	}
	byKey := map[string]*DayRow{}
	passes := map[string]int{} // user|week → 확정된 pass 수
	for i := range rows {
		row := rows[i]
		dr := row.DayRow
		byKey[row.UserID+"|"+row.Day.String()] = &dr
		if row.Result == ResPass {
			passes[row.UserID+"|"+itoa(r.WeekIndex(row.Day))]++
		}
	}
	today := DayOf(now)
	allFinal := true
	for _, m := range ms {
		last := r.LastDay()
		if m.LeftAt != nil {
			if ld := DayOf(*m.LeftAt); ld.Before(last) {
				last = ld // 나간 날까지만 판정한다(다음 날부터 안 함)
			}
		}
		uw, up := workoutsOf(ws, m.UserID), proofsOf(ps, m.UserID)
		for d := r.StartsOn; !d.After(last); d = d.Add(1) {
			if !r.IsRequired(d) {
				continue
			}
			key := m.UserID + "|" + d.String()
			prev := byKey[key]
			wk := m.UserID + "|" + itoa(r.WeekIndex(d))
			used := passes[wk]
			if prev != nil && prev.Result == ResPass {
				used-- // 자기 자신은 빼고 센다
			}
			next, changed := Judge(JudgeInput{Rule: r, Day: d, Prev: prev, Workouts: uw, Proofs: up, PassesUsed: used, Now: now})
			if changed {
				if err := s.writeDay(ctx, tx, c, m.UserID, d, next, now); err != nil {
					return err
				}
				if next.Result == ResPass {
					passes[wk]++
				}
				// [원본] next.Result == ResMissedOpen 만 — 루프가 오래 멈춰 바로 missed 로 확정되면 알림이 없었다(REV-160 7)
				if (next.Result == ResMissedOpen || next.Result == ResMissed) && m.Active() {
					if err := add(c.ID, m.UserID, NoticeMissed, d.String()); err != nil {
						return err
					}
				}
				prev = next
			}
			if prev == nil || !prev.Final {
				allFinal = false
			}
		}
		// 21시 미완료(오늘 해야 하는데 아직 인정된 운동이 없다)
		if m.Active() && r.IsRequired(today) && !now.Before(today.Reminder()) && now.Before(today.End()) {
			if _, ok := BestCredit(r, today, uw, up, r.MinSets); !ok {
				if err := add(c.ID, m.UserID, NoticeRemind, today.String()); err != nil {
					return err
				}
			}
		}
	}
	// 3. 끝 — 마지막 날 확정 시각이 지났고 모든 날이 확정
	if allFinal && !now.Before(r.LastDay().Finalize()) {
		if ok, err := tx.SetStatus(ctx, c.ID, StatusActive, StatusEnded, now); err != nil {
			return err
		} else if ok {
			for _, u := range activeIDs(ms) {
				if err := add(c.ID, u, NoticeEnded, r.LastDay().String()); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// purge — 끝·취소 30일이 지난 챌린지의 사진 파일을 지운다(처리 안 된 신고가 걸린 사진은 미룬다 · REV-159).
// 파일 지우기는 트랜잭션 밖에서 한다(느린 IO). 지우기는 멱등이라 여러 서버가 겹쳐도 무해하다.
func (s *Service) purge(ctx Ctx, now time.Time) error {
	// 탈퇴한 사람의 인증 — 파일을 지우고 행을 지운다(REV-159)
	var orphans []KeyRow
	var due []string
	locked := false
	// [개선] 삭제 목록은 잠금을 잡은 서버 하나만 만든다(REV-160 8) — 지우기 자체는 멱등이라 겹쳐도 무해하지만 헛일을 줄인다
	if err := s.repo.InTx(ctx, func(tx Tx) error {
		ok, err := tx.TryPurgeLock(ctx)
		if err != nil || !ok {
			return err
		}
		locked = true
		if orphans, err = tx.OrphanProofs(ctx); err != nil {
			return err
		}
		due, err = tx.PurgeDue(ctx, now.Add(-PhotoRetention))
		return err
	}); err != nil || !locked {
		return err
	}
	if len(orphans) > 0 {
		var gone []string
		for _, k := range orphans {
			if k.Key != "" {
				if err := s.photos.Delete(ctx, k.Key); err != nil {
					slog.Warn("탈퇴 인증 사진 삭제 실패", "err", err)
					continue
				}
			}
			gone = append(gone, k.ID)
		}
		if err := s.repo.InTx(ctx, func(tx Tx) error {
			for _, id := range gone {
				if err := tx.DeleteProof(ctx, id); err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			return err
		}
	}
	for _, id := range due {
		var keys []KeyRow
		if err := s.repo.InTx(ctx, func(tx Tx) error {
			var err error
			keys, err = tx.PurgeKeys(ctx, id)
			return err
		}); err != nil {
			return err
		}
		var done []string
		for _, k := range keys {
			if err := s.photos.Delete(ctx, k.Key); err != nil {
				slog.Warn("인증 사진 보관 삭제 실패", "err", err)
				continue
			}
			done = append(done, k.ID)
		}
		if err := s.repo.InTx(ctx, func(tx Tx) error {
			for _, pid := range done {
				if err := tx.ClearKey(ctx, pid); err != nil {
					return err
				}
			}
			if err := tx.DeletePrompts(ctx, id); err != nil {
				return err
			}
			n, err := tx.CountKeys(ctx, id)
			if err != nil {
				return err
			}
			if n == 0 {
				return tx.MarkPurged(ctx, id, now)
			}
			return nil
		}); err != nil {
			return err
		}
	}
	return nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
