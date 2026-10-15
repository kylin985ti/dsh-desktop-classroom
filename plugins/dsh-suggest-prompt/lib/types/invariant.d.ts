/**
 * Package-owned durable suggest-prompt invariant.
 *
 * The plugin holds a session-log prohibition, and that prohibition is what this
 * companion now asserts: a suggestion never reaches the log. The pre-1.2 build
 * appended private `SessionEventMap` types, which are outside the harness's
 * closed `KNOWN_SESSION_EVENT_TYPES`; `0.2.0-rc.2` cannot mark an appended event
 * `ignorable`, so `validateStoredEvents` refused the whole log on the next cold
 * read and the session could not be reopened (issue #4). The suggestion is
 * persisted in this plugin's own storage domain instead (see ./records.ts), so
 * any `suggest-prompt`-shaped event appearing in a log is a regression, not
 * merely malformed data.
 * @module @studyzy/dsh-suggest-prompt/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { InvariantFailure } from '@deepseek-ai/dsh-invariants';
/** Cordis companion plugin name. */
export declare const name = "suggest-prompt-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Reject any session event this package is forbidden to write.
 *
 * This is a hard prohibition rather than a payload check: the plugin's durable
 * channel is its storage domain, so a matching event means the log path was
 * reintroduced — the exact regression that made sessions unreadable.
 * @param event - the committed session event under inspection.
 * @param fail - invariant failure sink.
 */
export declare function validateEvent(event: SessionEvent, fail: InvariantFailure): void;
/**
 * Register the suggest-prompt invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map