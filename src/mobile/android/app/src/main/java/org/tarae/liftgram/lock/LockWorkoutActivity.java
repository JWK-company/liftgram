package org.tarae.liftgram.lock;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.RippleDrawable;
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
import android.widget.FrameLayout;
import android.widget.ImageView;
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
 * - 모양은 C안(SPEC-021) — 앱 테마를 따르고, 루틴 이름 대신 운동 시간, 닫기 없음(뒤로 가기가 대신). 광고·수익화 요소는 두지 않는다(Google Play 잠금화면 수익화 금지).
 * - 소리는 내지 않는다(휴식 끝 소리는 RestAlarm · RestSound 담당 · #36). KEEP_SCREEN_ON 없음(기기 화면 시간대로 꺼짐 · #30).
 */
public class LockWorkoutActivity extends Activity {
    private static volatile WeakReference<LockWorkoutActivity> current = new WeakReference<>(null);
    private static volatile boolean visible;

    // [원본] 어두운 색 고정 — 앱을 라이트로 써도 다크처럼 보였다(#T1)
    // private static final int BG = 0xFF111418;
    // private static final int CARD = 0xFF1E232A;
    // private static final int INK = 0xFFFFFFFF;
    // private static final int MUTED = 0xFFB4BCC6;
    // private static final int BRAND = 0xFFFF5A36;
    // private static final int BRAND_INK = 0xFF111418;
    // [개선] 앱 토큰과 같은 값(src/frontend/app/theme.generated.css · SPEC-021)
    private static final class Palette {
        final boolean dark;
        final int bg, card, track, ink, ink2, ink3, brand, onBrand, stepBg, stroke, line;

        Palette(boolean dark, int bg, int card, int track, int ink, int ink2, int ink3, int brand, int onBrand, int stepBg, int stroke, int line) {
            this.line = line;
            this.dark = dark;
            this.bg = bg;
            this.card = card;
            this.track = track;
            this.ink = ink;
            this.ink2 = ink2;
            this.ink3 = ink3;
            this.brand = brand;
            this.onBrand = onBrand;
            this.stepBg = stepBg;
            this.stroke = stroke;
        }
    }

    // [원본] 분홍·갈색 바탕(C안) — 앱 화면과 달라 「AI 느낌」으로 보였다(SPEC-060 1a)
    // private static final Palette LIGHT = new Palette(false, 0xFFFFF0EB, 0xFFFFFFFF, 0xFFF1F2F4, 0xFF141619, 0xFF3E4348, 0xFF6A737B, 0xFFC8381C, 0xFFFFFFFF, 0xFFFFF0EB, 0xFF747474);
    // private static final Palette DARK = new Palette(true, 0xFF3D2620, 0xFF2B2B2B, 0xFF3A3A3A, 0xFFF5F7F9, 0xFFD8DBDF, 0xFF98A1AD, 0xFFFF7A57, 0xFF161616, 0xFF3A3A3A, 0xFFA8A8A8);
    // [개선] 앱 바탕·선 토큰 그대로(bg · surface · line)
    private static final Palette LIGHT = new Palette(false, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFF1F2F4, 0xFF141619, 0xFF3E4348, 0xFF6A737B, 0xFFC8381C, 0xFFFFFFFF, 0xFFF1F2F4, 0xFF747474, 0xFFDBDBDB);
    private static final Palette DARK = new Palette(true, 0xFF161616, 0xFF2B2B2B, 0xFF3A3A3A, 0xFFF5F7F9, 0xFFD8DBDF, 0xFF98A1AD, 0xFFFF7A57, 0xFF161616, 0xFF3A3A3A, 0xFFA8A8A8, 0xFF424242);
    private static final String KEY_THEME = "lockTheme";

    private Palette p = LIGHT;
    private String themeChoice = "system";
    private boolean repeatPressed;
    private int builtRingDp;
    private boolean bigControls;
    private boolean holdGesture;
    private String holdToken;
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

    // [원본] private TextView title; — 루틴 이름은 보이지 않는다(#T1)
    private LinearLayout timePill;
    private ImageView timeIcon;
    private TextView timeText;
    private FrameLayout ringBox;
    private LockRingView ring;
    private TextView restLabel;
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
    private Button plusBtn;
    private Button skipBtn;

    // ── SPEC-060 화면 상태(재빌드해도 남는다 · REV-146 안드로이드 4·5) ──
    private LockHourglassView hourglass;
    private LockSlideView slide;
    private LinearLayout restRow;
    private TextView restHint;
    private LinearLayout restAdjust;
    private Button minusBtn;
    private ProgressBar restTrack;
    private TextView valueHint;
    private boolean restOpen;
    private boolean restEnabled = true;
    private String openEditSetId;
    private boolean openEditWeight;
    private boolean dragging;
    private String slideToken;
    private long confirmUntil;
    /** 밀기를 시작할 때 확인 중이었나 — 미는 사이 기한이 끝나도 두 번째 밀기는 완료(REV-148 2) */
    private boolean slideConfirming;
    private long lastDoneAt;
    private String undoShownId;
    private long undoTotalMs = LockActionReceiver.UNDO_MS;
    private long undoEndedAt;
    private long flashUntil;
    private String flashMsg;
    private Boolean wasResting;
    private boolean needRebuild;
    private int builtClockSp;
    private final Runnable closeEdit = () -> {
        if (repeatPressed) {
            scheduleEditClose();
            return;
        }
        closeEditor();
    };
    private final Runnable closeRest = () -> setRestOpen(false);
    private final Runnable confirmExpire = () -> {
        if (confirmUntil > 0 && SystemClock.uptimeMillis() >= confirmUntil) {
            confirmUntil = 0;
            flash(getString(R.string.lock_not_done), 3000);
        }
    };

    private static final class Row {
        LockView.Member m;
        String setId = "";
        LinearLayout weightCell;
        LinearLayout repsCell;
        LinearLayout editor;
        Button editMinus;
        Button editPlus;
        Button editReset;
        boolean editingWeight;
        TextView weight;
        TextView weightWas;
        TextView reps;
        TextView repsWas;
        String prefix = "";
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

    private static volatile long createdAt;
    private static volatile long newIntentAt;

    /** at(elapsedRealtime) 뒤에 만들어졌나 — 직접 시작이 실제로 열렸는지(BAL 은 막혀도 예외가 없다 · REV-017 잠금 H-1) */
    static boolean createdSince(long at) {
        return createdAt >= at;
    }

    static boolean newIntentSince(long at) {
        return newIntentAt >= at;
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
            if (!a.isFinishing() && !a.dismissing) {
                LockDiag.add(a, "운동 화면 닫음: 운동 끝·설정 끔·잠금 해제");
                a.releaseHold(); // 붙잡은 완료는 바로 웹으로(REV-146 안드로이드 2)
                a.finish();
            }
        });
    }

    // ── 수명 ──────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        createdAt = SystemClock.elapsedRealtime();
        current = new WeakReference<>(this);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        applyWake(getIntent());
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        }
        // 첫 그림 전에 정한다 — 저장소 읽기는 비동기라 마지막 고른 값으로(프로세스가 죽어도 남게 · REV-021 안드로이드 M-3)
        themeChoice = LockRules.normalizeTheme(getSharedPreferences(LockScreenGate.UI_PREFS, MODE_PRIVATE).getString(KEY_THEME, "system"));
        p = resolveDark(themeChoice) ? DARK : LIGHT;
        paintWindow();
        builtConfigKey = configKey(getResources().getConfiguration());
        setContentView(build());
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBack);
        }
        LockScreenGate.cancel(this);
        LockDiag.add(this, "운동 화면 열림(화면 " + (LockScreenGate.interactive(this) ? "켜짐" : "꺼짐") + " · " + (LockScreenGate.locked(this) ? "잠김" : "안 잠김") + ")");
        // [잠금 판정 통일 · #18] onCreate 에서는 닫지 않는다 — 화면이 꺼진 채 만들어질 수 있다. 판단은 onResume·틱에서.
    }

    /** 닫기 버튼이 하던 일 — 켜진 직후 보호 · 진단 · 잠금화면으로(SPEC-021 · REV-021 안드로이드 L-1) */
    private void onBack() {
        if (guarded()) return;
        LockDiag.add(this, "운동 화면 닫음: 뒤로 가기");
        releaseHold();
        finish();
    }

    @Override
    public void onBackPressed() {
        onBack(); // API 32 이하 · 새 뒤로 가기를 끈 기기
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c); // uiMode 는 manifest 에서 직접 받는다 — 재생성되지 않는다
        // 글꼴·밀도·화면 높이가 바뀌어도 다시 만든다 — dp·sp 를 만들 때 계산했다(REV-146 안드로이드 10)
        int key = configKey(c);
        if (key != builtConfigKey) needRebuild = true;
        if (maybeRetheme(themeChoice)) reload();
    }

    private int builtConfigKey;

    private static int configKey(Configuration c) {
        return Math.round(c.fontScale * 100) * 31 * 31 + c.densityDpi * 31 + c.screenHeightDp;
    }

    private boolean resolveDark(String choice) {
        if ("dark".equals(choice)) return true;
        if ("light".equals(choice)) return false;
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /**
     * 테마가 달라졌으면 화면을 다시 만든다(recreate 안 함 — 초안·보호 시간·dismissing 을 지킨다).
     * 누르는 중이거나 쓰기가 남았으면 다음 틱으로 미룬다(REV-021 안드로이드 H-2). @return 다시 만들었나
     */
    private boolean maybeRetheme(String choice) {
        if (!choice.equals(themeChoice)) {
            themeChoice = choice;
            getSharedPreferences(LockScreenGate.UI_PREFS, MODE_PRIVATE).edit().putString(KEY_THEME, choice).apply();
        }
        boolean dark = resolveDark(choice);
        // [원본] if (dark == p.dark || pendingEdits > 0 || holdDownAt >= 0 || repeatPressed) return false;
        // [개선] 글꼴 등 변경도 · 밀고 있는 중이면 놓을 때까지 미룬다(REV-146 안드로이드 5)
        if ((dark == p.dark && !needRebuild) || pendingEdits > 0 || holdDownAt >= 0 || repeatPressed || dragging) return false;
        needRebuild = false;
        main.removeCallbacks(closeEdit);
        main.removeCallbacks(closeRest);
        wasResting = null; // 새 그림은 뒤집기부터 하지 않는다
        builtClockSp = 0;
        // holdTick 은 holdDownAt 만 보고 완료를 실행한다 — 먼저 멈춘다(REV-021 안드로이드 H-1)
        stopHold();
        stopRepeats();
        rows.clear();
        builtKey = "";
        builtRingDp = 0;
        p = dark ? DARK : LIGHT;
        paintWindow();
        builtConfigKey = configKey(getResources().getConfiguration());
        setContentView(build());
        return true;
    }

    /** 창 배경·바 색·아이콘 밝기 — API 별로 다르다(REV-021 안드로이드 M-2) */
    private void paintWindow() {
        android.view.Window w = getWindow();
        w.setBackgroundDrawable(new ColorDrawable(p.bg));
        androidx.core.view.WindowInsetsControllerCompat c = new androidx.core.view.WindowInsetsControllerCompat(w, w.getDecorView());
        if (Build.VERSION.SDK_INT < 35) w.setStatusBarColor(p.bg); // 35 이상은 무시되고 바탕이 비친다
        c.setAppearanceLightStatusBars(!p.dark);
        if (Build.VERSION.SDK_INT >= 26) {
            if (Build.VERSION.SDK_INT < 35) w.setNavigationBarColor(p.bg);
            c.setAppearanceLightNavigationBars(!p.dark); // 26 미만은 밝은 아이콘이 없어 어두운 바를 둔다
        }
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        newIntentAt = SystemClock.elapsedRealtime();
        LockDiag.add(this, "운동 화면 다시 받음" + (i != null && i.getBooleanExtra(LockScreenGate.EXTRA_WAKE, false) ? "(화면 켜기)" : ""));
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
        maybeRetheme(themeChoice); // 꺼진 사이 기기 설정이 바뀌었을 수 있다
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
        // 화면이 꺼지거나 가려졌다 — 밀던 것은 완료하지 않고, 붙잡은 완료는 확정한다(REV-146 안드로이드 2·8)
        if (slide != null) slide.cancelGesture();
        dragging = false;
        releaseHold();
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
        // [원본] new TextView(this) — API 26 이하는 자동 크기가 돌지 않아 고정 칸에서 잘렸다(REV-022 안드로이드 M-3)
        TextView t = new androidx.appcompat.widget.AppCompatTextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    // [원본] private GradientDrawable round(int color) — 반경 14dp · 상태 없는 바탕(눌림이 안 보였다 · REV-021 화면 7)
    /** 알약 또는 원 바탕 + 눌림 잔물결 */
    private Drawable pill(int color, boolean stroked) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(999));
        if (stroked) g.setStroke(dp(1), p.stroke);
        return new RippleDrawable(ColorStateList.valueOf((p.ink & 0x00FFFFFF) | 0x33000000), g, null);
    }

    /** 4dp 모서리 바탕 + 눌림 잔물결(SPEC-060 1a — 알약 대신) */
    private Drawable rect(int color, int strokeColor, int strokeDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(4));
        if (strokeDp > 0) g.setStroke(dp(strokeDp), strokeColor);
        return new RippleDrawable(ColorStateList.valueOf((p.ink & 0x00FFFFFF) | 0x33000000), g, null);
    }

    private GradientDrawable cardBg() {
        GradientDrawable g = new GradientDrawable();
        g.setColor(p.card);
        g.setCornerRadius(dp(24));
        return g;
    }

    private Button button(String label, boolean primary) {
        Button b = new androidx.appcompat.widget.AppCompatButton(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setMaxLines(1);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 18 : 15);
        b.setTextColor(primary ? p.onBrand : p.ink);
        // [원본] b.setBackground(primary ? pill(p.brand, false) : pill(p.card, true));
        b.setBackground(primary ? rect(p.brand, 0, 0) : rect(p.card, p.stroke, 1)); // 4dp 직사각형(SPEC-060 1a)
        b.setMinHeight(dp(primary ? 72 : 56));
        b.setMinimumHeight(dp(primary ? 72 : 56));
        b.setContentDescription(label);
        return b;
    }

    /** 둥근 ± — 지름 56dp */
    private Button stepButton(String glyph, String description) {
        Button b = new Button(this);
        b.setText(glyph);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setPadding(0, 0, 0, 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        b.setTextColor(p.brand);
        b.setBackground(pill(p.stepBg, true));
        b.setContentDescription(description);
        return b;
    }

    private LinearLayout.LayoutParams lp(int w, int h, float weight) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h, weight);
        p.setMargins(dp(4), dp(4), dp(4), dp(4));
        return p;
    }

    // [원본] C안 화면(SPEC-021) — SPEC-060 build() 로 대신. 되돌릴 수 있게 남긴다.
    @SuppressWarnings("unused")
    private View buildC() {
        // [원본] ScrollView 하나에 완료 버튼까지 — 슈퍼셋·휴식 중이면 완료가 화면 밖으로 밀렸다(REV-015 화면 #3)
        // [개선] 위는 스크롤 · 완료 버튼은 아래 고정 줄 · 시스템 바·펀치홀 여백(edge-to-edge · 플랫폼 M-5)
        // [개선 SPEC-021] 위 줄·안내는 스크롤 밖 — 안내가 화면 밖으로 밀리지 않게(REV-021 안드로이드 M-4)
        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(p.bg);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(14), dp(16), dp(6));
        root.addView(top);
        timePill = new LinearLayout(this);
        timePill.setGravity(Gravity.CENTER_VERTICAL);
        timePill.setPadding(dp(14), 0, dp(14), 0);
        timePill.setMinimumHeight(dp(48));
        GradientDrawable timeBg = new GradientDrawable();
        timeBg.setColor(p.card);
        timeBg.setCornerRadius(dp(999));
        timePill.setBackground(timeBg);
        timePill.setFocusable(true);
        timeIcon = new ImageView(this);
        timeIcon.setImageResource(R.drawable.ic_lock_clock);
        timeIcon.setColorFilter(p.brand);
        timeIcon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        timePill.addView(timeIcon);
        timeText = text(16, p.ink, true);
        timeText.setFontFeatureSettings("tnum");
        timeText.setGravity(Gravity.CENTER_VERTICAL);
        timeText.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        fitOneLine(timeText, 10, 16);
        // 칸을 고정한다 — 큰 글꼴에서 「잠금 해제」를 밀어내지 않고, 자릿수가 늘어도 알약이 흔들리지 않는다(REV-022 화면 3)
        LinearLayout.LayoutParams timeLp = new LinearLayout.LayoutParams(dp(68), dp(28));
        timeLp.setMarginStart(dp(6));
        timePill.addView(timeText, timeLp);
        top.addView(timePill);
        top.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        // [원본] 닫기 버튼 — 「잠금 해제」와 거의 같게 느껴졌다(#T1). 뒤로 가기가 대신한다(onBack)
        // Button close = button(getString(R.string.lock_screen_close), false);
        // close.setOnClickListener(x -> { if (guarded()) return; LockDiag.add(this, "운동 화면 닫음: 닫기 버튼"); finish(); });
        unlock = button(getString(R.string.lock_screen_unlock), false);
        unlock.setMinHeight(dp(48));
        unlock.setMinimumHeight(dp(48));
        unlock.setPadding(dp(14), 0, dp(14), 0);
        Drawable lockIcon = getDrawable(R.drawable.ic_lock_unlock);
        if (lockIcon != null) {
            lockIcon = lockIcon.mutate();
            lockIcon.setTint(p.ink);
            unlock.setCompoundDrawablesRelativeWithIntrinsicBounds(lockIcon, null, null, null);
            unlock.setCompoundDrawablePadding(dp(6));
        }
        unlock.setOnClickListener(x -> {
            if (!guarded()) openApp();
        });
        top.addView(unlock);

        notice = text(15, p.ink2, false);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(16), dp(2), dp(16), dp(4));
        notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(notice);

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        root.addView(sv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(4), dp(16), dp(8));
        // 카드를 아래에 붙인다 — 휴식이 시작·끝나도 ± 가 움직이지 않아 잘못 누르지 않고, 엄지에 가깝다(REV-022 화면 1)
        col.setGravity(Gravity.BOTTOM);
        sv.addView(col);
        final LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(16), dp(12), dp(16), dp(12)); // ± 와 완료 사이를 띄운다(REV-022 화면 2)
        root.addView(bottom, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, ins) -> {
            androidx.core.graphics.Insets b = ins.getInsets(
                    androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });

        restBox = new LinearLayout(this);
        restBox.setOrientation(LinearLayout.VERTICAL);
        restBox.setGravity(Gravity.CENTER_HORIZONTAL);
        ringBox = new FrameLayout(this);
        ring = new LockRingView(this, dp(14));
        ring.setColors(p.card, p.track, p.brand);
        ringBox.addView(ring, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        LinearLayout ringText = new LinearLayout(this);
        ringText.setOrientation(LinearLayout.VERTICAL);
        ringText.setGravity(Gravity.CENTER);
        restLabel = text(14, p.ink3, false);
        restLabel.setText(R.string.lock_screen_rest);
        restLabel.setGravity(Gravity.CENTER);
        restLabel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        ringText.addView(restLabel);
        restClock = text(44, p.ink, true);
        restClock.setGravity(Gravity.CENTER);
        restClock.setMaxLines(1);
        restClock.setFontFeatureSettings("tnum");
        restClock.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_NONE);
        ringText.addView(restClock);
        ringBox.addView(ringText, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        restBox.addView(ringBox);
        restBtns = new LinearLayout(this);
        Button plus = button(getString(R.string.lock_action_plus30), false);
        plusBtn = plus;
        plus.setOnClickListener(x -> {
            if (!guarded()) act(LockActionReceiver.ACTION_PLUS30, null);
        });
        Button skip = button(getString(R.string.lock_action_end_rest), false);
        skipBtn = skip;
        skip.setOnClickListener(x -> {
            if (!guarded()) act(LockActionReceiver.ACTION_END_REST, null);
        });
        // 아래 카드와 가장자리를 맞춘다
        LinearLayout.LayoutParams plusLp = new LinearLayout.LayoutParams(0, dp(56), 1);
        plusLp.setMarginEnd(dp(4));
        LinearLayout.LayoutParams skipLp = new LinearLayout.LayoutParams(0, dp(56), 1);
        skipLp.setMarginStart(dp(4));
        restBtns.addView(plus, plusLp);
        restBtns.addView(skip, skipLp);
        LinearLayout.LayoutParams rbp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rbp.topMargin = dp(8);
        restBox.addView(restBtns, rbp);
        col.addView(restBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        membersBox = new LinearLayout(this);
        membersBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mp.topMargin = dp(8);
        col.addView(membersBox, mp);

        next = text(14, p.ink2, false);
        next.setGravity(Gravity.CENTER);
        next.setPadding(dp(4), dp(4), dp(4), 0);
        col.addView(next);

        complete = button(getString(R.string.lock_screen_hold), true);
        fitOneLine(complete, 12, 18);
        complete.setOnTouchListener(this::onHoldTouch);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(72));
        bottom.addView(complete, cp);
        holdBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        holdBar.setMax(1000);
        holdBar.setProgress(0);
        holdBar.setProgressTintList(ColorStateList.valueOf(p.brand));
        holdBar.setProgressBackgroundTintList(ColorStateList.valueOf(android.graphics.Color.TRANSPARENT)); // 카드색이면 라이트에서 완료 아래 띠가 보였다
        holdBar.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        bottom.addView(holdBar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(6)));
        return root;
    }

    /** 링 크기 — 낮은 화면·슈퍼셋은 작게(REV-021 안드로이드 M-4 · 화면 9). 글자 칸을 고정해야 자동 크기가 돈다. */
    private void sizeRing(boolean superset) {
        int size = superset ? 120 : getResources().getConfiguration().screenHeightDp < 680 ? 140 : 176;
        if (size == builtRingDp) return;
        builtRingDp = size;
        ringBox.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
        restLabel.setVisibility(superset ? View.GONE : View.VISIBLE);
        int maxSp = superset ? 28 : size == 176 ? 44 : 36;
        restClock.setLayoutParams(new LinearLayout.LayoutParams(dp(size * 0.66f), dp(superset ? 40 : size * 0.3f)));
        restClock.setTextSize(TypedValue.COMPLEX_UNIT_SP, maxSp);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(restClock, 16, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
    }

    /** 한 줄에 맞게 글자 크기를 줄인다(큰 글꼴·긴 값 · REV-015 화면 #4) */
    private void fitOneLine(TextView t, int minSp, int maxSp) {
        t.setMaxLines(1);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(t, minSp, maxSp, 1, TypedValue.COMPLEX_UNIT_SP);
    }

    private void setRestButton(Button b, boolean on) {
        b.setEnabled(on);
        b.setAlpha(on ? 1f : 0.4f);
    }

    private boolean guarded() {
        return SystemClock.uptimeMillis() < ignoreUntil;
    }

    // [원본] C안 그리기(SPEC-021) — SPEC-060 render() 로 대신
    @SuppressWarnings("unused")
    private void renderC(LockView v) {
        if (isFinishing() || isDestroyed()) return;
        if (shouldClose(v)) {
            // 진단(SPEC-020) — 잠금이 아직 안 걸린 채 켜졌으면(삼성 「자동 잠금」 지연 등) 여기서 닫힌다
            LockDiag.add(this, "운동 화면 닫음: " + (v.active ? "화면 켜짐 · 잠금 안 걸림" : "운동 없음"));
            finish();
            return;
        }
        maybeRetheme(v.theme);
        last = v;
        // [원본] title.setText(…) — 루틴 이름 대신 운동 시간(#T1)
        timePill.setVisibility(v.elapsedSec == null ? View.GONE : View.VISIBLE);
        if (v.elapsedSec != null) {
            timeIcon.setImageResource(v.paused ? R.drawable.ic_lock_pause : R.drawable.ic_lock_clock);
            timeText.setText(LockRules.clockText(v.elapsedSec));
            String timeDesc = getString(R.string.lock_screen_elapsed, (int) (v.elapsedSec / 60), (int) (v.elapsedSec % 60));
            timePill.setContentDescription(v.paused ? timeDesc + ", " + getString(R.string.lock_paused) : timeDesc);
        }
        boolean resting = v.restEndsAt != null && !v.paused;
        // [원본] restBox.setVisibility(resting ? View.VISIBLE : View.GONE); — 쉬는 시간이 끝나면 화면 구조가 바뀌었다
        // [개선] 운동 중엔 늘 같은 구조 — 쉬는 시간이 안 돌면 시계만 총시간으로 멈춘다
        restBox.setVisibility(View.VISIBLE);
        // 대기열이 막히면 휴식 버튼도 끈다(버튼 상태 표 · REV-015 화면 #6) · 슈퍼셋이면 시계를 줄인다(#3)
        // [원본] restBtns.setVisibility(v.openApp == LockView.OpenAppReason.STALLED ? View.GONE : View.VISIBLE);
        boolean restBtnsOn = !v.paused && v.openApp != LockView.OpenAppReason.STALLED;
        setRestButton(plusBtn, restBtnsOn); // 안 돌 때 +30초는 지금부터 30초를 시작한다(LockState.addRest)
        setRestButton(skipBtn, restBtnsOn && resting);
        sizeRing(v.members.size() > 1);
        if (resting) {
            long remain = Math.max(0, (v.restEndsAt - System.currentTimeMillis() + 999) / 1000);
            restClock.setText(String.format(Locale.ROOT, "%d:%02d", remain / 60, remain % 60));
            restClock.setContentDescription(getString(R.string.lock_screen_rest) + " " + restClock.getText());
            ring.setFraction(LockRules.restFraction(remain, v.restTotalSec));
        } else {
            restClock.setText(String.format(Locale.ROOT, "%d:%02d", v.restIdleSec / 60, v.restIdleSec % 60));
            restClock.setContentDescription(getString(R.string.lock_screen_rest) + " " + restClock.getText());
            ring.setFraction(1f);
        }
        // 멤버 줄은 단계·조정 가능 여부가 바뀔 때만 다시 만든다 — 누르는 중인 ± 버튼이 사라지지 않게
        StringBuilder key = new StringBuilder(v.stepToken).append('|').append(v.canAdjust);
        // 머리글·유산소 값도 — 앱에서 세트를 더하면 점이 옛 값으로 남았다(REV-022 안드로이드 L-1)
        for (LockView.Member m : v.members) {
            key.append('|').append(m.weight).append('/').append(m.reps).append('/').append(m.setNo).append('/').append(m.setTotal)
                    .append('/').append(m.label).append('/').append(m.oneSide).append('/').append(m.name).append('/').append(WorkoutNotification.valueLine(this, m));
        }
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
        boolean canDo = v.hasStep && v.screenCanComplete;
        if (canDo) {
            complete.setText("✓  " + getString(R.string.lock_screen_hold));
            // TalkBack 은 두 번 탭으로 바로 완료된다 — 「꾹 눌러」로 읽지 않는다(REV-021 화면 10)
            complete.setContentDescription(getString(R.string.lock_screen_complete));
            // TalkBack 의 두 번 탭은 터치가 아니라 클릭 — 의도한 조작이라 바로 완료한다(REV-015 화면 #1·플랫폼 M-6)
            complete.setOnClickListener(x -> {
                LockView lv = last;
                // [원본] talkBack() && … — 스위치 제어로는 완료할 수 없었다(REV-022 화면 8). 터치는 onHoldTouch 가 소비해 여기 오지 않는다
                if (lv != null && lv.screenCanComplete) act(LockActionReceiver.ACTION_COMPLETE, lv.stepToken);
            });
            holdBar.setVisibility(View.VISIBLE);
        } else {
            complete.setText(R.string.lock_screen_in_app);
            complete.setContentDescription(complete.getText());
            // [원본] complete.setOnTouchListener(null); — 완료 직후 손을 떼면 그 UP 이 클릭이 되어 PIN 창이 떴다(REV-022 안드로이드 M-1)
            complete.setOnClickListener(x -> {
                if (!guarded()) openApp();
            });
            holdBar.setVisibility(View.GONE);
        }
        // [원본] complete.setVisibility(v.hasStep || v.truncated ? View.VISIBLE : View.GONE);
        // [개선] 「앱에서 하기」 버튼은 보이지 않게 — 자리는 지켜 화면이 움직이지 않는다. 앱으로 가는 길은 위 「잠금 해제」.
        complete.setVisibility(canDo ? View.VISIBLE : v.hasStep || v.truncated ? View.INVISIBLE : View.GONE);

        String msg = null;
        if (v.paused) msg = getString(R.string.lock_paused);
        else if (v.openApp == LockView.OpenAppReason.VALUES && !v.screenCanComplete) msg = getString(R.string.lock_open_app_values);
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
            next.setVisibility(View.INVISIBLE); // [원본] GONE — 마지막 단계에서 카드가 한 줄만큼 내려가 ± 위치가 달라졌다
        }
    }

    // [원본] C안 멤버 카드(± 늘 보임) — SPEC-060 buildMembers() 로 대신
    @SuppressWarnings("unused")
    private void buildMembersC(LockView v) {
        stopRepeats();
        repeats.clear();
        membersBox.removeAllViews();
        rows.clear();
        boolean group = v.members.size() > 1;
        // 넉넉한 화면의 한 종목은 숫자·± 를 키운다 — 남는 공간의 쓸모(땀 젖은 손 · SPEC-021)
        bigControls = !group && getResources().getConfiguration().screenHeightDp >= 680;
        for (LockView.Member m : v.members) {
            // 한 종목은 카드 위 가운데 · 슈퍼셋은 카드마다 이름·세트(REV-021 화면 2)
            if (!group) membersBox.addView(memberHeader(m, true));
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setBackground(cardBg());
            card.setPadding(dp(14), dp(group ? 10 : 14), dp(14), dp(14));
            if (group) card.addView(memberHeader(m, false));
            String prefix = group ? m.name + " " : "";
            Row r = new Row();
            r.m = m;
            r.prefix = prefix;
            if (m.cardio || !v.canAdjust) {
                // 시간·거리 종목 · 조정할 수 없는 단계 — 값만(#34)
                TextView val = text(24, p.ink, true);
                val.setGravity(Gravity.CENTER);
                fitOneLine(val, 14, 24);
                String line = WorkoutNotification.valueLine(this, m);
                val.setText(line == null || line.isEmpty() ? "–" : line); // 값이 전부 없어도 빈 칸으로 두지 않는다(REV-022 화면 10)
                card.addView(val, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(40)));
            } else {
                if (m.weight != null) {
                    r.weight = text(bigControls ? 40 : 32, p.ink, true);
                    r.weightWas = text(13, p.ink3, false);
                    card.addView(stepper(prefix + getString(R.string.lock_screen_weight), r.weight, r.weightWas, m.setId, true));
                }
                r.reps = text(bigControls ? 40 : 32, p.ink, true);
                r.repsWas = text(13, p.ink3, false);
                card.addView(stepper(prefix + getString(R.string.lock_screen_reps), r.reps, r.repsWas, m.setId, false));
            }
            rows.put(m.setId, r);
            fillRow(r);
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            cp.bottomMargin = dp(10);
            membersBox.addView(card, cp);
        }
    }

    /** 종목 이름 · 세트 점 · 세트 글자(「한쪽」 포함) — 한 포커스로 묶는다(REV-021 화면 10·11·13) */
    private View memberHeader(LockView.Member m, boolean center) {
        LinearLayout h = new LinearLayout(this);
        h.setOrientation(LinearLayout.VERTICAL);
        h.setGravity(center ? Gravity.CENTER_HORIZONTAL : Gravity.START);
        h.setPadding(0, dp(center ? 4 : 0), 0, dp(8));
        h.setFocusable(true);
        TextView name = text(center ? 22 : 18, p.ink, true);
        name.setGravity(center ? Gravity.CENTER : Gravity.START);
        name.setText(m.name);
        h.addView(name);
        LinearLayout line = new LinearLayout(this);
        line.setGravity(center ? Gravity.CENTER : Gravity.CENTER_VERTICAL);
        line.setMinimumHeight(dp(24));
        if (center && m.setNo > 0 && m.setTotal >= 1 && m.setTotal <= 8 && m.setNo <= m.setTotal) {
            for (int i = 1; i <= m.setTotal; i++) line.addView(pip(i, m.setNo));
        }
        String setText = WorkoutNotification.setName(this, m) + (m.oneSide ? " · " + getString(R.string.lock_one_side) : "");
        TextView set = text(14, p.ink2, false);
        set.setText(setText);
        set.setPadding(line.getChildCount() > 0 ? dp(4) : 0, 0, 0, 0);
        line.addView(set);
        h.addView(line);
        h.setContentDescription(m.name + ", " + setText);
        return h;
    }

    /** 세트 점 — 지난·지금은 채움, 남은 것은 테두리만(색만으로 구분하지 않는다 · REV-021 화면 4) */
    private View pip(int no, int current) {
        View d = new View(this);
        int size = dp(no == current ? 14 : 10);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        if (no <= current) g.setColor(p.brand);
        else g.setStroke(dp(1.5f), p.ink3);
        d.setBackground(g);
        d.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
        lp.setMargins(dp(3), 0, dp(3), 0);
        d.setLayoutParams(lp);
        return d;
    }

    /** [−] 값 [+] — 길게 누르면 반복(#8) */
    private View stepper(String label, TextView value, TextView was, String setId, boolean weight) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        // [원본] 왼쪽 「무게」·「횟수」 글자 — 단위 줄이 대신한다(SPEC-021). 설명에는 남는다
        value.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        value.setFontFeatureSettings("tnum");
        Button minus = stepButton("−", label + " " + getString(R.string.lock_screen_minus));
        int stepDp = bigControls ? 64 : 56;
        row.addView(minus, new LinearLayout.LayoutParams(dp(stepDp), dp(stepDp)));
        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setGravity(Gravity.CENTER);
        value.setGravity(Gravity.CENTER);
        was.setGravity(Gravity.CENTER);
        was.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO); // 값 설명에 이미 있다
        fitOneLine(was, 9, 13);
        fitOneLine(value, 14, bigControls ? 40 : 32);
        // 값 칸 높이를 고정해야 자동 크기가 돈다(REV-021 화면 9)
        mid.addView(value, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(bigControls ? 48 : 40)));
        mid.addView(was, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(18)));
        row.addView(mid, lp(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button plus = stepButton("+", label + " " + getString(R.string.lock_screen_plus));
        row.addView(plus, new LinearLayout.LayoutParams(dp(stepDp), dp(stepDp)));
        repeat(minus, () -> nudge(setId, weight, -1));
        repeat(plus, () -> nudge(setId, weight, +1));
        return row;
    }

    // [원본] 보호 시간 검사가 UP·CANCEL 까지 삼켜 반복이 멈추지 않을 수 있었고(플랫폼 M-2), TalkBack 클릭이 없었다(#1)
    private void repeat(View b, Runnable r) {
        // [원본] 누르는 즉시 실행 + 스크롤 막기 — 슈퍼셋에서 ± 위로 밀면 값이 바뀌고 스크롤이 안 됐다(REV-022 화면 2)
        // [개선] 뗄 때 한 번 · 오래 누르면 그때부터 반복 · 끌면 ScrollView 가 가져가 CANCEL 로 취소
        final boolean[] armed = new boolean[1];
        final boolean[] fired = new boolean[1];
        final View target = b;
        final Runnable[] loop = new Runnable[1];
        loop[0] = () -> {
            fired[0] = true;
            if (target.getParent() != null) target.getParent().requestDisallowInterceptTouchEvent(true);
            r.run();
            main.postDelayed(loop[0], 140);
        };
        repeats.add(loop[0]);
        b.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    armed[0] = !guarded(); // 보호는 누르기 시작에서만
                    fired[0] = false;
                    if (!armed[0]) return true;
                    v.setPressed(true);
                    repeatPressed = true;
                    v.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
                    main.postDelayed(loop[0], 450);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    // 스크롤할 게 없으면 ScrollView 가 CANCEL 을 주지 않는다 — 버튼 밖으로 끌면 직접 취소한다(에뮬레이터 실측)
                    if (armed[0] && !fired[0] && (e.getX() < 0 || e.getY() < 0 || e.getX() > v.getWidth() || e.getY() > v.getHeight())) {
                        armed[0] = false;
                        v.setPressed(false);
                        repeatPressed = false;
                        main.removeCallbacks(loop[0]);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    v.setPressed(false);
                    repeatPressed = false;
                    main.removeCallbacks(loop[0]);
                    if (armed[0] && !fired[0]) r.run();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    v.setPressed(false);
                    repeatPressed = false;
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
        repeatPressed = false;
    }

    // [원본] 「• 80kg」 + 「원래 75kg」 — 숫자 옆 표시 대신 강조색과 단위 줄로(REV-021 화면 8)
    private void fillRow(Row r) {
        LockView.Member m = r.m;
        if (r.weight != null) {
            boolean edited = m.draftWeight != null;
            double w = edited ? m.draftWeight : (m.weight == null ? 0 : m.weight);
            String was = edited && m.weight != null ? getString(R.string.lock_screen_was, WorkoutNotification.num(m.weight)) : null;
            r.weight.setText(WorkoutNotification.num(w));
            r.weight.setTextColor(edited ? p.brand : p.ink);
            r.weightWas.setText(was == null ? m.unit : m.unit + " · " + was);
            r.weight.setContentDescription(r.prefix + getString(R.string.lock_screen_weight) + " " + WorkoutNotification.num(w) + m.unit + (was == null ? "" : ", " + was));
        }
        if (r.reps != null) {
            boolean edited = m.draftReps != null;
            String unit = getString(R.string.lock_screen_reps_unit);
            // 횟수가 없으면(처방 없음) 「–」 — 「0회」로 보이지 않게(REV-015 화면 #8)
            if (!edited && m.reps == null) {
                r.reps.setText("–");
                r.reps.setTextColor(p.ink);
                r.repsWas.setText(unit);
                r.reps.setContentDescription(r.prefix + getString(R.string.lock_screen_reps));
                return;
            }
            int n = edited ? m.draftReps : m.reps;
            String was = edited && m.reps != null ? getString(R.string.lock_screen_was, String.valueOf(m.reps)) : null;
            r.reps.setText(String.valueOf(n));
            r.reps.setTextColor(edited ? p.brand : p.ink);
            r.repsWas.setText(was == null ? unit : unit + " · " + was);
            r.reps.setContentDescription(r.prefix + getString(R.string.lock_screen_reps) + " " + getResources().getQuantityString(R.plurals.lock_reps, n, n) + (was == null ? "" : ", " + was));
        }
    }

    // ── SPEC-060 화면 ─────────────────────────────────────────────────────
    // 위: 운동 시간 글자 · 「잠금 해제」 / 안내 / 고정: 쉬는 시간 줄(모래시계 · 시계 · 눌러서 ±30초) · 가는 막대 · 밀기 칸
    // 스크롤(위 정렬): 종목마다 구분선 · 이름·세트 · 값 칸(누르면 ± 줄) · 「다음」

    private View build() {
        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(p.bg);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(14), dp(16), dp(6));
        root.addView(top);
        // [원본 SPEC-021] 시간 알약(바탕 · 999) — 정보는 바탕 없는 글자(SPEC-060 1a)
        timePill = new LinearLayout(this);
        timePill.setGravity(Gravity.CENTER_VERTICAL);
        timePill.setMinimumHeight(dp(48));
        timePill.setFocusable(true);
        timeIcon = new ImageView(this);
        timeIcon.setImageResource(R.drawable.ic_lock_clock);
        timeIcon.setColorFilter(p.ink3);
        timeIcon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        timePill.addView(timeIcon);
        timeText = text(16, p.ink2, true);
        timeText.setFontFeatureSettings("tnum");
        timeText.setGravity(Gravity.CENTER_VERTICAL);
        timeText.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        fitOneLine(timeText, 10, 16);
        LinearLayout.LayoutParams timeLp = new LinearLayout.LayoutParams(dp(68), dp(28));
        timeLp.setMarginStart(dp(6));
        timePill.addView(timeText, timeLp);
        top.addView(timePill);
        top.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        unlock = button(getString(R.string.lock_screen_unlock), false);
        unlock.setBackground(rect(p.bg, p.stroke, 1));
        unlock.setMinHeight(dp(48));
        unlock.setMinimumHeight(dp(48));
        unlock.setPadding(dp(14), 0, dp(14), 0);
        Drawable lockIcon = getDrawable(R.drawable.ic_lock_unlock);
        if (lockIcon != null) {
            lockIcon = lockIcon.mutate();
            lockIcon.setTint(p.ink);
            unlock.setCompoundDrawablesRelativeWithIntrinsicBounds(lockIcon, null, null, null);
            unlock.setCompoundDrawablePadding(dp(6));
        }
        unlock.setOnClickListener(x -> {
            if (!guarded()) openApp();
        });
        top.addView(unlock);

        notice = text(15, p.ink2, false);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(16), dp(2), dp(16), dp(4));
        notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(notice);

        // 쉬는 시간 + 밀기 — 고정(휴식이 시작·끝나도, 값 칸을 열어도 움직이지 않는다)
        restBox = new LinearLayout(this);
        restBox.setOrientation(LinearLayout.VERTICAL);
        restBox.setPadding(dp(16), dp(4), dp(16), dp(10));
        restRow = new LinearLayout(this);
        restRow.setGravity(Gravity.CENTER_VERTICAL);
        restRow.setMinimumHeight(dp(72));
        restRow.setPadding(dp(4), dp(4), dp(4), dp(4));
        restRow.setBackground(rect(p.bg, 0, 0));
        restRow.setFocusable(true);
        restRow.setOnClickListener(x -> {
            if (guarded() || !restEnabled) return;
            setRestOpen(!restOpen);
        });
        hourglass = new LockHourglassView(this);
        hourglass.setColors(p.ink3, p.ink2, p.brand);
        LinearLayout.LayoutParams hgLp = new LinearLayout.LayoutParams(dp(48), dp(68));
        hgLp.setMarginEnd(dp(12));
        restRow.addView(hourglass, hgLp);
        LinearLayout clockCol = new LinearLayout(this);
        clockCol.setOrientation(LinearLayout.VERTICAL);
        restLabel = text(14, p.ink3, true);
        restLabel.setText(R.string.lock_screen_rest);
        restLabel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        clockCol.addView(restLabel);
        restClock = text(44, p.ink, true);
        restClock.setMaxLines(1);
        restClock.setFontFeatureSettings("tnum");
        restClock.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        restClock.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        clockCol.addView(restClock, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)));
        restRow.addView(clockCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        // 오른쪽 — 안내 글자 자리에서 [−30초][+30초] 로 바뀐다(아래 칸이 움직이지 않게)
        FrameLayout right = new FrameLayout(this);
        restHint = text(13, p.ink3, false);
        restHint.setText(R.string.lock_rest_hint);
        restHint.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        restHint.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        right.addView(restHint, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL));
        restAdjust = new LinearLayout(this);
        minusBtn = smallButton(getString(R.string.lock_minus30), getString(R.string.lock_minus30_desc));
        minusBtn.setOnClickListener(x -> {
            if (guarded()) return;
            act(LockActionReceiver.ACTION_MINUS30, null);
            scheduleRestClose();
        });
        plusBtn = smallButton(getString(R.string.lock_action_plus30), getString(R.string.lock_plus30_desc));
        plusBtn.setOnClickListener(x -> {
            if (guarded()) return;
            act(LockActionReceiver.ACTION_PLUS30, null);
            scheduleRestClose();
        });
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(dp(80), dp(52));
        mlp.setMarginEnd(dp(6));
        restAdjust.addView(minusBtn, mlp);
        restAdjust.addView(plusBtn, new LinearLayout.LayoutParams(dp(80), dp(52)));
        restAdjust.setVisibility(View.GONE);
        right.addView(restAdjust, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL));
        restRow.addView(right, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        restBox.addView(restRow, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        restTrack = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        restTrack.setMax(1000);
        restTrack.setProgressTintList(ColorStateList.valueOf(p.brand));
        restTrack.setProgressBackgroundTintList(ColorStateList.valueOf(p.track));
        restTrack.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(4));
        tlp.topMargin = dp(6);
        restBox.addView(restTrack, tlp);
        slide = new LockSlideView(this);
        slide.setColors(p.card, p.line, p.stroke, p.brand, p.onBrand, p.ink, p.ink2);
        slide.setListener(slideListener);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        slp.topMargin = dp(12);
        restBox.addView(slide, slp);
        root.addView(restBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        root.addView(sv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(4), dp(16), dp(16));
        // [원본 SPEC-021] col.setGravity(Gravity.BOTTOM) — 값 칸을 열면 위 내용이 밀려 누른 칸이 움직였다(REV-146 안드로이드 6)
        col.setGravity(Gravity.TOP);
        sv.addView(col);
        membersBox = new LinearLayout(this);
        membersBox.setOrientation(LinearLayout.VERTICAL);
        col.addView(membersBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        next = text(14, p.ink3, false);
        next.setPadding(0, dp(10), 0, 0);
        col.addView(next);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, ins) -> {
            androidx.core.graphics.Insets b = ins.getInsets(
                    androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });
        setRestOpen(restOpen);
        return root;
    }

    /** ±30초 · ± 줄 단추 — 4dp 테두리(SPEC-060) */
    private Button smallButton(String label, String description) {
        Button b = button(label, false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setPadding(dp(4), 0, dp(4), 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setMinHeight(dp(48));
        b.setMinimumHeight(dp(48));
        b.setContentDescription(description);
        fitOneLine(b, 10, 16);
        return b;
    }

    private android.view.accessibility.AccessibilityManager a11y() {
        return getSystemService(android.view.accessibility.AccessibilityManager.class);
    }

    /** TalkBack(터치 탐색) 켜짐 */
    private boolean talkBack() {
        android.view.accessibility.AccessibilityManager am = a11y();
        return am != null && am.isEnabled() && am.isTouchExplorationEnabled();
    }

    /** 시간 제한은 접근성 권장값을 거친다(API 29+ · REV-146 사용성 6) */
    private long timeout(long ms) {
        android.view.accessibility.AccessibilityManager am = a11y();
        if (Build.VERSION.SDK_INT >= 29 && am != null) {
            return am.getRecommendedTimeoutMillis((int) ms,
                    android.view.accessibility.AccessibilityManager.FLAG_CONTENT_CONTROLS | android.view.accessibility.AccessibilityManager.FLAG_CONTENT_TEXT);
        }
        return ms;
    }

    private void setRestOpen(boolean open) {
        restOpen = open && restEnabled;
        if (restAdjust == null) return;
        restAdjust.setVisibility(restOpen ? View.VISIBLE : View.GONE);
        restHint.setVisibility(restOpen ? View.GONE : restEnabled ? View.VISIBLE : View.INVISIBLE);
        androidx.core.view.ViewCompat.setStateDescription(restRow, getString(restOpen ? R.string.lock_state_open : R.string.lock_state_closed));
        main.removeCallbacks(closeRest);
        if (restOpen) scheduleRestClose();
    }

    private void scheduleRestClose() {
        main.removeCallbacks(closeRest);
        if (restOpen && !talkBack()) main.postDelayed(closeRest, timeout(4000));
    }

    /** 시계 글자 크기 — 낮은 화면·슈퍼셋은 작게. 글자 칸을 고정해야 자동 크기가 돈다. */
    private void sizeRest(boolean superset) {
        int sp = superset || getResources().getConfiguration().screenHeightDp < 680 ? 36 : 44;
        if (sp == builtClockSp) return;
        builtClockSp = sp;
        restClock.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(restClock, 16, sp, 1, TypedValue.COMPLEX_UNIT_SP);
    }

    private void flash(String msg, long ms) {
        flashMsg = msg;
        flashUntil = SystemClock.uptimeMillis() + ms;
        reload();
    }

    private void render(LockView v) {
        if (isFinishing() || isDestroyed()) return;
        if (shouldClose(v)) {
            LockDiag.add(this, "운동 화면 닫음: " + (v.active ? "화면 켜짐 · 잠금 안 걸림" : "운동 없음"));
            finish();
            return;
        }
        // 밀고 있는 동안은 다시 그리지 않는다 — 놓은 뒤 그린다(REV-146 안드로이드 4). 단계 비교용으로 last 만 바꾼다
        if (dragging) {
            last = v;
            return;
        }
        maybeRetheme(v.theme);
        last = v;
        timePill.setVisibility(v.elapsedSec == null ? View.GONE : View.VISIBLE);
        if (v.elapsedSec != null) {
            timeIcon.setImageResource(v.paused ? R.drawable.ic_lock_pause : R.drawable.ic_lock_clock);
            timeText.setText(LockRules.clockText(v.elapsedSec));
            String timeDesc = getString(R.string.lock_screen_elapsed, (int) (v.elapsedSec / 60), (int) (v.elapsedSec % 60));
            timePill.setContentDescription(v.paused ? timeDesc + ", " + getString(R.string.lock_paused) : timeDesc);
        }
        boolean resting = v.restEndsAt != null && !v.paused;
        restBox.setVisibility(View.VISIBLE);
        // [원본 SPEC-021] +30초·건너뛰기 단추 늘 보임 — 쉬는 시간 줄을 눌러야 ±30초(SPEC-060 4A) · 건너뛰기는 밀기가 대신한다
        restEnabled = !v.paused && v.openApp != LockView.OpenAppReason.STALLED;
        plusBtn.setEnabled(restEnabled);
        minusBtn.setEnabled(restEnabled && resting);
        minusBtn.setAlpha(restEnabled && resting ? 1f : 0.4f);
        if (!restEnabled && restOpen) setRestOpen(false);
        else if (!restOpen) restHint.setVisibility(restEnabled ? View.VISIBLE : View.INVISIBLE);
        restRow.setClickable(restEnabled);
        sizeRest(v.members.size() > 1);
        float frac;
        if (resting) {
            long remain = Math.max(0, (v.restEndsAt - System.currentTimeMillis() + 999) / 1000);
            restClock.setText(String.format(Locale.ROOT, "%d:%02d", remain / 60, remain % 60));
            frac = LockRules.restFraction(remain, v.restTotalSec);
            restTrack.setProgress(Math.round((1f - frac) * 1000));
        } else {
            restClock.setText(String.format(Locale.ROOT, "%d:%02d", v.restIdleSec / 60, v.restIdleSec % 60));
            frac = 1f;
            restTrack.setProgress(0);
        }
        hourglass.set(resting, frac, wasResting != null);
        wasResting = resting;
        String restDesc = getString(R.string.lock_screen_rest) + " " + restClock.getText();
        restRow.setContentDescription(restEnabled ? getString(R.string.lock_rest_row_desc, restDesc) : restDesc);

        StringBuilder key = new StringBuilder(v.stepToken).append('|').append(v.canAdjust);
        for (LockView.Member m : v.members) {
            key.append('|').append(m.weight).append('/').append(m.reps).append('/').append(m.setNo).append('/').append(m.setTotal)
                    .append('/').append(m.label).append('/').append(m.oneSide).append('/').append(m.name).append('/').append(WorkoutNotification.valueLine(this, m));
        }
        if (!key.toString().equals(builtKey)) {
            builtKey = key.toString();
            buildMembers(v);
        }
        if (pendingEdits == 0) {
            for (LockView.Member m : v.members) {
                Row r = rows.get(m.setId);
                if (r != null) {
                    r.m = m;
                    fillRowV(r);
                }
            }
        }
        renderSlide(v);

        String msg = null;
        if (v.paused) msg = getString(R.string.lock_paused);
        else if (v.openApp == LockView.OpenAppReason.VALUES && !v.screenCanComplete) msg = getString(R.string.lock_open_app_values);
        else if (v.openApp == LockView.OpenAppReason.STALLED) msg = getString(R.string.lock_open_app_stalled);
        else if (v.openApp == LockView.OpenAppReason.TRUNCATED) msg = getString(R.string.lock_truncated);
        else if (!v.hasStep && v.undoUntil == null) msg = getString(R.string.lock_no_steps);
        if (v.draftLost) {
            draftLostUntil = SystemClock.uptimeMillis() + 6000;
            clearDraftLost();
        }
        if (SystemClock.uptimeMillis() < draftLostUntil) msg = getString(R.string.lock_screen_draft_lost);
        if (SystemClock.uptimeMillis() < flashUntil) msg = flashMsg;
        notice.setText(msg == null ? "" : msg);
        // [원본] GONE — 「되돌렸어요」 같은 안내가 뜨고 질 때 밀기 칸이 한 줄씩 오르내렸다(에뮬레이터 실측) · 자리를 지킨다
        notice.setVisibility(msg == null ? View.INVISIBLE : View.VISIBLE);
        if (v.next != null) {
            next.setText(getString(R.string.lock_next, v.next.name + " · " + WorkoutNotification.setName(this, v.next)));
            next.setVisibility(View.VISIBLE);
        } else {
            next.setVisibility(View.INVISIBLE);
        }
    }

    /** 밀기 칸 — 되돌리기 띠 · 확인 · 밀기 · 감춤(완료할 수 없는 단계) */
    private void renderSlide(LockView v) {
        long nowU = SystemClock.uptimeMillis();
        if (v.undoUntil != null && v.undoActionId != null) {
            long left = v.undoUntil - System.currentTimeMillis() - 300; // 저장소보다 조금 일찍 닫는다(REV-146 계약 4)
            if (left > 0) {
                String what = undoText(v.undoMembers);
                boolean entering = !v.undoActionId.equals(undoShownId);
                if (entering) {
                    undoShownId = v.undoActionId;
                    undoTotalMs = left;
                    main.postDelayed(this::reload, left + 30);
                }
                slide.setVisibility(View.VISIBLE);
                slide.showUndo(what, getString(R.string.lock_undo), getString(R.string.lock_undo_desc, what), nowU + left, undoTotalMs);
                if (entering) slide.announceForAccessibility(getString(R.string.lock_undo_desc, what));
                return;
            }
        }
        if (undoShownId != null) {
            undoShownId = null;
            undoEndedAt = nowU;
            if (talkBack()) slide.announceForAccessibility(getString(R.string.lock_undo_ended));
        }
        boolean canDo = v.hasStep && v.screenCanComplete;
        if (!canDo) {
            confirmUntil = 0;
            slide.showSlide(LockSlideView.Mode.SLIDE, getString(R.string.lock_slide_complete) + "  ›››", getString(R.string.lock_screen_complete));
            // 자리는 지켜 화면이 움직이지 않는다 · 앱으로 가는 길은 위 「잠금 해제」
            slide.setVisibility(v.hasStep || v.truncated ? View.INVISIBLE : View.GONE);
            return;
        }
        slide.setVisibility(View.VISIBLE);
        if (nowU < confirmUntil && !v.members.isEmpty()) {
            String q = getString(R.string.lock_slide_confirm, WorkoutNotification.setName(this, v.members.get(0)));
            slide.showSlide(LockSlideView.Mode.CONFIRM, q, q);
        } else {
            slide.showSlide(LockSlideView.Mode.SLIDE, getString(R.string.lock_slide_complete) + "  ›››", getString(R.string.lock_screen_complete));
        }
    }

    /** 되돌리기 띠 글자 — 「벤치프레스 3/5세트 · 80kg × 8회」 · 슈퍼셋은 「… +1」 */
    private String undoText(java.util.List<LockView.Member> ms) {
        if (ms.isEmpty()) return getString(R.string.lock_screen_complete);
        LockView.Member m = ms.get(0);
        if (m.draftWeight != null) m.weight = m.draftWeight;
        if (m.draftReps != null) m.reps = m.draftReps;
        String s = m.name + " " + WorkoutNotification.setName(this, m);
        if (ms.size() > 1) return s + " +" + (ms.size() - 1);
        String line = WorkoutNotification.valueLine(this, m);
        return line == null || line.isEmpty() ? s : s + " · " + line;
    }

    /** ② 다시 확인이 필요한 단계인가 — 드롭 세트·슈퍼셋은 연달아 끝내는 것이 정상이라 묻지 않는다(REV-146 사용성 2) */
    private static boolean needsConfirm(LockView v) {
        return v.members.size() == 1 && !"D".equals(v.members.get(0).label);
    }

    private final LockSlideView.Listener slideListener = new LockSlideView.Listener() {
        @Override
        public void onSlid() {
            LockView v = last;
            if (v == null || !v.hasStep || !v.screenCanComplete || slideToken == null || !slideToken.equals(v.stepToken)) {
                slide.resetThumb(true); // 밀던 사이 단계가 바뀌었다 — 다른 세트를 완료하지 않는다
                reload();
                return;
            }
            long now = SystemClock.uptimeMillis();
            boolean confirming = slideConfirming || now < confirmUntil;
            if (!confirming && lastDoneAt > 0 && now - lastDoneAt < 15_000 && needsConfirm(v)) {
                confirmUntil = now + timeout(5000);
                // 완료 진동과 다르게 — 짧게 두 번(REV-146 사용성 7)
                slide.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
                main.postDelayed(() -> slide.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP), 130);
                String q = getString(R.string.lock_slide_confirm, WorkoutNotification.setName(LockWorkoutActivity.this, v.members.get(0)));
                slide.showSlide(LockSlideView.Mode.CONFIRM, q, q);
                slide.announceForAccessibility(q);
                main.removeCallbacks(confirmExpire);
                main.postDelayed(confirmExpire, confirmUntil - now + 20);
                return;
            }
            completeNow(v.stepToken);
        }

        @Override
        public void onClickComplete() {
            // 되돌리기 띠가 끝난 직후 1초는 받지 않는다 — 되돌리려던 두 번 탭이 다음 세트를 완료하지 않게(REV-146 사용성 5)
            if (SystemClock.uptimeMillis() < undoEndedAt + 1000) return;
            LockView v = last;
            if (v != null && v.hasStep && v.screenCanComplete) completeNow(v.stepToken);
        }

        @Override
        public void onUndo() {
            undoNow();
        }

        @Override
        public void onDragging(boolean d) {
            dragging = d;
            if (d) {
                slideToken = last == null ? null : last.stepToken;
                slideConfirming = SystemClock.uptimeMillis() < confirmUntil;
                closeEditor(); // 밀면 열린 줄은 닫고 지금 칸 값으로 완료한다(REV-146 사용성 8)
                setRestOpen(false);
            }
        }

        @Override
        public boolean guarded() {
            return LockWorkoutActivity.this.guarded();
        }
    };

    private void completeNow(String token) {
        // [원본] lastDoneAt = SystemClock.uptimeMillis(); — 완료가 안 돼도 「직전 완료」로 셌다(REV-148 4)
        confirmUntil = 0;
        slideConfirming = false;
        main.removeCallbacks(confirmExpire);
        closeEditor();
        setRestOpen(false);
        final long hold = Math.min(LockState.HOLD_MAX_MS, timeout(LockActionReceiver.UNDO_MS));
        final Context app = getApplicationContext();
        try {
            io.execute(() -> {
                String r = null;
                try {
                    r = LockActionReceiver.handle(app, LockActionReceiver.ACTION_COMPLETE, token, true, hold);
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "운동 화면 조작 실패", e);
                }
                final boolean done = LockActionReceiver.DONE.equals(r);
                main.post(() -> {
                    if (done) lastDoneAt = SystemClock.uptimeMillis();
                    reload();
                });
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // 닫히는 중
        }
        // 완료가 안 됐으면(그새 바뀜) 손잡이를 돌려놓는다 — 다시 밀고 있으면 건드리지 않는다(REV-148 3)
        main.postDelayed(() -> {
            if (slide != null && !slide.isDragging() && slide.mode() != LockSlideView.Mode.UNDO) slide.resetThumb(true);
        }, 700);
    }

    private void undoNow() {
        LockView v = last;
        if (v == null || v.undoActionId == null) return;
        final String id = v.undoActionId;
        final Context app = getApplicationContext();
        try {
            io.execute(() -> {
                String r = null;
                try {
                    r = LockActionReceiver.handle(app, LockActionReceiver.ACTION_UNDO, id, false, 0);
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "되돌리기 실패", e);
                }
                final String res = r;
                main.post(() -> {
                    boolean ok = LockState.UNDONE.equals(res);
                    if (ok) lastDoneAt = 0; // 되돌렸으면 다음 밀기에 확인을 묻지 않는다(REV-146 안드로이드 7)
                    // 「되돌리기 끝남」을 또 읽지 않게 띠 상태를 먼저 닫는다(REV-148 6)
                    undoShownId = null;
                    undoEndedAt = SystemClock.uptimeMillis();
                    String msg = getString(ok ? R.string.lock_undone : R.string.lock_undo_expired);
                    if (slide != null) slide.announceForAccessibility(msg);
                    flash(msg, ok ? 2500 : 3000);
                });
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // 닫히는 중
        }
    }

    /** 붙잡은 화면 완료를 확정한다 — 화면을 떠날 때(REV-146 안드로이드 2 · 계약 3) */
    private void releaseHold() {
        final Context app = getApplicationContext();
        Runnable r = () -> {
            try {
                Boolean had = LockHub.store(app).write(LockState::releaseHold);
                if (Boolean.TRUE.equals(had)) {
                    LockHub.refresh(app);
                    LiftgramLockPlugin.fireAction();
                }
            } catch (Exception e) {
                android.util.Log.w("LiftgramLock", "붙잡기 풀기 실패", e);
            }
        };
        try {
            io.execute(r);
        } catch (java.util.concurrent.RejectedExecutionException e) {
            new Thread(r, "liftgram-lock-release").start();
        }
    }

    private void buildMembers(LockView v) {
        stopRepeats();
        repeats.clear();
        membersBox.removeAllViews();
        rows.clear();
        valueHint = null;
        boolean group = v.members.size() > 1;
        bigControls = !group && getResources().getConfiguration().screenHeightDp >= 680;
        for (LockView.Member m : v.members) {
            View sep = new View(this);
            sep.setBackgroundColor(p.line);
            membersBox.addView(sep, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));
            LinearLayout blk = new LinearLayout(this);
            blk.setOrientation(LinearLayout.VERTICAL);
            blk.setPadding(0, dp(12), 0, dp(12));
            blk.addView(memberHeaderFlat(m, group));
            Row r = new Row();
            r.m = m;
            r.setId = m.setId;
            r.prefix = group ? m.name + " " : "";
            if (m.cardio || !v.canAdjust) {
                TextView val = text(24, p.ink, true);
                fitOneLine(val, 14, 24);
                String line = WorkoutNotification.valueLine(this, m);
                val.setText(line == null || line.isEmpty() ? "–" : line);
                blk.addView(val, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(40)));
            } else {
                LinearLayout cells = new LinearLayout(this);
                final String setId = m.setId;
                if (m.weight != null) {
                    r.weight = text(bigControls ? 40 : 32, p.ink, true);
                    r.weightWas = text(13, p.ink3, false);
                    r.weightCell = valueCell(r.weight, r.weightWas);
                    r.weightCell.setOnClickListener(x -> openEditor(setId, true));
                    LinearLayout.LayoutParams wl = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
                    wl.setMarginEnd(dp(8));
                    cells.addView(r.weightCell, wl);
                }
                r.reps = text(bigControls ? 40 : 32, p.ink, true);
                r.repsWas = text(13, p.ink3, false);
                r.repsCell = valueCell(r.reps, r.repsWas);
                r.repsCell.setOnClickListener(x -> openEditor(setId, false));
                cells.addView(r.repsCell, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
                blk.addView(cells, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                r.editor = editorRow(r);
                blk.addView(r.editor);
                if (valueHint == null) {
                    valueHint = text(13, p.ink3, false);
                    valueHint.setText(R.string.lock_value_hint);
                    valueHint.setPadding(0, dp(6), 0, 0);
                    blk.addView(valueHint);
                }
            }
            rows.put(m.setId, r);
            fillRowV(r);
            membersBox.addView(blk);
        }
        // 재빌드 전에 열려 있던 칸을 다시 연다(REV-146 안드로이드 4)
        if (openEditSetId != null) {
            Row r = rows.get(openEditSetId);
            if (r != null && r.editor != null && (openEditWeight ? r.weightCell != null : r.repsCell != null)) showEditor(r, openEditWeight);
            else closeEditor();
        }
    }

    /** 종목 이름 · 세트 점 · 세트 글자 — 왼쪽 정렬 · 한 포커스 */
    private View memberHeaderFlat(LockView.Member m, boolean group) {
        LinearLayout h = new LinearLayout(this);
        h.setOrientation(LinearLayout.VERTICAL);
        h.setPadding(0, 0, 0, dp(8));
        h.setFocusable(true);
        TextView name = text(group ? 18 : 22, p.ink, true);
        name.setText(m.name);
        h.addView(name);
        LinearLayout line = new LinearLayout(this);
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.setMinimumHeight(dp(24));
        if (!group && m.setNo > 0 && m.setTotal >= 1 && m.setTotal <= 8 && m.setNo <= m.setTotal) {
            for (int i = 1; i <= m.setTotal; i++) line.addView(pip(i, m.setNo));
        }
        String setText = WorkoutNotification.setName(this, m) + (m.oneSide ? " · " + getString(R.string.lock_one_side) : "");
        TextView set = text(14, p.ink2, false);
        set.setText(setText);
        set.setPadding(line.getChildCount() > 0 ? dp(6) : 0, 0, 0, 0);
        line.addView(set);
        h.addView(line);
        h.setContentDescription(m.name + ", " + setText);
        return h;
    }

    /** 값 칸 — 누르면 아래 ± 줄이 열린다(SPEC-060 4A) · 높이 64dp 이상(장갑) */
    private LinearLayout valueCell(TextView value, TextView was) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        c.setMinimumHeight(dp(bigControls ? 80 : 64));
        c.setPadding(dp(8), dp(6), dp(8), dp(6));
        c.setBackground(rect(p.card, p.stroke, 1));
        c.setFocusable(true);
        c.setClickable(true);
        value.setGravity(Gravity.CENTER);
        value.setFontFeatureSettings("tnum");
        value.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        fitOneLine(value, 14, bigControls ? 40 : 32);
        was.setGravity(Gravity.CENTER);
        was.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        fitOneLine(was, 9, 13);
        c.addView(value, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(bigControls ? 48 : 40)));
        // 단위 줄 22dp — 글꼴 200% 에서 18dp 면 「kg」 아래가 잘렸다(에뮬레이터 실측)
        c.addView(was, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(22)));
        c.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        return c;
    }

    /** [−][+][원래대로·닫기] — 56dp · 누르면 4초 뒤 닫힘을 다시 센다 · 오래 누르면 반복(#8) */
    private LinearLayout editorRow(Row r) {
        LinearLayout e = new LinearLayout(this);
        e.setPadding(0, dp(8), 0, 0);
        r.editMinus = smallButton("−", "");
        r.editPlus = smallButton("+", "");
        r.editReset = smallButton(getString(R.string.lock_value_close), getString(R.string.lock_value_close));
        r.editMinus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        r.editPlus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, dp(56), 1);
        a.setMarginEnd(dp(8));
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, dp(56), 1);
        b.setMarginEnd(dp(8));
        e.addView(r.editMinus, a);
        e.addView(r.editPlus, b);
        e.addView(r.editReset, new LinearLayout.LayoutParams(0, dp(56), 1));
        final String setId = r.setId;
        repeat(r.editMinus, () -> {
            nudge(setId, r.editingWeight, -1);
            scheduleEditClose();
        });
        repeat(r.editPlus, () -> {
            nudge(setId, r.editingWeight, +1);
            scheduleEditClose();
        });
        r.editReset.setOnClickListener(x -> {
            if (guarded()) return;
            boolean edited = r.editingWeight ? r.m.draftWeight != null : r.m.draftReps != null;
            if (edited) {
                resetField(r);
                scheduleEditClose();
            } else {
                closeEditor();
            }
        });
        e.setVisibility(View.GONE);
        return e;
    }

    private void openEditor(String setId, boolean weight) {
        if (guarded()) return;
        Row r = rows.get(setId);
        if (r == null || r.editor == null) return;
        if (setId.equals(openEditSetId) && openEditWeight == weight) {
            closeEditor(); // 같은 칸을 다시 누르면 닫는다
            return;
        }
        showEditor(r, weight);
    }

    private void showEditor(Row r, boolean weight) {
        for (Row o : rows.values()) {
            if (o.editor != null && o != r) o.editor.setVisibility(View.GONE);
        }
        r.editingWeight = weight;
        openEditSetId = r.setId;
        openEditWeight = weight;
        String unit = weight ? r.m.unit : getString(R.string.lock_screen_reps_unit);
        String step = weight ? WorkoutNotification.num(LockRules.weightStep(r.m.unit)) : "1";
        String field = r.prefix + getString(weight ? R.string.lock_screen_weight : R.string.lock_screen_reps);
        r.editMinus.setText("−" + step);
        r.editPlus.setText("+" + step);
        r.editMinus.setContentDescription(field + " " + step + unit + " " + getString(R.string.lock_screen_minus));
        r.editPlus.setContentDescription(field + " " + step + unit + " " + getString(R.string.lock_screen_plus));
        r.editor.setVisibility(View.VISIBLE);
        if (valueHint != null) valueHint.setVisibility(View.GONE);
        paintCells();
        updateReset(r);
        scheduleEditClose();
        final View ed = r.editor;
        ed.post(() -> {
            android.graphics.Rect box = new android.graphics.Rect(0, 0, ed.getWidth(), ed.getHeight());
            ed.requestRectangleOnScreen(box, false);
        });
    }

    private void closeEditor() {
        main.removeCallbacks(closeEdit);
        openEditSetId = null;
        for (Row o : rows.values()) if (o.editor != null) o.editor.setVisibility(View.GONE);
        if (valueHint != null) valueHint.setVisibility(View.VISIBLE);
        paintCells();
    }

    private void scheduleEditClose() {
        main.removeCallbacks(closeEdit);
        if (openEditSetId != null && !talkBack()) main.postDelayed(closeEdit, timeout(4000));
    }

    /** 열린 칸은 강조색 테두리 2dp(SPEC-060 강조색 규칙) · 펼침 상태를 읽어 준다 */
    private void paintCells() {
        for (Row o : rows.values()) {
            for (int i = 0; i < 2; i++) {
                LinearLayout c = i == 0 ? o.weightCell : o.repsCell;
                if (c == null) continue;
                boolean open = o.setId.equals(openEditSetId) && openEditWeight == (i == 0);
                c.setBackground(open ? rect(p.card, p.brand, 2) : rect(p.card, p.stroke, 1));
                androidx.core.view.ViewCompat.setStateDescription(c, getString(open ? R.string.lock_state_open : R.string.lock_state_closed));
            }
        }
    }

    private void updateReset(Row r) {
        if (r.editReset == null) return;
        boolean edited = r.editingWeight ? r.m.draftWeight != null : r.m.draftReps != null;
        String t = getString(edited ? R.string.lock_value_reset : R.string.lock_value_close);
        r.editReset.setText(t);
        r.editReset.setContentDescription(t);
    }

    /** fillRow + 값 칸 설명 · 원래대로 글자 */
    private void fillRowV(Row r) {
        fillRow(r);
        if (r.weightCell != null && r.weight != null) r.weightCell.setContentDescription(getString(R.string.lock_value_open_desc, r.weight.getContentDescription()));
        if (r.repsCell != null && r.reps != null) r.repsCell.setContentDescription(getString(R.string.lock_value_open_desc, r.reps.getContentDescription()));
        if (r.editor != null && r.editor.getVisibility() == View.VISIBLE) updateReset(r);
    }

    /** 원래대로 — 그 칸의 고른 값을 지운다(초안에서 원래 값과 같으면 지워진다 · LockState.setDraft) */
    private void resetField(Row r) {
        LockView v = last;
        if (v == null || !v.canAdjust) return;
        LockView.Member m = r.m;
        if (r.editingWeight) m.draftWeight = null;
        else m.draftReps = null;
        fillRowV(r);
        final String token = v.stepToken;
        final String setId = r.setId;
        final Double w = m.draftWeight != null ? m.draftWeight : m.weight;
        final Integer rp = m.draftReps != null ? m.draftReps : m.reps;
        final Context app = getApplicationContext();
        pendingEdits++;
        submitEdit(() -> LockHub.store(app).write(s -> s.setDraft(token, setId, w, rp)));
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
        fillRowV(r);
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
                // 제스처 시작 때 모드를 정한다 — 「앱에서 하기」면 평범한 클릭 · 완료면 UP 까지 이 리스너가 소비한다
                holdGesture = last != null && last.hasStep && last.screenCanComplete;
                if (!holdGesture) return false;
                if (guarded()) return true;
                b.setPressed(true);
                b.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
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
            // 누르던 세트가 그대로일 때만 — 그새 단계가 넘어갔으면 다른 세트를 완료하지 않는다(REV-022 안드로이드 M-2)
            if (v != null && v.screenCanComplete && v.stepToken.equals(holdToken)) {
                complete.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                act(LockActionReceiver.ACTION_COMPLETE, v.stepToken);
            }
        }
    };

    /** 길게 누르기 0.6초 — 시계로 잰다(애니메이션 배율과 무관 · REV-015 플랫폼 H-2) · 다 차면 완료(#3) */
    private void startHold() {
        stopHold();
        holdDownAt = SystemClock.uptimeMillis();
        holdToken = last == null ? null : last.stepToken;
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
        releaseHold();
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
