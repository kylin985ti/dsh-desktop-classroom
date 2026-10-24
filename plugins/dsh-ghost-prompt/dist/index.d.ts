import Schema from '@deepseek-ai/schemastery';
/**
 * Host half of dsh-ghost-prompt.
 *
 * Latency is the whole game here, so a prediction starts the moment the
 * turn's final assistant message is logged (one with no tool calls) — before
 * `turn/end`, and without waiting for the browser to notice the turn ended.
 * That early start only runs for sessions a browser asked about recently
 * ({@link WATCH_MS}): a headless run, a scheduled job or a goal round has
 * nobody to read the suggestion and would only burn tokens.
 *
 * The browser half reads {@link SUGGEST_ROUTE} as an NDJSON stream, so the
 * ghost text grows token by token, and the model call is cut off as soon as
 * its first line is complete.
 */
export declare const name = "next-prompt";
export declare const inject: string[];
export declare const SUGGEST_ROUTE = "/api/next-prompt/suggest";
export declare const MODELS_ROUTE = "/api/next-prompt/models";
export declare const BENCH_ROUTE = "/api/next-prompt/bench";
export declare const DISMISS_ROUTE = "/api/next-prompt/dismiss";
export declare const WATCH_ROUTE = "/api/next-prompt/watch";
/** Provider id prefix that marks a route as one of the plugin's own models. */
export declare const OWN_PREFIX = "np:";
export type PresetId = 'modelscope' | 'siliconflow' | 'agnes' | 'deepseek' | 'spark';
type Preset = {
    name: string;
    baseURL: string;
    /** Where to create an API key. */
    keyUrl: string;
    /** Request fields every call carries, merged under each model's own. */
    body?: Record<string, unknown>;
    /** Recommended models, best first; `body` turns thinking off where the route needs it. */
    models: {
        id: string;
        body?: Record<string, unknown>;
    }[];
};
/**
 * Ready-made OpenAI-compatible routes: the user only pastes a key. Each one
 * already carries the fields dsh would need a `compat` block for, chiefly
 * whatever turns thinking off, since thinking is pure latency here.
 */
export declare const PRESETS: Record<PresetId, Preset>;
/** One provider the user added in the card; list order is the order models are tried in. */
export type OwnProvider = {
    /** Stable id: the preset id, or `custom-…` for a custom endpoint. */
    id: string;
    preset: PresetId | 'custom';
    /** Display name of a custom endpoint. */
    name: string;
    /** Base URL of a custom endpoint; presets bring their own. */
    baseURL: string;
    /** Model ids to use, tried in order. */
    models: string[];
    /** Extra request fields as a JSON object, merged over the preset's. */
    extraBody: string;
};
/**
 * The entry's Config, every field live-editable: on dsh >= 0.1.7 the settings
 * form writes through and each read below sees the new value without a restart.
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<Record<string, any>>>, Schemastery.ObjectT<NoInfer<Record<string, any>>>, "plain">;
export interface Config {
    enabled: boolean;
    source: 'dsh' | 'own';
    ownProviders: OwnProvider[];
    ownProvider: string;
    ownModel: string;
    apiKeys: Record<string, string>;
    provider: string;
    model: string;
    maxContextChars: number;
    maxOutputTokens: number;
    timeoutMs: number;
    acceptKey: 'arrow' | 'tab';
}
type Live<T> = T | {
    get(): T;
};
type RawConfig = {
    [K in keyof Config]: Live<Config[K]>;
};
type SessionEvent = {
    type: string;
    seq: number;
    data: any;
};
type Transcript = {
    role: 'user' | 'assistant';
    text: string;
};
/** Whether an `assistant/message` is the reply that closes its turn: complete, no tool calls. */
export declare function isFinalReply(event: SessionEvent): boolean;
/**
 * Fold the log into alternating user/assistant entries, consecutive assistant
 * steps merged. Walks back from the newest event and stops once older entries
 * could no longer fit {@link frameTranscript}'s `budget` (and a user message
 * has been seen), so a long session costs no more than its tail.
 */
export declare function transcriptOf(events: readonly SessionEvent[], budget?: number): Transcript[];
/** Newest-first packing under the char budget; the final assistant reply always fits (clipped). */
export declare function frameTranscript(transcript: Transcript[], budget: number): string;
/**
 * The displayable prefix of a still-streaming first line: a "User:" prefix
 * stripped, wrapping quotes stripped (a closing quote is kept unless the line
 * also opened with one), and nothing at all while it could still turn into NONE.
 */
export declare function partialFromOutput(raw: string): string;
/** The final suggestion from the first line of model output; `null` for NONE or junk. */
export declare function suggestionFromOutput(raw: string): string | null;
/**
 * The final-reply seq the user would be answering now, or `undefined` when
 * there is none: no turn yet, one still running, or the last one ended in an
 * error / cancel / block (a prediction there would guess at a failure).
 */
export declare function answerableKey(events: readonly SessionEvent[]): number | undefined;
/** Token counts summed over calls; `reported` counts the calls whose provider sent usage. */
export type UsageTotals = {
    calls: number;
    reported: number;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
};
/**
 * Count one call into `totals`. `usage` is the call's `usage` chunk; it is
 * missing when the stream was cut before the provider sent it (Esc, timeout,
 * a newer turn), so such a call counts but adds no tokens.
 */
export declare function addUsage(totals: UsageTotals, usage: any): UsageTotals;
/** One of the plugin's own models, ready to call. */
export type OwnTarget = {
    route: {
        provider: string;
        model: string;
    };
    /** Group label for menus: the preset's name, or the custom endpoint's. */
    providerName: string;
    baseURL: string;
    apiKey: string;
    body: Record<string, unknown>;
    /** Changes whenever anything that could fix a failure changes. */
    signature: string;
};
/**
 * The own models in the order they are tried: providers top to bottom, each
 * one's models in its listed order. Providers without a key, a base URL or a
 * model are skipped. Throws when `extraBody` is not a JSON object.
 */
export declare function ownTargets(providers: readonly OwnProvider[] | undefined, apiKeys: Readonly<Record<string, string>> | undefined): OwnTarget[];
/**
 * An OpenAI-format `usage` block in the shape dsh's `usage` chunks use:
 * `inputTokens` leaves out the cache hits, which DeepSeek reports in its own field.
 */
export declare function usageFromOpenAI(usage: any): {
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
};
/** The dsh-style chunks carried by one streamed `chat.completion.chunk`. */
export declare function chunksOf(json: any): any[];
/** The readable part of an error body: `error.message`, `errors.message`, `message`, or the text itself. */
export declare function errorMessage(status: number, text: string): string;
/** Stream one prediction from an own model as dsh-style chunks. */
export declare function streamChatCompletions(target: OwnTarget, system: string, input: string, maxTokens: number, signal: AbortSignal): AsyncGenerator<any>;
export declare function apply(ctx: any, rawConfig: RawConfig): void;
export {};
