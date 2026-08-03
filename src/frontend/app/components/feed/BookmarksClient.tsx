"use client";
// @plm SRS-007  저장한 게시물 — **나만 본다**
//
// 그새 못 보게 된 글(비공개로 바뀌었거나 차단이 생긴 경우)은 목록에서 빠진다.
// 저장은 열람권이 아니다 — 저장해 뒀다는 이유로 계속 보이면 공개범위가 무의미해진다.
import { useCallback } from "react";
import type { Cursor } from "@app/contracts";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { PostListScreen } from "./PostListScreen";

export default function BookmarksClient() {
  const fetchPage = useCallback(async (cursor?: Cursor) => {
    const res = await feedClient().listBookmarks({ cursor });
    return { posts: res.posts, nextCursor: res.nextCursor };
  }, []);

  return (
    <PostListScreen
      title={t("bookmark.title")}
      fetchPage={fetchPage}
      emptyIcon="bookmark-outline"
      emptyTitle="bookmark.empty"
      emptyMessage="bookmark.emptyMessage"
      testId="bookmark-list"
    />
  );
}
