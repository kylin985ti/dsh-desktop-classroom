/**
 * Host-side vocabulary of the suggest-prompt domain: the durable storage
 * record and the session message-source merge. Kept separate from ./types.ts
 * (the pure client-safe outlet) because these declarations pull dsh-llm into
 * the program — the one-program-per-side layout forbids that on client
 * aggregates.
 *
 * The suggestion is persisted in this plugin's own storage domain (see
 * ./records.ts) — NOT as a session-log write of any kind. The pre-1.2 build
 * appended private `SessionEventMap` types, which wedged sessions on harnesses
 * that cannot mark an appended event ignorable (issue #4); a suggestion is
 * plugin-owned derived state and needs no place in the agent's log.
 * @module @studyzy/dsh-suggest-prompt
 */
export {};
//# sourceMappingURL=domain.js.map