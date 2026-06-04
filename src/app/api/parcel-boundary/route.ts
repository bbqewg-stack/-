import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng) return NextResponse.json(null);

  const key = process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (!key) return NextResponse.json(null);

  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${key}&geometry=true&attribute=true&crs=EPSG:4326&format=json&size=1&geomFilter=POINT(${lng}%20${lat})`;

  try {
    const res = await fetch(url, {
      headers: {
        Referer: "https://nu-three-96.vercel.app",
        Origin: "https://nu-three-96.vercel.app",
      },
    });

    const text = await res.text();

    // HTML 응답이면 오류 상세 반환 (디버깅용)
    if (text.trim().startsWith("<")) {
      return NextResponse.json({ error: "vworld_html", preview: text.slice(0, 200) });
    }

    const data = JSON.parse(text);
    const features = data?.response?.result?.featureCollection?.features;

    if (!features?.length) {
      return NextResponse.json({ debug: data?.response });
    }

    const feature = features[0];
    return NextResponse.json({
      geometry: feature.geometry,
      properties: feature.properties,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
