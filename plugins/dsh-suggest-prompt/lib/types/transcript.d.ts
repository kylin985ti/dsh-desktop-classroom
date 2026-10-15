/**
 * Host-only transcript fold for the suggest-prompt capability.
 *
 * `dsh >= 0.2.0` deprecates synchronous reads of arbitrary Session event
 * history (`Session.events`, `eventAt`, `snapshotEvents`, `ownEvents`) for new
 * production callers, and forbids new wrappers that reintroduce that
 * dependency. This module therefore reconstructs the model-visible transcript
 * the way the framework directs — as projection state maintained
 * incrementally from newly committed events — instead of scanning the log at
 * generation time.
 *
 * The fold retains only what suggestion generation reads: the newest
 * completed turn, the turn-start seq that bounds it, and the redacted
 * user/assistant pairs inside the window. Everything else (tool calls,
 * reasoning, intermediate assistant steps, harness-injected context) is
 * dropped at fold time, which also keeps the retained state small on a long
 * session.
 * @module @studyzy/dsh-suggest-prompt/transcript
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { SuggestPromptTranscriptState } from './types.ts';
/**
 * Retained-turn window for the fold. The transcript builder only ever reads
 * the last `maxRecentTurns` completed turns (default 1), so the fold keeps a
 * little more than that and drops the rest as the session advances. Bounding
 * here — rather than at read time — is what keeps the state proportional to
 * the window instead of to the whole conversation.
 */
export declare const TRANSCRIPT_RETAINED_TURNS = 4;
/** The empty fold: no completed turn, no retained pair, no prior suggestion. */
export declare const EMPTY_TRANSCRIPT_STATE: SuggestPromptTranscriptState;
/**
 * Pure transition for the `suggestPromptTranscript` unit: fold one committed
 * event into the retained transcript state. Returns the same reference for
 * every event the unit does not retain, which is what keeps the projection
 * drive's `Object.is` gate cheap.
 * @param state - the fold covering all prior events.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not retained).
 */
export declare function applyTranscriptProjection(state: SuggestPromptTranscriptState, event: SessionEvent): SuggestPromptTranscriptState;
//# sourceMappingURL=transcript.d.ts.map