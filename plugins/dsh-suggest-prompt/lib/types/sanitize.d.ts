/**
 * Transcript redaction, suggestion sanitization, and semantic output
 * filtering for the suggest-prompt auxiliary call: nothing that reaches the
 * model carries secret-shaped text, and nothing the model returns can inject
 * terminal control into the web composer or read as meta-text instead of a
 * real next prompt. Pure functions, exported for direct unit coverage.
 * @module @studyzy/dsh-suggest-prompt/sanitize
 */
/**
 * Mask secret-shaped substrings so the auxiliary model never receives them.
 * @param text - transcript text.
 * @returns the same text with every matched secret replaced by a label.
 */
export declare function redactSecrets(text: string): string;
/**
 * Structurally clean one raw model output into composer-safe single-line
 * text, without the length cap: control sequences, lone surrogates, fences,
 * and surrounding quotes are stripped, and whitespace is collapsed.
 * @param text - raw model output.
 * @returns the cleaned single-line text.
 */
export declare function cleanSuggestion(text: string): string;
/**
 * Sanitize one raw suggestion into composer-safe single-line text, truncating
 * to the visible-character cap.
 * @param text - raw model output.
 * @param maxChars - hard visible-character cap (code points).
 * @returns the sanitized text and whether it was truncated.
 */
export declare function sanitizeSuggestion(text: string, maxChars: number): {
    readonly text: string;
    readonly truncated: boolean;
};
/**
 * Report whether `text` contains a CJK unified ideograph. CJK text has no
 * spaces, so word counts need this check; it also picks the suggestion
 * language to match the conversation.
 * @param text - inspected text.
 * @returns true when any code point falls in the CJK unified ideographs range.
 */
export declare function hasCJK(text: string): boolean;
/**
 * Reject raw model output that is not a usable next prompt: meta-text
 * ("no suggestion", "stay silent"), evaluative filler, assistant-voice
 * phrasing, multi-sentence or over-long output, or formatting. Returns true
 * when the output should be treated as "no suggestion" instead of displayed.
 * @param text - sanitized, single-line model output.
 * @returns true when the suggestion should be dropped silently.
 */
export declare function shouldFilterSuggestion(text: string): boolean;
//# sourceMappingURL=sanitize.d.ts.map