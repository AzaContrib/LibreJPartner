import type { TSubagentThreadLineage, TJapaneseLearningProfile } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';
import type { ICompactionSemanticIndexProjection } from './compaction';

export const MAX_AGENT_EVENT_ACTOR_SKILLS = 64;
export const MAX_AGENT_EVENT_ACTOR_DISCOVERED_TOOLS = 128;
export const MAX_AGENT_EVENT_ACTOR_TOOL_NAME_LENGTH = 512;
export const MAX_AGENT_EVENT_ACTOR_SUMMARY_LENGTH = 1_000_000;
export const MAX_AGENT_EVENT_ACTOR_ENCODING_LENGTH = 128;

export interface ISubagentThreadLease {
  token: string;
  taskId: string;
  expiresAt: Date;
}

/** Server-private route from one authenticated event source to a child actor thread. */
export interface IAgentEventBinding {
  bindingId: string;
  sourceKeyId: string;
  actorId: string;
}

export interface IAgentEventActorCheckpoint {
  threadId: string;
  checkpointId: string;
  checkpointNs: string;
}

export interface IAgentEventActorContextFingerprint {
  algorithm: 'sha256';
  version: number;
  digest: string;
}

export interface IAgentEventActorSkillIdentity {
  id: string;
  name: string;
  version: number;
  contentDigest?: string;
}


// @ts-ignore
export interface IConversation extends Document {
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  isTemporary?: boolean;
  // Fields provided by conversationPreset (adjust types as needed)
  endpoint?: string;
  endpointType?: string;
  model?: string;
  region?: string;
  chatGptLabel?: string;
  examples?: unknown[];
  modelLabel?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  maxTokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  file_ids?: string[];
  resendImages?: boolean;
  promptCache?: boolean;
  promptCacheTtl?: '5m' | '1h';
  thinking?: boolean;
  thinkingBudget?: number;
  effort?: string;
  system?: string;
  resendFiles?: boolean;
  imageDetail?: string;
  agent_id?: string;
  subagentThread?: TSubagentThreadLineage;
  /** Internal execution fence. Excluded from ordinary conversation reads. */
  subagentThreadLease?: ISubagentThreadLease;
  /** Internal event-source identity. Excluded from ordinary conversation reads. */
  agentEventBinding?: IAgentEventBinding;
  /** Internal event-actor checkpoint head. Excluded from ordinary conversation reads. */
  agentEventActor?: IAgentEventActorState;
  /** Private invocation proof: active lifecycle fences plus settled same-ID receipts. */
  agentEventActorReconciliations?: IAgentEventActorReconciliation[];
  /** Private invalidation epoch; see {@link IAgentEventActorSnapshot.epoch}. */
  agentEventActorEpoch?: number;
  /** Private in-flight legacy-turn fence; see {@link IAgentEventActorLegacyTurn}. */
  agentEventActorLegacyTurn?: IAgentEventActorLegacyTurn;
  /** Private current suspended invocation; see {@link IAgentEventActorSuspension}. */
  agentEventActorSuspension?: IAgentEventActorSuspension;
  assistant_id?: string;
  instructions?: string;
  stop?: string[];
  isArchived?: boolean;
  /** Set when archived, cleared on unarchive; absent on chats archived before it existed. */
  archivedAt?: Date | null;
  pinned?: boolean;
  /** Derived per request from the shared-links collection; never persisted on the conversation. */
  isShared?: boolean;
  iconURL?: string;
  greeting?: string;
  spec?: string;
  tags?: string[];
  chatProjectId?: string | null;
  tools?: string[];
  maxContextTokens?: number;
  max_tokens?: number;
  reasoning_effort?: string;
  reasoning_summary?: string;
  reasoning_mode?: string;
  reasoning_context?: string;
  verbosity?: string;
  useResponsesApi?: boolean;
  web_search?: boolean;
  url_context?: boolean;
  disableStreaming?: boolean;
  fileTokenLimit?: number;
  japaneseLearning?: TJapaneseLearningProfile;
  // Additional fields
  files?: string[];
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
