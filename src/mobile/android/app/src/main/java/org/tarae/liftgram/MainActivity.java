package org.tarae.liftgram;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.tarae.liftgram.lock.LiftgramLockPlugin;
import org.tarae.liftgram.update.LiftgramUpdatePlugin;

// 앱 시작 화면 — 매니페스트의 .MainActivity(org.tarae.liftgram 기준)가 이 클래스를 찾는다.
// 빠져 있으면 아이콘을 눌러도 곧바로 꺼진다(ClassNotFoundException · 2026-11-03 실기기에서 발견).
// 플러그인(@capacitor/* · liftgram-native)은 cap sync 가 capacitor.plugins.json 으로 자동 등록한다.
// [원본] public class MainActivity extends BridgeActivity {}
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 잠금화면 운동 카드 다리(SPEC-017 Phase 4) — 앱 모듈 안 플러그인이라 cap sync 자동 등록 대상이 아니다 → super 전에 직접 등록
        registerPlugin(LiftgramLockPlugin.class);
        // 앱 설치 파일 업데이트 다리(SPEC-018 Phase 2) — 같은 이유로 직접 등록
        registerPlugin(LiftgramUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // [개선] 웹 화면이 첫 그림을 그리기 전(또는 스플래시 상한 6초가 지난 뒤) 흰 웹뷰가 보이지 않게
        // 앱 바탕색으로 칠한다 — values / values-night 의 splash_bg(라이트·다크). SPEC-017 Phase 1 · REV-003 N-2.
        // capacitor.config 의 backgroundColor 는 색 하나뿐이라 다크 모드에서 번쩍인다 → 리소스로 고른다.
        paintWebViewBackground();
    }

    // 매니페스트 configChanges 에 uiMode 가 있어 다크 모드를 바꿔도 액티비티가 다시 만들어지지 않는다 →
    // 웹뷰 바탕을 새 모드 색으로 다시 칠한다(REV-004 안드로이드 L-5).
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        paintWebViewBackground();
    }

    private void paintWebViewBackground() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.splash_bg));
        }
    }
}
