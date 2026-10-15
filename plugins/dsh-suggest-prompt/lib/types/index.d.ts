/**
 * suggest-prompt plugin: after every completed agent turn, generate one
 * suggested next prompt for the user through a bounded auxiliary LLM call and
 * deliver it to the web composer, which renders it as ghost placeholder text.
 *
 * Delivery does NOT go through the session log. The pre-1.2 build appended
 * private `SessionEventMap` types (`suggest-prompt/…`), which are outside the
 * harness's closed `KNOWN_SESSION_EVENT_TYPES`; `0.2.0-rc.2` offers no way to
 * mark an appended event `ignorable`, so `validateStoredEvents` refused the
 * whole log on the next cold read and the session could not be reopened
 * (issue #4). A suggestion is plugin-owned derived state, so it is persisted in
 * this plugin's own storage domain and served to the browser over a
 * plugin-owned `connection.rpc` channel. With zero session-log writes, issue #4
 * cannot recur by construction.
 *
 * The plugin is scoped to the projection registry, whose host-only transcript
 * fold supplies the bounded transcript: generation reads that fold rather than
 * scanning session history, which `dsh >= 0.2.0` deprecates for new callers.
 * @module @studyzy/dsh-suggest-prompt
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { SUGGEST_ROUTE_METHOD, SUGGEST_ROUTE_PATH } from './rpc-contract.ts';
import type { SuggestPromptSuggestion } from './types.ts';
export type * from './types.ts';
export type * from './domain.ts';
/**
 * The browser-facing RPC channel this plugin owns. Absolute by contract
 * (`/^\/[A-Za-z0-9._~-]+$/`), and never the reserved `/api`.
 */
export { SUGGEST_ROUTE_METHOD, SUGGEST_ROUTE_PATH };
/** Required LLM and session policy; this plugin adds no defaults. */
export interface Config {
    /** Maximum UTF-8 bytes in the final JSON-framed user prompt. */
    readonly maxInputBytes: number;
    /** Auxiliary generation output-token cap. */
    readonly maxOutputTokens: number;
    /** End-to-end auxiliary request deadline in milliseconds. */
    readonly timeoutMs: number;
    /** Transcript tail keeps at most this many recent completed turns (default 1: only the last completed turn). */
    readonly maxRecentTurns?: number;
    /** Transcript tail character budget before JSON framing. */
    readonly maxTranscriptChars: number;
    /** Visible-character cap for the generated suggestion. */
    readonly maxSuggestionChars: number;
    /** Optional explicit provider route; missing falls back to the session route. */
    readonly provider?: string;
    /** Optional explicit model id; missing falls back to the session route. */
    readonly model?: string;
    /**
     * Composer shortcut that accepts a displayed suggestion into the draft
     * (for example `Tab`, `Alt+Slash`, or `Ctrl+Enter`). Default `Tab`.
     */
    readonly acceptKey?: string;
}
/**
 * Exported loader schema. Cast to the runtime shape: `volatile()` only affects
 * how the settings form projects the field, not the value the plugin receives.
 */
export declare const Config: z<Config>;
/** Cordis plugin identity. */
export declare const name = "suggest-prompt";
/**
 * Services required before this plugin activates. `storageDomain` is the
 * durable suggestion store (`@deepseek-ai/dsh-base` mounts it, so it is present
 * in every profile); `connection` carries the shared `/api` gateway this
 * plugin's browser route hangs off.
 *
 * `webServer` is deliberately NOT here. The plugin never touches it: it
 * registers through `connection.fetch.register`, which writes only to the
 * connection service's own route table. The sibling surface `rpc.handle` does
 * read `owner.webServer`, but on the *connection* fiber — which injects neither
 * `webServer` nor anything that provides it — so that call throws there
 * regardless of this plugin's own list. See `SUGGEST_ROUTE_PATH`.
 */
export declare const inject: string[];
/**
 * Settings namespace of the suggestion route. `dsh >= 0.2.0` keys a plugin's
 * settings page by its profile entry id and derives the form from the plugin's
 * own `Config` schema, so this value names that entry/page rather than a
 * separately registered namespace. It is what the WebUI settings card binds to
 * and what `configEditor` writes through.
 */
export declare const SUGGEST_PROMPT_NS = "suggest-prompt";
/**
 * Mount the plugin: open the suggestion store, expose the browser read
 * endpoint, and generate one suggestion per completed turn.
 * @param ctx - context exposing LLM, session, storage, and connection services.
 * @param config - required bounded-generation policy.
 */
export declare function apply(ctx: Context, config: Config): void;
/** Re-exported for the host invariant, which reads committed events. */
export type { SessionEvent, SuggestPromptSuggestion };
//# sourceMappingURL=index.d.ts.map