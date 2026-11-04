package org.tarae.liftgram.lock;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** 휴식 링(SPEC-021) — 안쪽 원 + 자리 + 남은 비율 호. 글자는 부모가 위에 얹는다. */
final class LockRingView extends View {
    private final Paint face = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private float fraction = 1f;

    LockRingView(Context ctx, float strokePx) {
        super(ctx);
        face.setStyle(Paint.Style.FILL);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(strokePx);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(strokePx);
        arc.setStrokeCap(Paint.Cap.ROUND);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    void setColors(int faceColor, int trackColor, int arcColor) {
        face.setColor(faceColor);
        track.setColor(trackColor);
        arc.setColor(arcColor);
        invalidate();
    }

    void setFraction(float f) {
        if (f == fraction) return;
        fraction = f;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float inset = track.getStrokeWidth() / 2f;
        box.set(inset, inset, getWidth() - inset, getHeight() - inset);
        c.drawOval(box, face);
        c.drawOval(box, track);
        if (fraction > 0f) c.drawArc(box, -90f, 360f * fraction, false, arc);
    }
}
