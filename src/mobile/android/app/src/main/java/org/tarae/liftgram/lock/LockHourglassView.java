package org.tarae.liftgram.lock;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Build;
import android.provider.Settings;
import android.view.View;

/**
 * 쉬는 시간 모래시계(SPEC-060 · 3A) — 원형 링(LockRingView) 대신.
 * 위 모래 = 남은 비율 · 아래 모래 = 쉰 비율 · 쉬는 중엔 가는 줄기. 쉬지 않을 땐 위가 가득 찬 멈춘 그림.
 * 휴식이 끝나는 순간 0.4초 뒤집힌다(「애니메이션 제거」면 안 뒤집음). 계속 도는 애니메이션은 없다 — 1초 틱마다 값만 바뀐다(배터리).
 * 장식 그림이라 접근성에서 뺀다(시계 글자가 읽힌다).
 */
final class LockHourglassView extends View {
    private final Paint frame = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cap = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sand = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path glass = new Path();
    private final Path top = new Path();
    private final Path bottom = new Path();
    private final RectF r = new RectF();
    /** 남은 비율 0~1 */
    private float remain = 1f;
    private boolean running;
    private float rotation;
    private ValueAnimator flip;

    LockHourglassView(Context ctx) {
        super(ctx);
        frame.setStyle(Paint.Style.STROKE);
        cap.setStyle(Paint.Style.FILL);
        sand.setStyle(Paint.Style.FILL);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    void setColors(int frameColor, int capColor, int sandColor) {
        frame.setColor(frameColor);
        cap.setColor(capColor);
        sand.setColor(sandColor);
        invalidate();
    }

    /**
     * @param resting 쉬는 중인가
     * @param remainFraction 남은 비율(쉬는 중일 때만 뜻이 있다)
     * @param animateEnd 쉬는 중 → 아님으로 바뀐 이번 순간 뒤집어도 되나(첫 그림·재빌드 직후엔 거짓)
     */
    void set(boolean resting, float remainFraction, boolean animateEnd) {
        float next = resting ? Math.max(0f, Math.min(1f, remainFraction)) : 1f;
        boolean ended = running && !resting;
        if (next == remain && resting == running) return;
        remain = next;
        running = resting;
        if (ended && animateEnd && animatorsOn(getContext())) startFlip();
        invalidate();
    }

    private void startFlip() {
        stopFlip();
        flip = ValueAnimator.ofFloat(0f, 180f);
        flip.setDuration(400);
        flip.addUpdateListener(a -> {
            rotation = (float) a.getAnimatedValue();
            invalidate();
        });
        flip.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator a) {
                rotation = 0f; // 뒤집힌 뒤의 그림 = 위가 가득(멈춘 그림) — 같은 모양이라 0 으로 돌려도 티가 안 난다
                invalidate();
            }
        });
        flip.start();
    }

    void stopFlip() {
        if (flip != null) {
            flip.cancel();
            flip = null;
        }
        rotation = 0f;
    }

    @Override
    protected void onDetachedFromWindow() {
        stopFlip();
        super.onDetachedFromWindow();
    }

    /** 「애니메이션 제거」 — areAnimatorsEnabled 는 API 26 부터(REV-146 안드로이드 3) */
    static boolean animatorsOn(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) return ValueAnimator.areAnimatorsEnabled();
        try {
            return Settings.Global.getFloat(ctx.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f;
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        if (w <= 0 || h <= 0) return;
        float stroke = Math.max(2f, w * 0.045f);
        frame.setStrokeWidth(stroke);
        float capH = h * 0.07f;
        float left = w * 0.16f, right = w * 0.84f;
        float y0 = capH, y1 = h - capH, mid = h / 2f;
        float neck = w * 0.06f;
        c.save();
        if (rotation != 0f) c.rotate(rotation, w / 2f, h / 2f);
        // 유리 — 위 사다리꼴 → 목 → 아래
        glass.reset();
        glass.moveTo(left, y0);
        glass.lineTo(right, y0);
        glass.cubicTo(right, mid - h * 0.12f, w / 2f + neck, mid - h * 0.05f, w / 2f + neck, mid);
        glass.cubicTo(w / 2f + neck, mid + h * 0.05f, right, mid + h * 0.12f, right, y1);
        glass.lineTo(left, y1);
        glass.cubicTo(left, mid + h * 0.12f, w / 2f - neck, mid + h * 0.05f, w / 2f - neck, mid);
        glass.cubicTo(w / 2f - neck, mid - h * 0.05f, left, mid - h * 0.12f, left, y0);
        glass.close();
        // 모래 — 유리 안쪽을 잘라 높이로 채운다
        c.save();
        c.clipPath(glass);
        float topSpan = mid - y0 - stroke;
        float topLevel = mid - topSpan * remain; // 위 모래 윗면
        if (remain > 0f) {
            r.set(0, topLevel, w, mid);
            c.drawRect(r, sand);
        }
        float botSpan = y1 - mid - stroke;
        float done = running ? 1f - remain : 0f;
        if (done > 0f) {
            r.set(0, y1 - botSpan * done, w, y1);
            c.drawRect(r, sand);
        }
        if (running && remain > 0f) {
            r.set(w / 2f - stroke * 0.35f, mid, w / 2f + stroke * 0.35f, y1);
            c.drawRect(r, sand);
        }
        c.restore();
        c.drawPath(glass, frame);
        // 위·아래 받침
        r.set(w * 0.08f, 0, w * 0.92f, capH);
        c.drawRoundRect(r, capH * 0.3f, capH * 0.3f, cap);
        r.set(w * 0.08f, h - capH, w * 0.92f, h);
        c.drawRoundRect(r, capH * 0.3f, capH * 0.3f, cap);
        c.restore();
    }
}
