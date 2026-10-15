/**
 * Suggested-next-prompt surface plugin, browser half: a conversation.input.overlay
 * bridge entry that renders the host's STORED suggestion as light placeholder
 * text INSIDE the composer textarea, plus the plugin's configuration card on the
 * WebUI **Plugins** page (provider/model for the suggestion route).
 *
 * The value arrives over this plugin's own `connection.rpc` channel — the host
 * stores each suggestion in its own storage domain and serves it there. It is
 * deliberately NOT a session projection: a projection advances only on a
 * committed session event, and writing a plugin-private event type is what made
 * sessions unreadable on cold read (issue #4). Accepting a suggestion rides the
 * standard kit's `inputActions.setDraft`.
 *
 * The overlay and configuration registrations use the `dsh >= 0.2.0` shape: a
 * slot's `inject` callback resolves the face the entry needs, and the standard
 * session props (`useSession`, `useInput`, `inputActions`, `sessionId`) arrive
 * on the component rather than through a package-level client runtime module.
 * The RPC face is package state, not session kit, so it is resolved once here
 * and passed down as the `face` prop.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export type * from '../types.ts';
export { GhostSuggestion } from './GhostSuggestion.tsx';
export { SettingsCard } from './SettingsCard.tsx';
export { SUGGEST_PROMPT_NS } from './settings-controller.ts';
/** Required services for the suggestion ghost bridge (the slot registry only). */
export declare const inject: string[];
/**
 * Client plugin body: the GhostSuggestion overlay bridge entry, plus the
 * suggest-prompt configuration card when the WebUI Plugins surface is composed.
 * The card is an enhancement over the core ghost bridge, so it mounts on a
 * scoped inject rather than the top-level dependency list — a deployment
 * without the WebUI settings surface still gets ghost suggestions.
 *
 * The card reads and writes the entry's config form through `ctx.configForms`
 * (provided by ui-settings), which is named in the scoped inject: without it the
 * scoped child never runs and the ghost bridge is unaffected.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map