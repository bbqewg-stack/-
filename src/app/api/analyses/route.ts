import { NextRequest, NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";

export async function GET() {
  await initDb();
  const result = await query(
    "SELECT * FROM analyses ORDER BY created_at DESC"
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  await initDb();
  const body = await request.json();
  const {
    name,
    area_m2,
    coordinates,
    coverage_ratio,
    panel_efficiency,
    capacity_kw,
    annual_generation_kwh,
  } = body;

  const result = await query(
    `INSERT INTO analyses (name, area_m2, coordinates, coverage_ratio, panel_efficiency, capacity_kw, annual_generation_kwh)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      name,
      area_m2,
      JSON.stringify(coordinates),
      coverage_ratio,
      panel_efficiency,
      capacity_kw,
      annual_generation_kwh,
    ]
  );

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
