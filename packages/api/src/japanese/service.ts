import fetch from 'node-fetch';
import { logger } from '@librechat/data-schemas';
import { japaneseAdviceSchema, japaneseLearningProfileSchema } from 'librechat-data-provider';
import type {
  TJapaneseAdvice,
  TJapaneseLearningProfile,
  TJapaneseLearningRegister,
} from 'librechat-data-provider';

export const JAPANESE_ADVICE_EVENT = 'japanese_advice';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_OPENAI_COMPATIBLE_MODEL = 'gpt-5.5';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CHAT_COMPLETIONS_PATH = '/chat/completions';
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;

type GeminiPart = {
  text?: string;
};

type GeminiContent = {
  parts?: GeminiPart[];
};

type GeminiCandidate = {
  content?: GeminiContent;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

type ChatCompletionContentPart = {
  text?: string;
};

type ChatCompletionMessage = {
  content?: string | ChatCompletionContentPart[];
};

type ChatCompletionChoice = {
  message?: ChatCompletionMessage;
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
};

export type RunJapaneseAdvisorParams = {
  text: string;
  profile?: TJapaneseLearningProfile | null;
  signal?: AbortSignal;
};

function now(): string {
  return new Date().toISOString();
}

function getConfiguredValue(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value !== 'user_provided') {
      return value;
    }
  }
  return undefined;
}

function getGeminiApiKey(): string | undefined {
  return getConfiguredValue(['GEMINI_API_KEY', 'GOOGLE_KEY']);
}

function getChatCompletionApiKey(): string | undefined {
  return getConfiguredValue(['JAPANESE_ADVISOR_API_KEY', 'MENCI_COPILOT_API_KEY']);
}

function getChatCompletionUrl(): string | undefined {
  const baseURL = getConfiguredValue(['JAPANESE_ADVISOR_BASE_URL', 'MENCI_COPILOT_BASE_URL']);
  if (!baseURL) {
    return undefined;
  }
  const normalized = baseURL.replace(/\/+$/, '');
  if (normalized.endsWith(CHAT_COMPLETIONS_PATH)) {
    return normalized;
  }
  return `${normalized}${CHAT_COMPLETIONS_PATH}`;
}

function getModel(profile: TJapaneseLearningProfile, defaultModel: string): string {
  const model = profile.advisorModel?.trim() || process.env.JAPANESE_ADVISOR_MODEL || defaultModel;
  return model.replace(/^models\//, '');
}

function normalizeProfile(profile?: TJapaneseLearningProfile | null): TJapaneseLearningProfile {
  const parsed = japaneseLearningProfileSchema.safeParse(profile ?? {});
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

function normalizeRegister(register?: TJapaneseLearningRegister): TJapaneseLearningRegister {
  return register ?? 'auto';
}

function shouldSkip(text: string, profile: TJapaneseLearningProfile): TJapaneseAdvice | null {
  if (profile.enabled !== true || profile.advisorEnabled === false) {
    return {
      status: 'skipped',
      checkedAt: now(),
    };
  }

  if (!JAPANESE_TEXT_PATTERN.test(text)) {
    return {
      status: 'skipped',
      summaryEnglish: 'No Japanese text was detected.',
      checkedAt: now(),
    };
  }

  return null;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseAdvice(value: string, model: string): TJapaneseAdvice {
  try {
    const parsedJson = JSON.parse(stripJsonFence(value)) as unknown;
    const parsedAdvice = japaneseAdviceSchema.safeParse(parsedJson);
    if (!parsedAdvice.success) {
      return {
        status: 'error',
        summaryEnglish: 'The advisor returned an invalid response.',
        error: parsedAdvice.error.message,
        checkedAt: now(),
        model,
      };
    }

    return {
      ...parsedAdvice.data,
      checkedAt: parsedAdvice.data.checkedAt ?? now(),
      model: parsedAdvice.data.model ?? model,
    };
  } catch (error) {
    return {
      status: 'error',
      summaryEnglish: 'The advisor response could not be parsed.',
      error: error instanceof Error ? error.message : 'Unknown parse error',
      checkedAt: now(),
      model,
    };
  }
}

function buildRegisterInstruction(profile: TJapaneseLearningProfile): string {
  const register = normalizeRegister(profile.targetRegister);
  if (register === 'casual') {
    return 'Target register: casual Japanese for a familiar friend. Flag wording that is too formal or stiff.';
  }
  if (register === 'polite') {
    return 'Target register: polite conversational Japanese using desu/masu naturally.';
  }
  if (register === 'formal') {
    return 'Target register: formal Japanese suitable for a supervisor, mentor, or senior club advisor.';
  }
  return 'Target register: infer from the partner role. A close friend role should prefer casual speech; a supervisor or mentor role should prefer polite or formal speech.';
}

function buildPrompt(text: string, profile: TJapaneseLearningProfile): string {
  const learnerLevel = profile.learnerLevel ?? 'N5';
  const partnerRole = profile.partnerRole?.trim() || 'Japanese conversation partner';
  const register = normalizeRegister(profile.targetRegister);

  return [
    'You are a Japanese language advisor running outside the main chat context.',
    'Analyze only the learner message below. Do not answer the learner conversationally.',
    'Give feedback in English. Keep explanations concise and practical.',
    'If the sentence is natural for the target role/register, return status "ok" with a short summaryEnglish.',
    'If it is understandable but unnatural or incorrect, return status "needs_improvement".',
    'If the text cannot be checked as Japanese, return status "skipped".',
    buildRegisterInstruction(profile),
    `Learner level: ${learnerLevel}. Keep suggested Japanese near this level when reasonable.`,
    `Partner role: ${partnerRole}.`,
    `Normalized targetRegister field to return when applicable: ${register}.`,
    'Return JSON only with this shape:',
    '{"status":"ok|needs_improvement|skipped","targetRegister":"auto|casual|polite|formal","correctedJapanese":"...","naturalJapanese":"...","summaryEnglish":"...","issues":[{"original":"...","suggestion":"...","explanationEnglish":"...","severity":"minor|major"}]}',
    'Learner message:',
    text.slice(0, 4000),
  ].join('\n');
}

function getResponseText(response: GeminiResponse): string {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''
  );
}

function getChatCompletionResponseText(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

async function runGeminiAdvisor({
  text,
  profile,
  signal,
  apiKey,
  model,
}: RunJapaneseAdvisorParams & {
  profile: TJapaneseLearningProfile;
  apiKey: string;
  model: string;
}): Promise<TJapaneseAdvice> {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(text, profile) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn('[JapaneseAdvisor] Gemini request failed', {
      status: res.status,
      body: body.slice(0, 500),
    });
    return {
      status: 'error',
      summaryEnglish: 'The advisor request failed.',
      error: `Gemini API returned ${res.status}`,
      checkedAt: now(),
      model,
    };
  }

  const json = (await res.json()) as GeminiResponse;
  const responseText = getResponseText(json);
  if (!responseText) {
    return {
      status: 'error',
      summaryEnglish: 'The advisor returned an empty response.',
      checkedAt: now(),
      model,
    };
  }

  return parseAdvice(responseText, model);
}

async function runChatCompletionAdvisor({
  text,
  profile,
  signal,
  apiKey,
  url,
  model,
}: RunJapaneseAdvisorParams & {
  profile: TJapaneseLearningProfile;
  apiKey: string;
  url: string;
  model: string;
}): Promise<TJapaneseAdvice> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: buildPrompt(text, profile),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn('[JapaneseAdvisor] Chat completions request failed', {
      status: res.status,
      body: body.slice(0, 500),
    });
    return {
      status: 'error',
      summaryEnglish: 'The advisor request failed.',
      error: `Chat completions API returned ${res.status}`,
      checkedAt: now(),
      model,
    };
  }

  const json = (await res.json()) as ChatCompletionResponse;
  const responseText = getChatCompletionResponseText(json);
  if (!responseText) {
    return {
      status: 'error',
      summaryEnglish: 'The advisor returned an empty response.',
      checkedAt: now(),
      model,
    };
  }

  return parseAdvice(responseText, model);
}

export async function runJapaneseAdvisor({
  text,
  profile: rawProfile,
  signal,
}: RunJapaneseAdvisorParams): Promise<TJapaneseAdvice> {
  const profile = normalizeProfile(rawProfile);
  const skipped = shouldSkip(text, profile);
  if (skipped) {
    return skipped;
  }

  const chatCompletionApiKey = getChatCompletionApiKey();
  const chatCompletionUrl = getChatCompletionUrl();
  const useChatCompletions = !!chatCompletionApiKey && !!chatCompletionUrl;
  const model = getModel(
    profile,
    useChatCompletions ? DEFAULT_OPENAI_COMPATIBLE_MODEL : DEFAULT_GEMINI_MODEL,
  );

  const geminiApiKey = getGeminiApiKey();
  if (!useChatCompletions && !geminiApiKey) {
    return {
      status: 'skipped',
      summaryEnglish:
        'Japanese advisor is enabled, but no advisor API key is configured on the server.',
      checkedAt: now(),
      model,
    };
  }

  try {
    if (useChatCompletions) {
      return await runChatCompletionAdvisor({
        text,
        profile,
        signal,
        apiKey: chatCompletionApiKey,
        url: chatCompletionUrl,
        model,
      });
    }

    return await runGeminiAdvisor({
      text,
      profile,
      signal,
      apiKey: geminiApiKey,
      model,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'skipped',
        summaryEnglish: 'The advisor request was cancelled.',
        checkedAt: now(),
        model,
      };
    }

    logger.error('[JapaneseAdvisor] Request failed', error);
    return {
      status: 'error',
      summaryEnglish: 'The advisor request failed.',
      error: error instanceof Error ? error.message : 'Unknown advisor error',
      checkedAt: now(),
      model,
    };
  }
}
