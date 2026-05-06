import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Cached once across all calls — prompt caching saves cost on repeated polls
const SYSTEM_PROMPT = `You are an email sentiment analyzer. Analyze the sentiment of the email provided and respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

The JSON object must have these fields:
- "sentiment": one of "positive", "negative", or "neutral"
- "score": a number from -1.0 (most negative) to 1.0 (most positive)
- "confidence": one of "high", "medium", or "low"
- "summary": a single sentence describing the email's tone
- "key_phrases": an array of up to 3 phrases that most influenced the sentiment`;

export async function analyzeSentiment(from, subject, body) {
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // system prompt cached across all polls
      },
    ],
    messages: [
      {
        role: 'user',
        content: `From: ${from}\nSubject: ${subject}\n\n${body}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
    return JSON.parse(text);
  } catch {
    return {
      sentiment: 'unknown',
      score: 0,
      confidence: 'low',
      summary: 'Could not parse Claude response.',
      key_phrases: [],
    };
  }
}
