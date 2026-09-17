export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export async function createOpenAIChatCompletion(input: {
  model: string;
  temperature: number;
  messages: OpenAIChatMessage[];
  jsonMode?: boolean;
}): Promise<OpenAIChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  let response: Response | null = null;
  let lastError: unknown;
  const requestDeadline = AbortSignal.timeout(90_000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: requestDeadline,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature,
          ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: input.messages,
        }),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) {
        throw new Error(
          `OpenAI connection failed after 3 attempts: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (!response) throw lastError instanceof Error ? lastError : new Error("OpenAI request did not return a response.");
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI chat completion failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  return (await response.json()) as OpenAIChatResponse;
}
