/**
 * The suggest-prompt configuration card on the WebUI Plugins page: provider and
 * model for the ghost suggestion generation, chosen from the installed provider
 * catalog and staged until save. The chrome replicates the harness's plugin
 * settings cards (PluginCard/ValueFields) so this card reads identically to the
 * built-in ones.
 *
 * The page renders the same component through **three** surfaces:
 *
 * - `plugins.item` with `view: 'summary'` — the one-liner on the official-
 *   plugins card, rendered inside the card head's `<p>`;
 * - `plugins.item` with `view: 'page'` — the form on that card's detail page;
 * - `plugins.bundle.config` with `view: 'page'` — the form on the installed
 *   package's detail page.
 *
 * Only the detail pages are "open": the accordion this card used to be (an
 * `<li>` with a header button, because it lived in a tab panel's list) is gone,
 * and the entry point's summary is a separate, hook-free component.
 * @module @studyzy/dsh-suggest-prompt/settings-card
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SuggestPromptCardFace } from './settings-controller.ts';
import type { SuggestPromptSettingsLocaleKey } from './settings-locales.ts';
/**
 * The view the Plugins page asks one configuration entry for.
 *
 * The page renders a `plugins.item` entry twice — `summary` is the card's
 * one-liner in the list and in the detail header, `page` is the body of the
 * plugin's own page — and a `plugins.bundle.config` entry once, with `page`.
 * The keyed package page passes no `form`; the official-plugin page passes the
 * Host-owned form, which this card ignores (its own `configForms` face is the
 * same namespace and is what keeps the staged-edit model testable).
 */
export interface PluginConfigViewProps {
    /** `summary` renders the one-liner alone; `page` renders the configuration form. */
    readonly view?: 'summary' | 'page' | undefined;
}
/** Props the renderer binds for the suggest-prompt card. */
export type SettingsCardProps = PluginConfigViewProps & PropsRuntime<'settings.plugins.tab'> & PropsLocale<'suggest-prompt.settings'> & InjectFace<SuggestPromptCardFace>;
/**
 * The card's one-line description, as `plugins.item` renders it in its summary
 * view — inside the card head's `<p>`, so this returns inline content only.
 *
 * Deliberately a component of its own, and deliberately hook-free: it answers a
 * render the form never sees, so subscribing to the card's store here would
 * build a subscription just to print one static sentence — and, more
 * importantly, it keeps the branch out of {@link CardBody}, whose two hooks
 * must run on every one of its renders. An early return ahead of them would
 * change the hook count between the summary and page renders of the *same*
 * component, which React reports as "Rendered fewer hooks than expected".
 * @param props - the locale copy bound for this entry's namespace.
 * @returns the description line.
 */
export declare function SettingsCardSummary(props: {
    t: (key: SuggestPromptSettingsLocaleKey) => string;
}): import("react").JSX.Element;
/**
 * Render the suggest-prompt configuration entry.
 *
 * Branches on the view the Plugins page asked for, then delegates: the two
 * branches are separate components, so each has a constant hook count of its
 * own regardless of how the page renders them, or in what order.
 * @param props - locale copy, the requested view, the card snapshot, and its form actions.
 * @returns the summary line, or the configuration form.
 */
export declare function SettingsCard(props: SettingsCardProps): import("react").JSX.Element;
//# sourceMappingURL=SettingsCard.d.ts.map