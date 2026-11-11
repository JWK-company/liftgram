package org.tarae.liftgram.lock;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.View;
import java.util.ArrayList;
import java.util.List;
import org.tarae.liftgram.R;

/**
 * 이 운동의 남은 세트 표(SPEC-062) — 값 칸 아래 남는 높이를 그대로 받아(부모의 가중치 1 칸) 들어가는 줄만 직접 그린다.
 * 폰마다 높이가 달라도 재는 리스너·다시 그리기 순환이 없다(REV-151 1): 높이는 레이아웃이 준 크기 그대로(getHeight) · 줄 수는 그릴 때 정한다.
 * 정보 표시라 누르는 것처럼 보이지 않게 바탕·테두리 없이 글자와 줄 사이 구분선만(REV-151 5).
 */
final class LockRemainingView extends View {
    /** 한 줄 = 한 단계(슈퍼세트면 묶음 멤버를 한 줄에 · 넘치면 줄임표) */
    static final class Line {
        final String label;
        final String value;
        final String spoken;
        final boolean changed;

        Line(String label, String value, String spoken, boolean changed) {
            this.label = label;
            this.value = value;
            this.spoken = spoken;
            this.changed = changed;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Line)) return false;
            Line x = (Line) o;
            return label.equals(x.label) && value.equals(x.value) && spoken.equals(x.spoken) && changed == x.changed;
        }

        @Override
        public int hashCode() {
            return label.hashCode() * 31 + value.hashCode();
        }
    }

    private final TextPaint head = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint lab = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint val = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint valBold = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final Paint rule = new Paint();
    private List<Line> lines = new ArrayList<>();
    private String nextName;
    private boolean cut;
    private boolean forward;
    private int ink, ink2, ink3;

    LockRemainingView(Context ctx) {
        super(ctx);
        head.setTextSize(sp(13));
        lab.setTextSize(sp(15));
        val.setTextSize(sp(16));
        valBold.setTextSize(sp(16));
        valBold.setTypeface(Typeface.DEFAULT_BOLD);
        rule.setStrokeWidth(Math.max(1f, dp(1)));
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    void setColors(int ink, int ink2, int ink3, int line) {
        this.ink = ink;
        this.ink2 = ink2;
        this.ink3 = ink3;
        head.setColor(ink3);
        lab.setColor(ink3);
        val.setColor(ink2);
        valBold.setColor(ink);
        rule.setColor(line);
        invalidate();
    }

    /** 같은 내용이면 아무것도 하지 않는다 — 1초 틱마다 불려도 다시 그리지 않게(REV-151 3) */
    void set(List<Line> ls, String next, boolean truncated, boolean forwardOn) {
        if (ls.equals(lines) && TextUtils.equals(next, nextName) && truncated == cut && forwardOn == forward) return;
        lines = new ArrayList<>(ls);
        nextName = next;
        cut = truncated;
        forward = forwardOn;
        // 읽기는 들어가는 줄과 상관없이 전부 — 숨긴 줄도(REV-151 9)
        if (lines.isEmpty()) {
            setContentDescription(null);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        } else {
            StringBuilder d = new StringBuilder(title());
            for (Line l : lines) d.append(", ").append(l.spoken);
            if (nextName != null) d.append(", ").append(getContext().getString(R.string.lock_next, nextName));
            setContentDescription(d);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        }
        invalidate();
    }

    private String title() {
        // 켠 채 고르는 중 — 편집 줄이 닫혀도 「적용 중」이 남는다(REV-151 7)
        if (forward) return base() + " · " + getContext().getString(R.string.lock_forward_on);
        return base();
    }

    private String base() {
        return cut
                ? getContext().getString(R.string.lock_remaining_title_more, lines.size())
                : getContext().getString(R.string.lock_remaining_title, lines.size());
    }

    /**
     * 들어가는 줄 계획(순수 함수 · 단위 시험) — lines = 들어가는 줄 수(머리 줄 포함), n = 남은 단계 수.
     * 돌려주는 값: 그릴 단계 줄 수(0 = 표를 감춤). 다 들어가지 않으면 머리(「… · +m세트 더」) + k줄, 머리 + 한 줄도 안 들어가면 감춘다.
     * 「다음: …」은 단계를 다 그리고도 한 줄이 남을 때만(그 결정은 {@link #showsNext}).
     */
    static int fit(int lines, int n) {
        if (n <= 0 || lines < 2) return 0;
        if (lines >= 1 + n) return n;
        int k = lines - 1;
        // 360×640 에선 2줄 자리뿐이다(실측) — 머리가 총수를 말하니 한 줄이라도 보인다
        return k >= 1 ? k : 0;
    }

    static boolean showsNext(int lines, int n, boolean hasNext) {
        return hasNext && n > 0 && lines >= 2 + n;
    }

    private float lineH() {
        Paint.FontMetrics f = val.getFontMetrics();
        return (f.descent - f.ascent) + dp(12);
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        // 높이 제한이 없을 때(내용이 화면을 넘어 스크롤될 때)는 0 — 남는 높이가 없으니 표도 없다
        int h = MeasureSpec.getMode(hSpec) == MeasureSpec.UNSPECIFIED ? 0 : MeasureSpec.getSize(hSpec);
        setMeasuredDimension(MeasureSpec.getSize(wSpec), h);
    }

    @Override
    protected void onDraw(Canvas c) {
        if (lines.isEmpty() || getHeight() <= 0) return;
        float lh = lineH();
        float top = dp(14);
        int avail = (int) Math.floor((getHeight() - top) / lh);
        int n = lines.size();
        int shown = fit(avail, n);
        if (shown == 0) return;
        float w = getWidth();
        float y = top;
        Paint.FontMetrics hf = head.getFontMetrics();
        // 「+m세트 더」는 자리를 먼저 잡고 앞부분만 줄인다 — 좁은 폭·큰 글자에서 가장 중요한 숫자가 잘리지 않게(REV-152 낮음)
        String more = shown < n
                ? " · " + (cut
                        ? getContext().getString(R.string.lock_remaining_more_cut, n - shown)
                        : getContext().getString(R.string.lock_remaining_more, n - shown))
                : "";
        float moreW = Math.min(head.measureText(more), w);
        CharSequence ts = TextUtils.ellipsize(title(), head, Math.max(0f, w - moreW), TextUtils.TruncateAt.END);
        float hy = y + (lh + (-hf.ascent - hf.descent)) / 2f;
        c.drawText(ts, 0, ts.length(), 0, hy, head);
        if (!more.isEmpty()) c.drawText(more, head.measureText(ts, 0, ts.length()), hy, head);
        y += lh;
        float labW = lab.measureText("WW") + dp(14);
        Paint.FontMetrics vf = val.getFontMetrics();
        for (int i = 0; i < shown; i++) {
            Line l = lines.get(i);
            c.drawLine(0, y, w, y, rule);
            float base = y + (lh + (-vf.ascent - vf.descent)) / 2f;
            c.drawText(l.label, 0, base, lab);
            TextPaint vp = l.changed ? valBold : val;
            String mark = l.changed ? " ↻" : "";
            CharSequence s = TextUtils.ellipsize(l.value + mark, vp, Math.max(0f, w - labW), TextUtils.TruncateAt.END);
            c.drawText(s, 0, s.length(), labW, base, vp);
            y += lh;
        }
        c.drawLine(0, y, w, y, rule);
        String tail = null;
        if (shown == n && showsNext(avail, n, nextName != null)) {
            tail = getContext().getString(R.string.lock_next, nextName);
        }
        if (tail != null) {
            CharSequence s = TextUtils.ellipsize(tail, head, w, TextUtils.TruncateAt.END);
            c.drawText(s, 0, s.length(), 0, y + (lh + (-hf.ascent - hf.descent)) / 2f, head);
        }
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private float sp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, getResources().getDisplayMetrics());
    }
}
