/**
 * Accept-shortcut parsing for the ghost suggestion bridge: the host plugin
 * configures the key that adopts a displayed suggestion into the draft (for
 * example `Tab` or `Alt+Slash`), and this module turns that spec into an exact
 * KeyboardEvent matcher. Pure and side-effect free, so the browser half can
 * unit-test it directly.
 * @module @studyzy/dsh-client-ui-suggest-prompt/accept-key
 */
/** One keyboard-event predicate matching the configured accept shortcut. */
export type AcceptKeyMatcher = (event: KeyboardEvent) => boolean;
/**
 * Encode a `KeyboardEvent`'s code and modifier state as a canonical accept
 * shortcut spec such as `Tab`, `Alt+Slash`, or `Ctrl+Alt+X` — the inverse of
 * {@link parseAcceptKey}, so the emitted spec always round-trips through it.
 * @param code - the event's `code` (e.g. `KeyT`, `Slash`, `Tab`).
 * @param modifiers - the event's modifier flags.
 * @returns the canonical spec, or `undefined` when `code` names a pure modifier
 * key (an event with no main key cannot encode a shortcut).
 */
export declare function encodeKey(code: string, modifiers?: {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
}): string | undefined;
/**
 * Parse a shortcut spec such as `Tab`, `Alt+Slash`, `Alt+/`, or `Ctrl+Enter`
 * into an exact event matcher. Modifiers (`alt`, `ctrl`, `meta`, `shift`, with
 * aliases `option`, `control`, `cmd`, `command`) are case-insensitive and may
 * appear in any order before the single key token.
 * @param spec - the configured shortcut.
 * @returns an exact matcher, or `undefined` when the spec cannot be parsed
 * (an unknown key token, a missing key, or more than one key token).
 */
export declare function parseAcceptKey(spec: string): AcceptKeyMatcher | undefined;
//# sourceMappingURL=accept-key.d.ts.map