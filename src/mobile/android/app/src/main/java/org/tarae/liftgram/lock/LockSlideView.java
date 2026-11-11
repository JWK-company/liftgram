package org.tarae.liftgram.lock;

import android.content.Context;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat;
import java.util.Collections;

/**
 * 밀어서 세트 완료(SPEC-060 · 2a) — 꾹 누르기 단추를 대신한다. 같은 칸이 완료 뒤 되돌리기 띠가 된다.
 * - 가로로 30dp 넘게 움직여야 손잡이가 따라온다(시안 값 · 스치는 터치는 무시) · 세로가 이기면 그 제스처를 버린다 · 첫 포인터만.
 * - 85% 넘게 밀고 놓으면 완료 · 덜 밀면 0.2초에 돌아간다.
 * - 칸 왼쪽은 시스템 뒤로 가기 제스처에서 뺀다(API 29+ · REV-146 안드로이드 1).
 * - 접근성: 역할 Button · 클릭(TalkBack 두 번 탭 · 스위치)은 바로 완료 · 되돌리기 상태의 클릭과 사용자 지정 동작은 되돌리기.
 * - 글자는 TextView 자식이라 큰 글꼴에서 자동으로 줄어든다(REV-146 안드로이드 9). 방향은 LTR 고정.
 */
final class LockSlideView extends FrameLayout {
    interface Listener {
        /** 손으로 끝까지 밀었다 */
        void onSlid();
        /** 접근성 클릭 — 확인 없이 바로 완료 */
        void onClickComplete();
        void onUndo();
        /** 손잡이를 잡고 있는 동안 참 — 그동안 화면은 재빌드·모드 전환을 미룬다 */
        void onDragging(boolean dragging);
        /** 누르기 시작이 막혀야 하나(켜진 직후 보호) */
        boolean guarded();
    }

    enum Mode { SLIDE, CONFIRM, UNDO }

    private final float density;
    private final View fill;
    private final TextView thumb;
    private final TextView label;
    private final TextView undoBtn;
    private final View timeBar;
    private final GradientDrawable bg = new GradientDrawable();
    private final GradientDrawable thumbBg = new GradientDrawable();
    private final GradientDrawable fillBg = new GradientDrawable();
    private Listener listener;
    private Mode mode = Mode.SLIDE;
    private int line, lineStrong, brand, surface;

    // 제스처
    private int pointerId = -1;
    private float downX, downY;
    private boolean armed, decided, abandoned, passed;
    private float pos;
    private long undoArmedAt;
    private long undoEndsAt;
    private final Runnable shrink = new Runnable() {
        @Override
        public void run() {
            if (mode != Mode.UNDO) return;
            long now = SystemClock.uptimeMillis();
            float left = undoEndsAt <= now ? 0f : (undoEndsAt - now) / (float) undoTotal;
            timeBar.setScaleX(Math.max(0f, Math.min(1f, left)));
            if (left > 0f) postOnAnimationDelayed(this, 50);
        }
    };
    private long undoTotal = 1;
    /** 되돌리기 띠에서 DOWN 을 봤나 — 밀기 모드의 DOWN 이 띠의 UP 으로 이어지지 않게(REV-148 1) */
    private boolean undoDownSeen;
    private android.animation.ValueAnimator back;
    private int undoActionId = View.NO_ID;

    LockSlideView(Context ctx) {
        super(ctx);
        density = ctx.getResources().getDisplayMetrics().density;
        setLayoutDirection(LAYOUT_DIRECTION_LTR);
        setClickable(true);
        setFocusable(true);
        bg.setCornerRadius(dp(4));
        setBackground(bg);

        fill = new View(ctx);
        fillBg.setCornerRadius(dp(4));
        fill.setBackground(fillBg);
        fill.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(fill, new LayoutParams(0, LayoutParams.MATCH_PARENT));

        label = new androidx.appcompat.widget.AppCompatTextView(ctx);
        label.setGravity(Gravity.CENTER);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setMaxLines(2);
        label.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(label, 11, 16, 1, TypedValue.COMPLEX_UNIT_SP);
        LayoutParams lp = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT);
        lp.leftMargin = dp(68);
        lp.rightMargin = dp(12);
        addView(label, lp);

        thumb = new TextView(ctx);
        thumb.setText("›");
        thumb.setGravity(Gravity.CENTER);
        thumb.setTypeface(Typeface.DEFAULT_BOLD);
        thumb.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        thumbBg.setCornerRadius(dp(4));
        thumb.setBackground(thumbBg);
        thumb.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        LayoutParams tp = new LayoutParams(dp(56), LayoutParams.MATCH_PARENT);
        tp.setMargins(dp(4), dp(4), dp(4), dp(4));
        addView(thumb, tp);

        undoBtn = new androidx.appcompat.widget.AppCompatTextView(ctx);
        undoBtn.setGravity(Gravity.CENTER);
        undoBtn.setTypeface(Typeface.DEFAULT_BOLD);
        undoBtn.setMaxLines(1);
        undoBtn.setPadding(dp(8), 0, dp(12), 0);
        // 칸을 고정해 큰 글꼴에서도 왼쪽 글자를 덮지 않게 줄여 넣는다
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(undoBtn, 10, 16, 1, TypedValue.COMPLEX_UNIT_SP);
        undoBtn.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        undoBtn.setVisibility(GONE);
        addView(undoBtn, new LayoutParams(dp(104), LayoutParams.MATCH_PARENT, Gravity.END));

        timeBar = new View(ctx);
        timeBar.setPivotX(0);
        timeBar.setVisibility(GONE);
        timeBar.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(timeBar, new LayoutParams(LayoutParams.MATCH_PARENT, dp(3), Gravity.BOTTOM));

        ViewCompat.setAccessibilityDelegate(this, new androidx.core.view.AccessibilityDelegateCompat() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfoCompat info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.setClassName(android.widget.Button.class.getName());
            }
        });
    }

    private int dp(float v) {
        return Math.round(v * density);
    }

    void setListener(Listener l) {
        listener = l;
    }

    void setColors(int surfaceColor, int lineColor, int lineStrongColor, int brandColor, int onBrand, int ink, int ink2) {
        surface = surfaceColor;
        line = lineColor;
        lineStrong = lineStrongColor;
        brand = brandColor;
        thumbBg.setColor(brandColor);
        thumb.setTextColor(onBrand);
        fillBg.setColor((brandColor & 0x00FFFFFF) | 0x4D000000); // 30%
        label.setTextColor(ink2);
        undoBtn.setTextColor(brandColor);
        timeBar.setBackgroundColor(brandColor);
        labelInk = ink;
        labelInk2 = ink2;
        paintFrame();
    }

    private int labelInk, labelInk2;

    private void paintFrame() {
        bg.setColor(surface);
        bg.setStroke(dp(mode == Mode.CONFIRM ? 2 : 1), mode == Mode.CONFIRM ? brand : lineStrong);
    }

    Mode mode() {
        return mode;
    }

    boolean isDragging() {
        return decided && !abandoned && pointerId != -1;
    }

    /** 밀기 · 확인 상태 — 글자와 테두리만 다르다 */
    void showSlide(Mode m, CharSequence text, CharSequence description) {
        boolean changed = mode != m;
        mode = m;
        removeCallbacks(shrink);
        undoBtn.setVisibility(GONE);
        timeBar.setVisibility(GONE);
        thumb.setVisibility(VISIBLE);
        fill.setVisibility(VISIBLE);
        LayoutParams lp = (LayoutParams) label.getLayoutParams();
        lp.leftMargin = dp(68);
        lp.rightMargin = dp(12);
        label.setLayoutParams(lp);
        label.setGravity(Gravity.CENTER);
        label.setTextColor(m == Mode.CONFIRM ? labelInk : labelInk2);
        label.setText(text);
        setContentDescription(description);
        if (changed) {
            if (undoActionId != View.NO_ID) ViewCompat.removeAccessibilityAction(this, undoActionId);
            undoActionId = View.NO_ID;
            resetThumb(false);
        }
        paintFrame();
    }

    /** 되돌리기 띠 — untilUptime 까지 · 띠가 뜬 뒤 500ms 는 터치를 받지 않는다(밀던 손가락이 되돌리기에 닿지 않게 · REV-146 안드로이드 7) */
    void showUndo(CharSequence text, CharSequence button, CharSequence description, long untilUptime, long totalMs) {
        boolean entering = mode != Mode.UNDO;
        mode = Mode.UNDO;
        thumb.setVisibility(GONE);
        fill.setVisibility(GONE);
        undoBtn.setVisibility(VISIBLE);
        undoBtn.setText(button);
        LayoutParams lp = (LayoutParams) label.getLayoutParams();
        lp.leftMargin = dp(14);
        lp.rightMargin = dp(110);
        label.setLayoutParams(lp);
        label.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        label.setTextColor(labelInk);
        label.setText(text);
        setContentDescription(description);
        timeBar.setVisibility(VISIBLE);
        undoEndsAt = untilUptime;
        undoTotal = Math.max(1, totalMs);
        if (entering) {
            // 스위치 제어·TalkBack 메뉴에도 「되돌리기」가 따로 보이게(REV-146 사용성 5)
            undoActionId = ViewCompat.addAccessibilityAction(this, button, (v, args) -> {
                if (listener != null) listener.onUndo();
                return true;
            });
            undoArmedAt = SystemClock.uptimeMillis() + 500;
            armed = false;
            undoDownSeen = false;
            pointerId = -1;
            resetThumb(false);
        }
        removeCallbacks(shrink);
        post(shrink);
        paintFrame();
    }

    // ── 제스처 ──────────────────────────────────────────────────────────

    private float maxPos() {
        return Math.max(1, getWidth() - dp(56) - dp(8));
    }

    private void place(float p) {
        pos = Math.max(0, Math.min(maxPos(), p));
        thumb.setTranslationX(pos);
        ViewGroup_setWidth(fill, pos <= 0 ? 0 : (int) (pos + dp(56) + dp(8))); // 제자리에선 채움 없음
    }

    private static void ViewGroup_setWidth(View v, int w) {
        LayoutParams lp = (LayoutParams) v.getLayoutParams();
        if (lp.width == w) return;
        lp.width = w;
        v.setLayoutParams(lp);
    }

    /** 손잡이를 처음 자리로 — animate 면 0.2초 */
    void resetThumb(boolean animate) {
        stopBack();
        if (animate && pos > 0) {
            final float from = pos;
            // 필드로 둔다 — 새로 미는 손가락과 위치를 다투지 않게 DOWN 에서 멈춘다(REV-148 3)
            back = android.animation.ValueAnimator.ofFloat(from, 0f);
            back.setDuration(200);
            back.addUpdateListener(a -> place((float) a.getAnimatedValue()));
            back.start();
        } else {
            place(0);
        }
        passed = false;
    }

    private void stopBack() {
        if (back != null) {
            back.cancel();
            back = null;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (listener == null) return false;
        if (mode == Mode.UNDO) return undoTouch(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                stopBack();
                pointerId = e.getPointerId(0);
                downX = e.getX();
                downY = e.getY();
                armed = !listener.guarded();
                decided = false;
                abandoned = !armed;
                passed = false;
                return true;
            case MotionEvent.ACTION_MOVE: {
                int i = e.findPointerIndex(pointerId);
                if (i < 0 || abandoned) return true;
                float dx = e.getX(i) - downX, dy = e.getY(i) - downY;
                if (!decided) {
                    int slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
                    if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) {
                        abandoned = true; // 세로가 이겼다 — 이 제스처는 끝까지 버린다
                        return true;
                    }
                    if (dx < dp(30)) return true;
                    decided = true;
                    if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                    listener.onDragging(true);
                }
                place(dx - dp(30));
                boolean over = pos >= maxPos() * 0.85f;
                if (over && !passed) performHapticFeedback(Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS);
                passed = over;
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN:
                return true; // 두 번째 손가락은 무시
            case MotionEvent.ACTION_POINTER_UP:
                if (e.getPointerId(e.getActionIndex()) == pointerId) finishGesture(false);
                return true;
            case MotionEvent.ACTION_UP:
                finishGesture(true);
                return true;
            case MotionEvent.ACTION_CANCEL:
                finishGesture(false);
                return true;
            default:
                return true;
        }
    }

    private void finishGesture(boolean released) {
        boolean wasDragging = decided && !abandoned;
        boolean done = released && wasDragging && pos >= maxPos() * 0.85f;
        pointerId = -1;
        decided = false;
        if (wasDragging) listener.onDragging(false);
        if (done) {
            place(maxPos());
            listener.onSlid(); // 화면이 모드를 바꾸며 손잡이를 돌려놓는다
        } else {
            resetThumb(true);
        }
    }

    /** 화면이 꺼지거나 창을 잃었다 — 완료하지 않고 원위치(REV-146 안드로이드 8) */
    void cancelGesture() {
        if (pointerId != -1 && decided && !abandoned && listener != null) listener.onDragging(false);
        pointerId = -1;
        decided = false;
        abandoned = true;
        resetThumb(false);
    }

    private boolean undoTouch(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                // 띠가 뜬 뒤 새로 시작한 터치만 · 켜진 직후 보호도
                armed = e.getEventTime() >= undoArmedAt && !listener.guarded();
                undoDownSeen = true;
                downX = e.getX();
                downY = e.getY();
                return true;
            case MotionEvent.ACTION_UP:
                // 「되돌리기」 단추 자리만(오른쪽 104dp + 여유 · REV-148 5)
                if (armed && undoDownSeen && Math.abs(e.getX() - downX) < dp(24) && Math.abs(e.getY() - downY) < dp(24) && e.getX() >= getWidth() - dp(120)) {
                    performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    listener.onUndo();
                }
                armed = false;
                undoDownSeen = false;
                return true;
            case MotionEvent.ACTION_CANCEL:
                armed = false;
                undoDownSeen = false;
                return true;
            default:
                return true;
        }
    }

    /** 터치 경로는 onTouchEvent 가 소비한다 — 여기 오는 클릭은 접근성(TalkBack 두 번 탭 · 스위치 제어)뿐 */
    @Override
    public boolean performClick() {
        super.performClick();
        if (listener == null) return true;
        if (mode == Mode.UNDO) listener.onUndo();
        else listener.onClickComplete();
        return true;
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        super.onLayout(changed, l, t, r, b);
        if (Build.VERSION.SDK_INT >= 29) {
            // 손잡이와 그 왼쪽 — 뒤로 가기 제스처가 먼저 가져가 화면이 닫히지 않게
            setSystemGestureExclusionRects(Collections.singletonList(new Rect(0, 0, Math.min(r - l, dp(56) + dp(40)), b - t)));
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(shrink);
        stopBack();
        super.onDetachedFromWindow();
    }
}
