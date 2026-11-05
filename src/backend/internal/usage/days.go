package usage

import "time"

// AggregateDays 는 다시 계산할 날들이다. 오늘까지 최근 RecomputeDays 일에, 마지막 집계일이 더 이르면 거기까지 넓혀
// 빠진 날을 채운다. 집계가 한 번도 없었으면 첫 이벤트 날부터. 원본이 남아 있는 범위(RetainDays)를 넘지 않는다.
func AggregateDays(today time.Time, lastDaily, firstEvent string) []string {
	end := today.In(KST)
	end = time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, KST)
	start := end.AddDate(0, 0, -(RecomputeDays - 1))
	from := lastDaily
	if from == "" {
		from = firstEvent
	}
	if from != "" {
		if t, err := time.ParseInLocation("2006-01-02", from, KST); err == nil && t.Before(start) {
			start = t
		}
	}
	if floor := end.AddDate(0, 0, -RetainDays); start.Before(floor) {
		start = floor
	}
	days := []string{}
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		days = append(days, d.Format("2006-01-02"))
	}
	return days
}
