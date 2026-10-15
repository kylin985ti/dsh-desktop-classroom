/**
 * Bounded auxiliary suggestion generation: transcript framing, secret
 * redaction, route resolution, deadline-fused LLM dispatch, and output
 * sanitization. Generation is PURE with respect to durability: it returns the
 * suggestion payload and the caller persists it through the plugin's own
 * storage domain (see ./records.ts). Nothing is ever written to the session
 * log — that is what made sessions unreadable (issue #4).
 * @module @studyzy/dsh-suggest-prompt/generate
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { SuggestPromptStorageRecord } from './domain.ts';
import type { SuggestPromptTranscriptState } from './types.ts';
import type { Config } from './index.ts';
/** Capability-owned timeout reason code for auxiliary suggestion requests. */
export declare const SUGGEST_PROMPT_TIMEOUT_CODE = "SUGGEST_PROMPT_TIMEOUT";
/** Validated immutable suggestion policy. */
export interface ResolvedSuggestPromptConfig extends Config {
}
/**
 * Validate and detach the required suggestion policy.
 * @param config - untrusted plugin configuration.
 * @returns immutable policy with optional route absence preserved.
 */
export declare function resolveSuggestPromptConfig(config: Config): ResolvedSuggestPromptConfig;
/**
 * Stable instruction for the suggestion extraction call. The model is bound to
 * predicting the user's next prompt in the user's own voice, forbidden from
 * generating content or meta-text; `language` constrains the reply language to
 * match the conversation.
 * @param maxSuggestionChars - visible-character cap baked into the instruction.
 * @param language - reply language ("简体中文" for CJK conversations, else "English").
 */
export declare function systemPrompt(maxSuggestionChars: number, language: string): string;
/** Pick the reply language to match the user's last prompt (CJK → 简体中文). */
export declare function suggestionLanguage(pairs: readonly TranscriptPair[]): string;
/** One redacted user/assistant exchange line ready for framing. */
export interface TranscriptPair {
    readonly role: 'user' | 'assistant';
    readonly text: string;
}
/** The bounded transcript handed to the model, plus its log attribution. */
export interface Transcript {
    readonly pairs: readonly TranscriptPair[];
    readonly sourceMessageSeqs: readonly number[];
    readonly baseSeq: number;
}
/**
 * Build the model-visible transcript from the retained fold state: user and
 * assistant pairs of the last `maxRecentTurns` completed turns (default 1 —
 * only the last completed turn's user input and assistant final answer),
 * tail-trimmed to `maxTranscriptChars`.
 *
 * The state arrives pre-redacted and pre-filtered from
 * `applyTranscriptProjection`; this function only bounds the window and the
 * character budget. Reading fold state — rather than scanning session history
 * — is what keeps the plugin clear of the deprecated synchronous history
 * readers.
 * @param state - the retained `suggestPromptTranscript` fold state.
 * @param maxRecentTurns - completed-turn tail to include (1 keeps only the last turn).
 * @param maxTranscriptChars - character budget for the kept tail.
 * @returns the bounded transcript, or `undefined` when the window holds no text.
 */
export declare function buildTranscript(state: SuggestPromptTranscriptState, maxRecentTurns: number, maxTranscriptChars: number): Transcript | undefined;
/**
 * Generate one suggestion for a completed turn through the shared auxiliary
 * LLM call.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated suggestion policy.
 * @param session - owning session log.
 * @param turn - completed turn whose completion this suggestion answers.
 * @param signal - cancellation forwarded to the auxiliary call.
 * @returns the generated suggestion payload, or `undefined` when the model
 * produced no usable suggestion (an empty or semantically rejectable reply —
 * the system prompt tells it to reply with nothing when the next step is not
 * obvious). Genuine failures throw. Persisting the result is the caller's job.
 */
export declare function generateSuggestion(ctx: Context, config: ResolvedSuggestPromptConfig, session: Session, turn: number, transcriptState: SuggestPromptTranscriptState, signal: AbortSignal): Promise<SuggestPromptStorageRecord | undefined>;
//# sourceMappingURL=generate.d.ts.map