import { Providers, initializeModel } from '@librechat/agents';
import type { ClientOptions } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent, TJapaneseAdvice, TJapaneseLearningProfile, TJapaneseLearningRegister } from 'librechat-data-provider';
import { japaneseAdviceSchema, japaneseLearningProfileSchema } from 'librechat-data-provider';
import type { ServerRequest, EndpointDbMethods } from '~/types';
import { getProviderConfig } from '~/endpoints/config/providers';
import { HumanMessage } from '@librechat/agents/langchain/messages';

export const JAPANESE_ADVICE_EVENT = 'japanese_advice';

const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;

/** The subset of the current chat's agent the advisor needs: its provider
 *  (SDK-level), endpoint (librechat.yaml entry holding credentials), and model. */
type AdvisorAgentContext = Pick<Agent, 'provider' | 'endpoint' | 'model' | 'model_parameters'>;

export type RunJapaneseAdvisorParams = {
  text: string;
  profile?: TJapaneseLearningProfile | null;
  signal?: AbortSignal;
  /** The main chat's request — carries `req.config` so the advisor resolves
   *  the same provider credentials the chat itself uses. */
  req?: ServerRequest;
  /** The main chat's initialized agent (from `client.options.agent`), or an
   *  equivalent `{ provider, endpoint, model }` context. */
  agent?: AdvisorAgentContext | null;
  /** Database methods for user-provided key resolution (inject `~/models`). */
  db?: EndpointDbMethods | null;
  /** Recent conversation turns before the learner message, oldest first.
   *  Context only — gives the advisor enough to disambiguate references
   *  (quotes, follow-ups) without pulling the advisor into the chat. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }> | null;
};

type AdvisorRequestContext = {
  req: ServerRequest;
  db: EndpointDbMethods;
};

function now(): string {
  return new Date().toISOString();
}

function getAgentModel(agent: AdvisorAgentContext): string {
  const model = agent.model ?? agent.model_parameters?.model ?? '';
  return model.replace(/^models\//, '');
}

/** Mirrors the title-generation flow: resolve the main agent's provider config
 *  through `getProviderConfig` + the provider's `getOptions`, so the advisor
 *  inherits the exact credentials (api key, base URL, headers, param
 *  transforms, user-provided keys) the chat itself uses. */
async function resolveClientOptions({
  agent,
  model,
  context,
}: {
  agent: AdvisorAgentContext;
  model: string;
  context: AdvisorRequestContext;
}): Promise<{ provider: string; model: string; clientOptions: ClientOptions }> {
  const { req, db } = context;
  const endpoint = agent.endpoint ?? agent.provider ?? EModelEndpoint.openAI;
  const providerConfig = getProviderConfig({ provider: endpoint, appConfig: req.config });

  const options = await providerConfig.getOptions({
    req,
    endpoint,
    model_parameters: { model },
    db,
  });

  let provider = options.provider ?? providerConfig.overrideProvider ?? agent.provider ?? endpoint;
  if (endpoint === EModelEndpoint.azureOpenAI) {
    const instanceName = (options.llmConfig as { azureOpenAIApiInstanceName?: string })
      .azureOpenAIApiInstanceName;
    if (instanceName == null) {
      provider = Providers.OPENAI;
    } else if (provider !== Providers.AZURE) {
      provider = Providers.AZURE;
    }
  }

  const clientOptions = {
    ...options.llmConfig,
    model,
    ...(options.configOptions != null
      ? { configuration: options.configOptions }
      : {}),
  } as ClientOptions;

  return { provider, model, clientOptions };
}

function getContentText(response: { content: unknown }): string {
  const { content } = response;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) =>
      part != null && typeof part === 'object' && typeof part.text === 'string' ? part.text : '',
    )
    .join('')
    .trim();
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

const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS_PER_TURN = 500;

function buildHistoryBlock(
  history?: Array<{ role: 'user' | 'assistant'; text: string }> | null,
): string[] {
  if (history == null || history.length === 0) {
    return [];
  }
  const turns = history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => {
      const role = turn.role === 'user' ? 'Learner' : 'Partner';
      return `${role}: ${turn.text.slice(0, MAX_HISTORY_CHARS_PER_TURN).replace(/\s+/g, ' ').trim()}`;
    })
    .filter((line) => line.length > `${'Learner'}: `.length);
  if (turns.length === 0) {
    return [];
  }
  return [
    'Recent conversation (context only, for understanding what the learner message refers to):',
    ...turns,
    'End of recent conversation.',
  ];
}

function buildPrompt(
  text: string,
  profile: TJapaneseLearningProfile,
  history?: Array<{ role: 'user' | 'assistant'; text: string }> | null,
): string {
  const learnerLevel = profile.learnerLevel ?? 'N5';
  const partnerRole = profile.partnerRole?.trim() || 'Japanese conversation partner';
  const register = normalizeRegister(profile.targetRegister);

  return [
    'You are a Japanese language advisor running outside the main chat context.',
    'Analyze only the learner message below. Do not answer the learner conversationally.',
    ...(history != null && history.length > 0
      ? [
          'The conversation history is reference material: use it to resolve references and quotations in the learner message, never to judge the partner\'s own Japanese or to change the register of the learner message.',
        ]
      : []),
    'Give feedback in English. Keep explanations concise and practical.',
    'If the sentence is natural for the target role/register, return status "ok" with a short summaryEnglish.',
    'If it is understandable but unnatural or incorrect, return status "needs_improvement".',
    'If the text cannot be checked as Japanese, return status "skipped".',
    buildRegisterInstruction(profile),
    `Learner level: ${learnerLevel}. Keep suggested Japanese near this level when reasonable.`,
    `Partner role: ${partnerRole}.`,
    `Normalized targetRegister field to return when applicable: ${register}.`,
    ...buildHistoryBlock(history),
    'Return JSON only with this shape:',
    '{"status":"ok|needs_improvement|skipped","targetRegister":"auto|casual|polite|formal","correctedJapanese":"...","naturalJapanese":"...","summaryEnglish":"...","issues":[{"original":"...","suggestion":"...","explanationEnglish":"...","severity":"minor|major"}]}',
    'Learner message:',
    text.slice(0, 4000),
  ].join('\n');
}

async function runAdvisor({
  text,
  profile,
  history,
  signal,
  provider,
  model,
  clientOptions,
}: {
  text: string;
  profile: TJapaneseLearningProfile;
  history?: Array<{ role: 'user' | 'assistant'; text: string }> | null;
  signal?: AbortSignal;
  provider: string;
  model: string;
  clientOptions: ClientOptions;
}): Promise<TJapaneseAdvice> {
  const llm = initializeModel({
    provider: provider as Providers,
    // Streaming is useless for a one-shot JSON verdict and breaks against
    // endpoints whose stream framing differs from the OpenAI SDK's.
    // Low temperature keeps the JSON verdicts deterministic regardless of the
    // endpoint's creative defaults.
    clientOptions: { ...clientOptions, streaming: false, temperature: 0.1 },
  });

  const response = await llm
    .withConfig({ runName: 'JapaneseAdvisor' })
    .invoke([new HumanMessage(buildPrompt(text, profile, history))], { signal });

  const responseText = getContentText(response);
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

/** Runs the Japanese advisor against the main chat's provider: same
 *  credentials, same endpoint transforms, and the currently selected chat
 *  model (unless `profile.advisorModel` explicitly overrides it). */
export async function runJapaneseAdvisor({
  text,
  profile: rawProfile,
  signal,
  req,
  agent,
  db,
  history,
}: RunJapaneseAdvisorParams): Promise<TJapaneseAdvice> {
  const profile = normalizeProfile(rawProfile);
  const skipped = shouldSkip(text, profile);
  if (skipped) {
    return skipped;
  }

  if (req == null || agent == null || db == null) {
    return {
      status: 'skipped',
      summaryEnglish:
        'Japanese advisor is enabled, but the main chat provider context is unavailable.',
      checkedAt: now(),
    };
  }

  const fallbackModel = getAgentModel(agent);
  if (!fallbackModel) {
    return {
      status: 'error',
      summaryEnglish: 'The advisor request failed.',
      error: 'No model is associated with the current conversation.',
      checkedAt: now(),
    };
  }
  const model = profile.advisorModel?.trim().replace(/^models\//, '') || fallbackModel;

  try {
    const { provider, clientOptions } = await resolveClientOptions({
      agent,
      model,
      context: { req, db },
    });

    return await runAdvisor({ text, profile, history, signal, provider, model, clientOptions });
  } catch (error) {
    if (signal?.aborted === true || (error instanceof Error && error.name === 'AbortError')) {
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
