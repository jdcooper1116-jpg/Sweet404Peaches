import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.LOTTERY_ENGINE_URL;

export async function POST(req: NextRequest) {
  try {
    if (!ENGINE_URL) {
      return NextResponse.json(
        { error: "LOTTERY_ENGINE_URL is not configured." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const response = await fetch(`${ENGINE_URL}/backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: "Lottery engine returned non-JSON response.",
          raw: text,
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Lottery engine request failed.",
          status: response.status,
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected backtest bridge failure.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
