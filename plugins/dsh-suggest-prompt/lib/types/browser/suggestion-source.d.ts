/**
 * Browser-side suggestion source: reads the host's stored suggestion from the
 * plugin's own route on the shared `/api` gateway.
 *
 * The suggestion does NOT travel through a session projection. A projection can
 * only be advanced by a committed session event, and writing a plugin-private
 * event type is exactly what made sessions unreadable on cold read (issue #4) —
 * `0.2.0-rc.2` has no way to mark an appended event `ignorable`. So the host
 * keeps the suggestion in its own storage domain and serves it over an exact
 * fetch route; nothing is written to the session log at all.
 *
 * A plain `fetch` is deliberate. `connection.rpc.call` would work here, but the
 * host cannot register that channel: `rpc.handle` reads `owner.webServer` on the
 * *connection* service's own fiber, which never injects `webServer`, so it
 * throws there no matter what the plugin declares. The fetch route has no such
 * dependency — and it keeps this module free of any `dsh-client-*` import, which
 * matters because the client bundle's module whitelist (`PLATFORM_MODULES`) does
 * not seed them.
 *
 * Refresh is a bounded poll (see {@link POLL_INTERVAL_MS}). A turn completes on
 * the host asynchronously after the client's own `running` flag drops, so a
 * purely reactive read would show nothing; the interval is deliberately modest
 * because each poll is one cheap local loopback call, and polling stops as soon
 * as the component unmounts.
 * @module @studyzy/dsh-suggest-prompt/browser/suggestion-source
 */
import type { SuggestPromptSuggestion } from '../types.ts';
/**
 * Poll interval for the stored suggestion, in milliseconds.
 *
 * The host write lands shortly after a turn completes; a sub-second poll keeps
 * the ghost text feeling immediate while costing one loopback request per
 * interval per mounted composer (the composer is a singleton per session).
 */
export declare const POLL_INTERVAL_MS = 700;
/**
 * Read the stored suggestion for one session.
 *
 * Every failure mode returns `null` rather than throwing: this feeds ghost text
 * inside the composer, and a broken read must degrade to "no suggestion"
 * instead of surfacing an error where the user is typing.
 * @param sessionId - session whose suggestion is read.
 * @param signal - abort signal for the request.
 * @returns the suggestion, or `null` when none is stored or the read failed.
 */
export declare function fetchSuggestion(sessionId: string, signal: AbortSignal): Promise<SuggestPromptSuggestion | null>;
/**
 * Subscribe to the stored suggestion for one session, polling while mounted.
 *
 * The first read is immediate so a suggestion stored before this page loaded
 * (a reload, or a session reopened from history) reappears without waiting a
 * full interval.
 * @param sessionId - session whose suggestion is tracked.
 * @returns the latest suggestion, or `null` while none is stored.
 */
export declare function useStoredSuggestion(sessionId: string): SuggestPromptSuggestion | null;
//# sourceMappingURL=suggestion-source.d.ts.map