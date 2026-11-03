package org.tarae.liftgram.update;

import androidx.core.content.FileProvider;

/**
 * 업데이트 전용 FileProvider(P2 보안 M-3) — `cacheDir/updates/` 만 덮는다(res/xml/update_paths.xml).
 * 공용 provider(`${applicationId}.fileprovider`)는 캐시 전체·외부 저장소를 덮어 다른 플러그인 몫이라 그대로 둔다.
 */
public class UpdateFileProvider extends FileProvider {
    static final String SUFFIX = ".updates";
}
