import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const res = await fetch(
    `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}`,
    { cache: "force-cache" }
  );
  const content = await res.text();
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
