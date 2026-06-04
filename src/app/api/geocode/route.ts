import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json([]);

  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  // 도로명/지번 주소 검색
  const addrRes = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`,
    { headers: { Authorization: `KakaoAK ${restKey}` } }
  );
  const addrData = await addrRes.json();

  // 결과 없으면 키워드 검색으로 fallback
  if (!addrData.documents?.length) {
    const kwRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`,
      { headers: { Authorization: `KakaoAK ${restKey}` } }
    );
    const kwData = await kwRes.json();
    return NextResponse.json(
      (kwData.documents || []).map((d: any) => ({
        display_name: d.place_name + (d.road_address_name ? ` (${d.road_address_name})` : ""),
        lat: d.y,
        lon: d.x,
      }))
    );
  }

  return NextResponse.json(
    addrData.documents.map((d: any) => ({
      display_name: d.address_name,
      lat: d.y,
      lon: d.x,
    }))
  );
}
