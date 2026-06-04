import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng) return NextResponse.json(null);

  const key = process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (!key) return NextResponse.json({ error: "no key" });

  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${key}&geometry=true&attribute=true&crs=EPSG:4326&format=json&size=1&geomFilter=POINT(${lng}%20${lat})`;

  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  try {
    const res = await fetch(url, {
      headers: { Referer: `${protocol}://${host}` },
    });
    const data = await res.json();

    console.log("[parcel-boundary] VWorld response:", JSON.stringify(data?.response?.status), JSON.stringify(data?.response?.error));

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
