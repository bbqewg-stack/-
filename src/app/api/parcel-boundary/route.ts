import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng) return NextResponse.json(null);

  const key = process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (!key) return NextResponse.json(null);

  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${key}&geometry=true&attribute=true&crs=EPSG:4326&format=json&size=1&geomFilter=POINT(${lng}%20${lat})`;

  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  // Referer 있는 요청 먼저 시도, 실패 시 없이 재시도
  try {
    let res = await fetch(url, {
      headers: { Referer: `${protocol}://${host}` },
    });
    let data = await res.json();

    // VWorld 오류 시 Referer 없이 재시도
    if (data?.response?.status === "ERROR") {
      res = await fetch(url);
      data = await res.json();
    }

    const features = data?.response?.result?.featureCollection?.features;
    if (!features?.length) return NextResponse.json(null);

    const feature = features[0];
    return NextResponse.json({
      geometry: feature.geometry,
      properties: feature.properties,
    });
  } catch {
    return NextResponse.json(null);
  }
}
