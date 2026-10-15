import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Full props of the overlay ghost: session standard kit (session scope). */
export type GhostSuggestionProps = PropsRuntime<'conversation.input.overlay'>;
/**
 * Render the suggestion as placeholder text inside the composer; accept on the
 * configured shortcut (default Tab).
 *
 * @param props - standard session kit (session snapshot, input state, actions).
 */
export declare function GhostSuggestion({ useSession, useInput, inputActions, sessionId, }: GhostSuggestionProps): import("react").JSX.Element | null;
//# sourceMappingURL=GhostSuggestion.d.ts.map