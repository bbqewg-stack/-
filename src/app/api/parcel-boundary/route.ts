import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const preferredRegion = ["icn1"]; // Seoul

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng) return NextResponse.json(null);

  const key = process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (!key) return NextResponse.json(null);

  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${key}&geometry=true&attribute=true&crs=EPSG:4326&format=json&size=1&geomFilter=POINT(${lng}%20${lat})`;

  try {
    const res = await fetch(url, {
      headers: { Referer: "https://nu-three-96.vercel.app" },
    });
    const data = await res.json();
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
