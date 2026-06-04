import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  if (!lat || !lng) return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });

  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
    { headers: { Authorization: `KakaoAK ${restKey}` } }
  );
  const data = await res.json();

  if (!data.documents?.length) {
    return NextResponse.json({ road_address: null, address: null });
  }

  const doc = data.documents[0];
  return NextResponse.json({
    road_address: doc.road_address?.address_name ?? null,
    address: doc.address?.address_name ?? null,
  });
}
