/** The editor may hold non-breaking spaces where the suggestion has plain ones. */
export declare const normalizeDraft: (draft: string) => string;
/**
 * Whether the draft is still on the suggestion's path: a prefix of it, or —
 * while it is still streaming — typed ahead of what has arrived so far.
 */
export declare const onPath: (draft: string, suggestion: string, complete: boolean) => boolean;
/** The next word of `rest` plus the spaces / punctuation after it. */
export declare function nextWord(rest: string): string;
export declare const inject: string[];
export declare function apply(ctx: any): void;
