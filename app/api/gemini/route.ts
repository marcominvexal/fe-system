import { NextRequest, NextResponse } from "next/server";

// Server-side Gemini proxy — API key never leaves the server.
// Client calls POST /api/gemini with { notes, task }.

export async function POST(req: NextRequest) {
  const { notes, task } = await req.json() as {
    notes: string;
    task: {
      title: string;
      customer: string;
      location: string;
      maintenanceType: string;
      serviceLevel: string;
    };
  };

  const apiKey = process.env.GEMINI_API_KEY ?? "";

  // ── Mock mode (no key set) ─────────────────────────────────────────────────
  if (!apiKey) {
    const mock =
      `**Work Performed**\n` +
      `${notes || "Site visit carried out per scheduled maintenance plan."}\n\n` +
      `**Findings**\n` +
      `All network equipment inspected. Signal levels within acceptable thresholds. ` +
      `No critical faults identified. Minor wear noted on patch panels.\n\n` +
      `**Recommendations**\n` +
      `Schedule follow-up inspection in 6–12 months. ` +
      `Update CMDB records for this site. Customer advised of SLA terms under ${task.serviceLevel}.`;
    return NextResponse.json({ text: mock });
  }

  // ── Live Gemini call ───────────────────────────────────────────────────────
  const prompt =
    `You are a professional field service engineer for Orange Business telecom. ` +
    `Convert the following raw work notes into a structured site visit report.\n\n` +
    `Task: ${task.title}\n` +
    `Customer: ${task.customer}\n` +
    `Location: ${task.location}\n` +
    `Work Type: ${task.maintenanceType}\n` +
    `SLA: ${task.serviceLevel}\n\n` +
    `Raw Notes:\n${notes}\n\n` +
    `Format the report with three short sections:\n` +
    `**Work Performed** — what was done\n` +
    `**Findings** — observations and condition of equipment\n` +
    `**Recommendations** — next steps or follow-up actions\n\n` +
    `Keep it professional, concise, and factual. Use telecom terminology.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json(
        { error: err?.error?.message ?? `Gemini error: ${geminiRes.status}` },
        { status: geminiRes.status }
      );
    }

    const data = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
