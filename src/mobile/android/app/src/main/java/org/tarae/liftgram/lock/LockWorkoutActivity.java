package org.tarae.liftgram.lock;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.tarae.liftgram.MainActivity;
import org.tarae.liftgram.R;

/**
 * 잠금화면 위 전용 운동 화면(SPEC-019 §2 · SRS-100 · ADR-048 · REV-014).
 * - 잠금을 풀지 않고: 세트 완료(길게 누르기) · 무게·횟수 ± · 휴식 +30초·건너뛰기 · 다음 미리보기
 * - 운동 종료·종목 넘기기는 앱에서(「잠금 해제」 → 앱 운동 화면)
 * - 상태는 저장소(LockHub)에서 1초마다 읽어 그린다 — 조작은 카드 버튼과 같은 길(LockActionReceiver.handle)
 * - 소리는 내지 않는다(휴식 끝 소리는 RestAlarm · RestSound 담당 · #36). KEEP_SCREEN_ON 없음(기기 화면 시간대로 꺼짐 · #30).
 */
public class LockWorkoutActivity extends Activity {
    private static volatile WeakReference<LockWorkoutActivity> current = new WeakReference<>(null);
    private static volatile boolean visible;

    private static final int BG = 0xFF111418;
    private static final int CARD = 0xFF1E232A;
    private static final int INK = 0xFFFFFFFF;
    private static final int MUTED = 0xFFB4BCC6; // 바탕 대비 9:1
    private static final int BRAND = 0xFFFF5A36;
    private static final int BRAND_INK = 0xFF111418; // 강조 바탕 위 글자 — 대비 6:1
    private static final long HOLD_MS = 600;
    private static final long WAKE_GUARD_MS = 1000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "liftgram-lock-screen");
        t.setDaemon(true);
        return t;
    });
    private long ignoreUntil;
    private boolean dismissing;
    private LockView last;
    private String builtKey = "";

    private TextView title;
    private LinearLayout restBox;
    private TextView restClock;
    private LinearLayout membersBox;
    private Button complete;
    private ProgressBar holdBar;
    private TextView next;
    private TextView notice;
    private Button unlock;
    private final Map<String, Row> rows = new HashMap<>();
    // [원본] private ValueAnimator hold; — 「애니메이션 제거」(배율 0)면 한 번 탭에 완료됐다(REV-015 플랫폼 H-2) → 시계 기반
    private long holdDownAt = -1;
    /** 화면에서 낙관으로 바꾼 뒤 아직 저장소에 안 닿은 ± 수 — 그동안 온 옛 그림은 값을 덮지 않는다(REV-015 화면 #2·플랫폼 M-1) */
    private int pendingEdits;
    private final java.util.List<Runnable> repeats = new java.util.ArrayList<>();
    private long draftLostUntil;
    private LinearLayout restBtns;

    private static final class Row {
        LockView.Member m;
        TextView weight;
        TextView weightWas;
        TextView reps;
        TextView repsWas;
    }

    static Intent intent(Context ctx, boolean wake) {
        return new Intent(ctx, LockWorkoutActivity.class)
                .putExtra(LockScreenGate.EXTRA_WAKE, wake)
                // data 로 PendingIntent 를 나눈다(wake 와 아닌 것이 서로 덮지 않게)
                .setData(Uri.parse("liftgram-lock://screen/" + (wake ? "wake" : "show")));
    }

    static boolean isAlive() {
        LockWorkoutActivity a = current.get();
        return a != null && !a.isFinishing() && !a.isDestroyed();
    }

    /** 화면에 보이나(onResume~onPause) — 보이면 새로 띄우지 않고 틱이 다시 그린다 */
    static boolean isVisible() {
        return visible && isAlive();
    }

    /** 운동이 끝났거나 잠금이 풀렸다 — 화면이 꺼져 있어도 닫는다(#28) */
    static void finishIfAlive() {
        LockWorkoutActivity a = current.get();
        if (a != null) a.main.post(() -> {
            // 「잠금 해제」 진행 중이면 그 콜백이 앱을 열고 닫는다(REV-015 플랫폼 M-4)
            if (!a.isFinishing() && !a.dismissing) a.finish();
        });
    }

    // ── 수명 ──────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        current = new WeakReference<>(this);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        applyWake(getIntent());
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        }
        setContentView(build());
        LockScreenGate.cancel(this);
        // [잠금 판정 통일 · #18] onCreate 에서는 닫지 않는다 — 화면이 꺼진 채 만들어질 수 있다. 판단은 onResume·틱에서.
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        applyWake(i); // 이미 떠 있는 화면 — 휴식 끝이면 다시 켠다(#20)
        LockScreenGate.cancel(this);
    }

    /** intent 마다 화면 켜기를 다시 정한다 — 남아 있으면 끌 때마다 다시 켜진다(#1). */
    private void applyWake(Intent i) {
        boolean wake = i != null && i.getBooleanExtra(LockScreenGate.EXTRA_WAKE, false);
        // 한 번만 — 다시 만들어질 때(구성 변경) 옛 wake 를 다시 켜지 않게(REV-015 플랫폼 M-7)
        if (i != null) i.removeExtra(LockScreenGate.EXTRA_WAKE);
        if (Build.VERSION.SDK_INT >= 27) setTurnScreenOn(wake);
        else if (wake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        // 켜진 직후 주머니 속 터치를 1초 무시한다(#3)
        ignoreUntil = SystemClock.uptimeMillis() + WAKE_GUARD_MS;
        // 켜졌다 — 다음에 끌 때 다시 켜지지 않게 되돌린다(조금 뒤 · 켜는 중에 지우면 안 켜지는 기기)
        main.postDelayed(() -> {
            if (Build.VERSION.SDK_INT >= 27) setTurnScreenOn(false);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }, 1500);
        main.removeCallbacks(tick);
        main.post(tick);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (current.get() == this) visible = false; // 옛 인스턴스가 새 것의 표시를 지우지 않게(L-1)
        main.removeCallbacks(tick);
        stopHold();
        stopRepeats();
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) {
            current = new WeakReference<>(null);
            visible = false;
        }
        main.removeCallbacksAndMessages(null);
        io.shutdown();
        super.onDestroy();
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            reload();
            main.postDelayed(this, 1000);
        }
    };

    /** 저장소에서 읽고(화면 스레드 밖 · #29) 화면 스레드에서 그린다 */
    private void reload() {
        final Context app = getApplicationContext();
        try {
            io.execute(() -> {
                try {
                    LockView v = LockHub.store(app).read(s -> LockView.of(s, System.currentTimeMillis()));
                    main.post(() -> render(v));
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "운동 화면 읽기 실패", e);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // 닫히는 중
        }
    }

    /** 닫을 때인가 — 운동이 없거나, 화면이 켜져 있고 잠금이 풀렸다(#18). 꺼진 채로는 닫지 않는다. */
    private boolean shouldClose(LockView v) {
        if (!v.active) return true;
        if (dismissing) return false;
        return LockScreenGate.interactive(this) && !LockScreenGate.locked(this);
    }

    // ── 화면 ──────────────────────────────────────────────────────────────

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable round(int color) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(14));
        return g;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 20 : 16);
        b.setTextColor(primary ? BRAND_INK : INK);
        b.setBackground(round(primary ? BRAND : CARD));
        b.setMinHeight(dp(56));
        b.setMinimumHeight(dp(56));
        b.setContentDescription(label);
        return b;
    }

    private LinearLayout.LayoutParams lp(int w, int h, float weight) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h, weight);
        p.setMargins(dp(4), dp(4), dp(4), dp(4));
        return p;
    }

    private View build() {
        // [원본] ScrollView 하나에 완료 버튼까지 — 슈퍼셋·휴식 중이면 완료가 화면 밖으로 밀렸다(REV-015 화면 #3)
        // [개선] 위는 스크롤 · 완료 버튼은 아래 고정 줄 · 시스템 바·펀치홀 여백(edge-to-edge · 플랫폼 M-5)
        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        root.addView(sv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(12), dp(16), dp(12));
        sv.addView(col);
        final LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(16), dp(4), dp(16), dp(12));
        root.addView(bottom, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, ins) -> {
            androidx.core.graphics.Insets b = ins.getInsets(
                    androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        title = text(18, INK, true);
        title.setMaxLines(2);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        top.addView(title, lp(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button close = button(getString(R.string.lock_screen_close), false);
        close.setOnClickListener(x -> {
            if (guarded()) return;
            finish(); // 잠금화면으로(#6)
        });
        top.addView(close, lp(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT, 0));
        unlock = button(getString(R.string.lock_screen_unlock), false);
        unlock.setOnClickListener(x -> {
            if (!guarded()) openApp();
        });
        top.addView(unlock, lp(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT, 0));
        col.addView(top);

        restBox = new LinearLayout(this);
        restBox.setOrientation(LinearLayout.VERTICAL);
        restBox.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView restLabel = text(16, MUTED, false);
        restLabel.setText(R.string.lock_screen_rest);
        restBox.addView(restLabel);
        restClock = text(72, INK, true);
        restClock.setGravity(Gravity.CENTER);
        fitOneLine(restClock, 32, 72);
        restClock.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_NONE);
        restBox.addView(restClock);
        restBtns = new LinearLayout(this);
        Button plus = button(getString(R.string.lock_action_plus30), false);
        plus.setOnClickListener(x -> {
            if (!guarded()) act(LockActionReceiver.ACTION_PLUS30, null);
        });
        Button skip = button(getString(R.string.lock_action_end_rest), false);
        skip.setOnClickListener(x -> {
            if (!guarded()) act(LockActionReceiver.ACTION_END_REST, null);
        });
        restBtns.addView(plus, lp(0, dp(56), 1));
        restBtns.addView(skip, lp(0, dp(56), 1));
        restBox.addView(restBtns, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(16);
        col.addView(restBox, rp);

        membersBox = new LinearLayout(this);
        membersBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mp.topMargin = dp(16);
        col.addView(membersBox, mp);

        notice = text(15, MUTED, false);
        notice.setPadding(dp(4), dp(8), dp(4), dp(0));
        notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        col.addView(notice);

        next = text(15, MUTED, false);
        next.setPadding(dp(4), dp(12), dp(4), 0);
        col.addView(next);

        complete = button(getString(R.string.lock_screen_hold), true);
        complete.setMinHeight(dp(72));
        complete.setMinimumHeight(dp(72));
        complete.setOnTouchListener(this::onHoldTouch);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(72));
        bottom.addView(complete, cp);
        holdBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        holdBar.setMax(1000);
        holdBar.setProgress(0);
        holdBar.setProgressTintList(android.content.res.ColorStateList.valueOf(BRAND));
        holdBar.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        bottom.addView(holdBar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(6)));
        return root;
    }

    /** 한 줄에 맞게 글자 크기를 줄인다(큰 글꼴·긴 값 · REV-015 화면 #4) */
    private void fitOneLine(TextView t, int minSp, int maxSp) {
        t.setMaxLines(1);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(t, minSp, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
    }

    private boolean talkBack() {
        android.view.accessibility.AccessibilityManager am = getSystemService(android.view.accessibility.AccessibilityManager.class);
        return am != null && am.isTouchExplorationEnabled();
    }

    private boolean guarded() {
        return SystemClock.uptimeMillis() < ignoreUntil;
    }

    private void render(LockView v) {
        if (isFinishing() || isDestroyed()) return;
        if (shouldClose(v)) {
            finish();
            return;
        }
        last = v;
        title.setText(v.title == null || v.title.isEmpty() ? getString(R.string.lock_title_fallback) : v.title);
        boolean resting = v.restEndsAt != null && !v.paused;
        restBox.setVisibility(resting ? View.VISIBLE : View.GONE);
        // 대기열이 막히면 휴식 버튼도 끈다(버튼 상태 표 · REV-015 화면 #6) · 슈퍼셋이면 시계를 줄인다(#3)
        restBtns.setVisibility(v.openApp == LockView.OpenAppReason.STALLED ? View.GONE : View.VISIBLE);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(
                restClock, 32, v.members.size() > 1 ? 48 : 72, 1, TypedValue.COMPLEX_UNIT_SP);
        if (resting) {
            long remain = Math.max(0, (v.restEndsAt - System.currentTimeMillis() + 999) / 1000);
            restClock.setText(String.format(Locale.ROOT, "%d:%02d", remain / 60, remain % 60));
            restClock.setContentDescription(getString(R.string.lock_screen_rest) + " " + restClock.getText());
        }
        // 멤버 줄은 단계·조정 가능 여부가 바뀔 때만 다시 만든다 — 누르는 중인 ± 버튼이 사라지지 않게
        StringBuilder key = new StringBuilder(v.stepToken).append('|').append(v.canAdjust);
        for (LockView.Member m : v.members) key.append('|').append(m.weight).append('/').append(m.reps);
        if (!key.toString().equals(builtKey)) {
            builtKey = key.toString();
            buildMembers(v);
        }
        if (pendingEdits == 0) {
            for (LockView.Member m : v.members) {
                Row r = rows.get(m.setId);
                if (r != null) {
                    r.m = m;
                    fillRow(r);
                }
            }
        }
        // 버튼 상태 표(#7)
        boolean canDo = v.hasStep && v.canComplete;
        if (canDo) {
            complete.setText(R.string.lock_screen_hold);
            complete.setOnTouchListener(this::onHoldTouch);
            // TalkBack 의 두 번 탭은 터치가 아니라 클릭 — 의도한 조작이라 바로 완료한다(REV-015 화면 #1·플랫폼 M-6)
            complete.setOnClickListener(x -> {
                LockView lv = last;
                if (talkBack() && lv != null && lv.canComplete) act(LockActionReceiver.ACTION_COMPLETE, lv.stepToken);
            });
            holdBar.setVisibility(View.VISIBLE);
        } else {
            complete.setText(R.string.lock_screen_in_app);
            complete.setOnTouchListener(null);
            complete.setOnClickListener(x -> {
                if (!guarded()) openApp();
            });
            holdBar.setVisibility(View.GONE);
        }
        complete.setContentDescription(complete.getText());
        complete.setVisibility(v.hasStep || v.truncated ? View.VISIBLE : View.GONE);

        String msg = null;
        if (v.paused) msg = getString(R.string.lock_paused);
        else if (v.openApp == LockView.OpenAppReason.VALUES) msg = getString(R.string.lock_open_app_values);
        else if (v.openApp == LockView.OpenAppReason.STALLED) msg = getString(R.string.lock_open_app_stalled);
        else if (v.openApp == LockView.OpenAppReason.TRUNCATED) msg = getString(R.string.lock_truncated);
        else if (!v.hasStep) msg = getString(R.string.lock_no_steps);
        // 「조정한 값을 지웠어요」는 6초 붙잡아 둔다 — 그리자마자 지우면 1초만 보였다(REV-015 화면 #5)
        if (v.draftLost) {
            draftLostUntil = SystemClock.uptimeMillis() + 6000;
            clearDraftLost();
        }
        if (SystemClock.uptimeMillis() < draftLostUntil) msg = getString(R.string.lock_screen_draft_lost);
        notice.setText(msg == null ? "" : msg);
        notice.setVisibility(msg == null ? View.GONE : View.VISIBLE);
        if (v.next != null) {
            next.setText(getString(R.string.lock_next, v.next.name + " · " + WorkoutNotification.setName(this, v.next)));
            next.setVisibility(View.VISIBLE);
        } else {
            next.setVisibility(View.GONE);
        }
    }

    private void buildMembers(LockView v) {
        stopRepeats();
        repeats.clear();
        membersBox.removeAllViews();
        rows.clear();
        for (LockView.Member m : v.members) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setBackground(round(CARD));
            card.setPadding(dp(14), dp(12), dp(14), dp(12));
            TextView name = text(20, INK, true);
            name.setText(m.name);
            card.addView(name);
            TextView set = text(15, MUTED, false);
            set.setText(WorkoutNotification.setName(this, m) + (m.oneSide ? " · " + getString(R.string.lock_one_side) : ""));
            card.addView(set);
            Row r = new Row();
            r.m = m;
            if (m.cardio || !v.canAdjust) {
                // 시간·거리 종목 · 조정할 수 없는 단계 — 값만(#34)
                TextView val = text(24, INK, true);
                fitOneLine(val, 14, 24);
                val.setText(WorkoutNotification.valueLine(this, m));
                card.addView(val);
            } else {
                if (m.weight != null) {
                    r.weight = text(28, INK, true);
                    r.weightWas = text(13, MUTED, false);
                    card.addView(stepper(getString(R.string.lock_screen_weight), r.weight, r.weightWas, m.setId, true));
                }
                r.reps = text(28, INK, true);
                r.repsWas = text(13, MUTED, false);
                card.addView(stepper(getString(R.string.lock_screen_reps), r.reps, r.repsWas, m.setId, false));
            }
            rows.put(m.setId, r);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.bottomMargin = dp(10);
            membersBox.addView(card, p);
        }
    }

    /** [−] 값 [+] — 길게 누르면 반복(#8) */
    private View stepper(String label, TextView value, TextView was, String setId, boolean weight) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(6), 0, 0);
        TextView l = text(15, MUTED, false);
        l.setText(label);
        // [원본] lp(dp(56), …) — 큰 글꼴에서 「Weight」가 잘렸다(#4)
        row.addView(l, lp(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT, 0));
        fitOneLine(value, 14, 28);
        value.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        Button minus = button("−", false);
        minus.setContentDescription(label + " " + getString(R.string.lock_screen_minus));
        row.addView(minus, lp(dp(56), dp(56), 0));
        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setGravity(Gravity.CENTER);
        value.setGravity(Gravity.CENTER);
        was.setGravity(Gravity.CENTER);
        mid.addView(value);
        mid.addView(was);
        row.addView(mid, lp(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button plus = button("+", false);
        plus.setContentDescription(label + " " + getString(R.string.lock_screen_plus));
        row.addView(plus, lp(dp(56), dp(56), 0));
        repeat(minus, () -> nudge(setId, weight, -1));
        repeat(plus, () -> nudge(setId, weight, +1));
        return row;
    }

    // [원본] 보호 시간 검사가 UP·CANCEL 까지 삼켜 반복이 멈추지 않을 수 있었고(플랫폼 M-2), TalkBack 클릭이 없었다(#1)
    private void repeat(View b, Runnable r) {
        final Runnable[] loop = new Runnable[1];
        loop[0] = () -> {
            r.run();
            main.postDelayed(loop[0], 140);
        };
        repeats.add(loop[0]);
        b.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (guarded()) return true; // 보호는 누르기 시작에서만
                    v.setPressed(true);
                    if (v.getParent() != null) v.getParent().requestDisallowInterceptTouchEvent(true);
                    r.run();
                    main.postDelayed(loop[0], 450);
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    v.setPressed(false);
                    main.removeCallbacks(loop[0]);
                    return true;
                default:
                    return true;
            }
        });
        // 터치 경로는 위에서 끝나 performClick 이 오지 않는다 — 이 클릭은 TalkBack(접근성 동작)에서만
        b.setOnClickListener(x -> r.run());
    }

    private void stopRepeats() {
        for (Runnable x : repeats) main.removeCallbacks(x);
    }

    private void fillRow(Row r) {
        LockView.Member m = r.m;
        if (r.weight != null) {
            boolean edited = m.draftWeight != null;
            double w = edited ? m.draftWeight : (m.weight == null ? 0 : m.weight);
            r.weight.setText((edited ? "• " : "") + WorkoutNotification.num(w) + m.unit);
            r.weight.setTextColor(edited ? BRAND : INK);
            r.weightWas.setText(edited && m.weight != null ? getString(R.string.lock_screen_was, WorkoutNotification.num(m.weight) + m.unit) : "");
            r.weight.setContentDescription(getString(R.string.lock_screen_weight) + " " + WorkoutNotification.num(w) + m.unit
                    + (edited && m.weight != null ? ", " + getString(R.string.lock_screen_was, WorkoutNotification.num(m.weight) + m.unit) : ""));
        }
        if (r.reps != null) {
            boolean edited = m.draftReps != null;
            // 횟수가 없으면(처방 없음) 「–」 — 「0회」로 보이지 않게(REV-015 화면 #8)
            if (!edited && m.reps == null) {
                r.reps.setText("–");
                r.reps.setTextColor(INK);
                r.repsWas.setText("");
                r.reps.setContentDescription(getString(R.string.lock_screen_reps));
                return;
            }
            int n = edited ? m.draftReps : m.reps;
            r.reps.setText((edited ? "• " : "") + getResources().getQuantityString(R.plurals.lock_reps, n, n));
            r.reps.setTextColor(edited ? BRAND : INK);
            r.repsWas.setText(edited && m.reps != null ? getString(R.string.lock_screen_was, getResources().getQuantityString(R.plurals.lock_reps, m.reps, m.reps)) : "");
            r.reps.setContentDescription(getString(R.string.lock_screen_reps) + " " + getResources().getQuantityString(R.plurals.lock_reps, n, n)
                    + (edited && m.reps != null ? ", " + getString(R.string.lock_screen_was, getResources().getQuantityString(R.plurals.lock_reps, m.reps, m.reps)) : ""));
        }
    }

    // ── 조작 ──────────────────────────────────────────────────────────────

    /** ± 한 번 — 화면에 바로 보이고(낙관), 저장소 초안에 적는다(#4) */
    private void nudge(String setId, boolean weight, int dir) {
        Row r = rows.get(setId);
        LockView v = last;
        if (r == null || v == null || !v.canAdjust) return;
        LockView.Member m = r.m;
        if (weight) {
            double nw = LockRules.nudgeWeight(m.draftWeight != null ? m.draftWeight : m.weight, m.unit, dir);
            m.draftWeight = LockRules.sameWeight(nw, m.weight) ? null : nw;
        } else {
            int nr = LockRules.nudgeReps(m.draftReps != null ? m.draftReps : m.reps, dir);
            m.draftReps = m.reps != null && nr == m.reps ? null : nr;
        }
        fillRow(r);
        final String token = v.stepToken;
        final Double fw = weight ? (m.draftWeight != null ? m.draftWeight : m.weight) : null;
        final Integer fr = weight ? null : (m.draftReps != null ? m.draftReps : m.reps);
        final Double keepW = weight ? null : m.draftWeight;
        final Integer keepR = weight ? m.draftReps : null;
        final Context app = getApplicationContext();
        pendingEdits++;
        submitEdit(() -> LockHub.store(app).write(s -> s.setDraft(token, setId, fw != null ? fw : keepW, fr != null ? fr : keepR)));
    }

    private boolean onHoldTouch(View b, MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (guarded()) return true;
                b.setPressed(true);
                if (b.getParent() != null) b.getParent().requestDisallowInterceptTouchEvent(true);
                startHold();
                return true;
            case MotionEvent.ACTION_MOVE:
                // 버튼 밖으로 끌어내면 취소(REV-015 화면 #7)
                if (e.getX() < 0 || e.getY() < 0 || e.getX() > b.getWidth() || e.getY() > b.getHeight()) {
                    b.setPressed(false);
                    stopHold();
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                b.setPressed(false);
                stopHold();
                return true;
            default:
                return true;
        }
    }

    private final Runnable holdTick = new Runnable() {
        @Override
        public void run() {
            if (holdDownAt < 0) return;
            long held = SystemClock.uptimeMillis() - holdDownAt;
            holdBar.setProgress((int) Math.min(1000, held * 1000 / HOLD_MS));
            if (held < HOLD_MS) {
                main.postDelayed(this, 16);
                return;
            }
            holdDownAt = -1;
            holdBar.setProgress(0);
            LockView v = last;
            if (v != null && v.canComplete) {
                complete.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                act(LockActionReceiver.ACTION_COMPLETE, v.stepToken);
            }
        }
    };

    /** 길게 누르기 0.6초 — 시계로 잰다(애니메이션 배율과 무관 · REV-015 플랫폼 H-2) · 다 차면 완료(#3) */
    private void startHold() {
        stopHold();
        holdDownAt = SystemClock.uptimeMillis();
        main.post(holdTick);
    }

    private void stopHold() {
        holdDownAt = -1;
        main.removeCallbacks(holdTick);
        if (holdBar != null) holdBar.setProgress(0);
    }

    /** 카드 버튼과 같은 길(LockActionReceiver.handle) — 완료는 토큰으로 연타를 막고 초안 값을 싣는다 */
    private void act(String action, String token) {
        final Context app = getApplicationContext();
        submit(() -> {
            // 완료는 고른 값(초안)을 싣는다 — 이 화면에 보이는 값이다(REV-015 정합성 #3)
            LockActionReceiver.handle(app, action, token, true);
            return null;
        });
    }

    private void clearDraftLost() {
        final Context app = getApplicationContext();
        submit(() -> LockHub.store(app).write(s -> {
            s.draftLost = false;
            return null;
        }));
    }

    private interface Job {
        Object run() throws Exception;
    }

    /** ± 쓰기 — 끝나면 pendingEdits 를 내리고 다시 읽는다(그 사이 온 옛 그림이 값을 덮지 않게) */
    private void submitEdit(Job j) {
        try {
            io.execute(() -> {
                try {
                    j.run();
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "운동 화면 조작 실패", e);
                }
                main.post(() -> {
                    pendingEdits = Math.max(0, pendingEdits - 1);
                    reload();
                });
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            pendingEdits = Math.max(0, pendingEdits - 1);
        }
    }

    private void submit(Job j) {
        try {
            io.execute(() -> {
                try {
                    j.run();
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "운동 화면 조작 실패", e);
                }
                main.post(this::reload);
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // 닫히는 중
        }
    }

    /** 잠금 해제 → 앱 운동 화면(liftgram://workout · #26). 해제를 취소하면 이 화면에 남는다. */
    private void openApp() {
        KeyguardManager km = getSystemService(KeyguardManager.class);
        if (Build.VERSION.SDK_INT >= 26 && km != null && km.isKeyguardLocked()) {
            dismissing = true;
            km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override
                public void onDismissSucceeded() {
                    dismissing = false;
                    launchWorkout();
                }

                @Override
                public void onDismissCancelled() {
                    dismissing = false;
                }

                @Override
                public void onDismissError() {
                    dismissing = false;
                }
            });
            return;
        }
        launchWorkout();
    }

    private void launchWorkout() {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("liftgram://workout"), this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "앱 열기 실패", e);
        }
        finish();
    }

}
