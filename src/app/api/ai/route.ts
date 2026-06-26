import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { requireAuth } from "@/lib/auth/authorization";
import { parseJsonSafely, aiRequestSchema } from "@/lib/validation/schemas";

const PROMPTS = {
  summarize:
    "Summarize the following document concisely in 2-3 paragraphs. Preserve key points.",
  improve:
    "Improve the writing quality of the following text. Fix grammar, clarity, and flow. Return only the improved text.",
  continue:
    "Continue writing naturally from where this document leaves off. Match the tone and style. Add 1-2 paragraphs.",
  tone: (t: string) =>
    `Rewrite the following text in a ${t} tone. Return only the rewritten text.`,
};

export async function POST(request: Request) {
  const user = await requireAuth().catch((r) => r);
  if (user instanceof Response) return user;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "AI features require OPENAI_API_KEY",
        fallback: true,
      },
      { status: 503 }
    );
  }

  const body = await request.text();
  const parsed = parseJsonSafely(body, aiRequestSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { action, content, tone } = parsed.data;

  const systemPrompt =
    action === "tone" && tone
      ? PROMPTS.tone(tone)
      : PROMPTS[action as keyof typeof PROMPTS];

  const prompt =
    typeof systemPrompt === "function"
      ? systemPrompt(tone ?? "professional")
      : systemPrompt;

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: prompt,
      prompt: content,
      maxOutputTokens: 1500,
    });

    return NextResponse.json({ result: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
