"use client";
// @plm SRS-018  해시태그 — 그 태그가 달린 공개 글만 모아 본다
//
// 팔로워 전용·비공개 글은 여기 오지 않는다(서버가 거른다). 태그로 남의 비공개가 새 나가면
// "비공개"라는 말이 거짓이 되기 때문이다.
import { useCallback } from "react";
import type { Cursor } from "@app/contracts";
import { feedClient } from "@/lib/feedClient";
import { PostListScreen } from "./PostListScreen";

export default function HashtagClient({ tag }: { tag: string }) {
  const fetchPage = useCallback(
    async (cursor?: Cursor) => {
      const res = await feedClient().listHashtagPosts({ tag, cursor });
      return { posts: res.posts, nextCursor: res.nextCursor };
    },
    [tag],
  );

  return (
    <PostListScreen
      title={`#${tag}`}
      fetchPage={fetchPage}
      emptyIcon="pricetag-outline"
      emptyTitle="hashtag.empty"
      emptyMessage="hashtag.emptyMessage"
      testId="hashtag-list"
    />
  );
}
