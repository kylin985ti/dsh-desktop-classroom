/**
 * Pure types of the suggest-prompt domain: the shared suggestion payload and
 * the host-only transcript fold state, free of this package's host-side imports
 * (cordis events, dsh-llm, the plugin). The deployment {@link Config} lives on
 * the plugin itself (`src/index.ts`) because the config catalog pastes
 * declarations verbatim. Both runtime halves read these through one outlet —
 * `./types` for host consumers, `./client` (the browser half-entry re-exports
 * these) for client aggregates — with zero content duplication. Host-coupled
 * vocabulary (storage record, message sources) lives in ./domain.ts.
 *
 * The suggestion is NOT a session projection. A projection advances only on a
 * committed session event, and a plugin-private event type is what made
 * sessions unreadable on cold read (issue #4); the value travels over this
 * plugin's own `connection.rpc` channel instead (see ./records.ts).
 *
 * @module @studyzy/dsh-suggest-prompt/types
 */
export {};
//# sourceMappingURL=types.js.map