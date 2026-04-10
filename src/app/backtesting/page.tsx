"use client";

import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import PageIntro from "@/components/ui/PageIntro";

type BacktestHit = {
  candidate: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  match_type: string;
  is_verified?: boolean;
  source_name?: string;
};

type BacktestResponse = {
  hit_count: number;
  hit_dates: string[];
  hit_draw_times: string[];
  summary: string;
  hits: BacktestHit[];
};

const cards = [
  {
    href: "/forecast-board",
    title: "Forecast Board",
    description: "Review active forecast signals and recommendation snapshots.",
  },
  {
    href: "/chat",
    title: "Intelligence Chat",
    description: "Explore live reasoning, evidence, and forecasting notes.",
  },
];

export default function BacktestingPortalPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResponse | null>(null);

  async function runTestBacktest() {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await fetch("/api/backtest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: "GA",
          game_type: "pick3",
          anchor_date: "2024-01-25",
          lookahead_days: 7,
          candidates: ["297", "716", "999"],
          label: "test dream window",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Backtest request failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        background:
          "radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)",
      }}
    >
      <Sidebar />

      <section style={{ padding: "32px", display: "grid", gap: "24px" }}>
        <PageIntro
          title="Backtesting Portal"
          description="Historical replay, evidence tracking, and research workflows that teach the live system what to strengthen."
          actions={[
            { href: "/forecast-board", label: "Forecast Board" },
            { href: "/chat", label: "Intelligence Chat" },
          ]}
        />

        <section
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="journal-card"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "grid",
                gap: "10px",
              }}
            >
              <h2 style={{ margin: 0 }}>{card.title}</h2>
              <p
                style={{
                  margin: 0,
                  color: "var(--ink-light)",
                  lineHeight: 1.6,
                }}
              >
                {card.description}
              </p>
            </Link>
          ))}
        </section>

        <section
          className="journal-card"
          style={{
            padding: "20px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 8px 0" }}>Lottery Engine Bridge Test</h2>
            <p style={{ margin: 0, color: "var(--ink-light)", lineHeight: 1.6 }}>
              This sends a real request from Sweet404Peaches to the lottery-engine
              backtest API through <code>/api/backtest</code>.
            </p>
          </div>

          <div>
            <button
              onClick={runTestBacktest}
              disabled={loading}
              style={{
                padding: "12px 18px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: loading ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Running Backtest..." : "Run Test Backtest"}
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(255, 90, 90, 0.12)",
                border: "1px solid rgba(255, 90, 90, 0.35)",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && (
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <h3 style={{ margin: "0 0 8px 0" }}>Summary</h3>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{result.summary}</p>
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                <div><strong>Hit count:</strong> {result.hit_count}</div>
                <div><strong>Hit dates:</strong> {result.hit_dates.join(", ") || "None"}</div>
                <div><strong>Hit draw times:</strong> {result.hit_draw_times.join(", ") || "None"}</div>
              </div>

              <div>
                <h3 style={{ margin: "0 0 8px 0" }}>Hits</h3>
                {result.hits.length === 0 ? (
                  <p style={{ margin: 0 }}>No hits found.</p>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {result.hits.map((hit, index) => (
                      <div
                        key={`${hit.candidate}-${hit.draw_date}-${hit.draw_time}-${index}`}
                        style={{
                          padding: "12px",
                          borderRadius: "12px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <div><strong>Candidate:</strong> {hit.candidate}</div>
                        <div><strong>Date:</strong> {hit.draw_date}</div>
                        <div><strong>Draw time:</strong> {hit.draw_time}</div>
                        <div><strong>Winning number:</strong> {hit.winning_number}</div>
                        <div><strong>Match type:</strong> {hit.match_type}</div>
                        <div><strong>Source:</strong> {hit.source_name || "Unknown"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
