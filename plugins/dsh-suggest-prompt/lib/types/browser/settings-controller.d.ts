/**
 * The suggest-prompt settings card's staged form over the `suggest-prompt`
 * profile entry. Edits are staged until save; a save writes the staged route
 * pair back through the entry's config form (the host plugin re-resolves its
 * config from the entry, so the next completed turn uses the new model).
 *
 * The card's dropdowns read sibling entries (`llm-pi-ai`, `llm-deepseek`) from
 * the same config-form seam read-only: provider names are the `llm-pi-ai`
 * `providers` keys and the model list is the selected provider's `models[].id`.
 * A provider without an explicit model list falls back to a free-text model
 * field.
 * @module @studyzy/dsh-suggest-prompt/settings-controller
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
/**
 * Settings namespace of the suggest-prompt host plugin. In `dsh >= 0.2.0` a
 * plugin's settings namespace IS its profile entry id, so this is the id the
 * bundle patch mounts the host plugin under. Spelled here rather than imported:
 * a client package must not depend on a Host package, and the host plugin that
 * owns it spells the same value.
 */
export declare const SUGGEST_PROMPT_NS = "suggest-prompt";
/** The suggest-prompt section's editable fields (route pair plus the accept shortcut). */
export type SuggestPromptEditField = 'provider' | 'model' | 'acceptKey';
/** Route fields the card edits — the suggest-prompt section's optional pair. */
export interface SuggestPromptSettings {
    /** Provider the auxiliary call routes through; absent follows the session route. */
    provider?: string;
    /** Full catalog model id; absent follows the session route. */
    model?: string;
    /** Composer shortcut that accepts a suggestion into the draft (default Tab). */
    acceptKey?: string;
}
/** The `llm-pi-ai` section, narrowed to the route dropdown catalog. */
export interface PiAiProviderCatalog {
    providers?: Record<string, {
        /** Explicit model profiles; absent relies on the installed catalog defaults. */
        models?: Array<{
            id: string;
        }>;
    }>;
}
/** The `llm-deepseek` section, narrowed to its advisory model list. */
export interface DeepSeekCatalog {
    models?: Array<{
        id: string;
    }>;
}
/** One dropdown option: the route value written to settings, and its label. */
export interface RouteOption {
    /** Provider route (or model id) persisted when selected. */
    value: string;
    /** Human-readable option label. */
    label: string;
}
/** One route field as the card's control renders it. */
export interface RouteFieldState {
    /** Draft text the control renders. */
    text: string;
    /** Whether saving would leave a user-layer entry for this field. */
    overridden: boolean;
    /** Whether the draft is not a value this field accepts (blocks saving). */
    invalid: boolean;
}
/** What the card renders. */
export interface SuggestPromptCardState {
    /** False while the namespace is not served to this client; the card renders nothing. */
    available: boolean;
    /** Whether the host document accepts writes. */
    writable: boolean;
    /** Whether the form holds edits that a save would write. */
    dirty: boolean;
    /** Whether any staged draft is invalid, which blocks the save. */
    invalid: boolean;
    /** Whether a save is crossing the wire. */
    saving: boolean;
    /** Whether the last save did not land as staged. */
    failed: boolean;
    /** The provider field. */
    provider: RouteFieldState;
    /** The model field. */
    model: RouteFieldState;
    /** The accept-key shortcut field. */
    acceptKey: RouteFieldState;
    /** Provider names from the pi-ai catalog plus the built-in DeepSeek route. */
    providerOptions: RouteOption[];
    /** Model ids of the effective provider, plus the current value when absent. */
    modelOptions: RouteOption[];
    /** Whether the effective provider lists explicit models (else a text field). */
    modelSelectable: boolean;
}
/** The write actions the card's slot entry injects. */
export interface SuggestPromptCardActions {
    /** Stage draft text for one field. */
    edit(field: SuggestPromptEditField, text: string): void;
    /** Stage a clear, so saving lets the field re-inherit the composition layer. */
    resetField(field: SuggestPromptEditField): void;
    /** Write every staged edit, then re-seed from what the host accepted. */
    save(): void;
    /** Drop every staged edit. */
    discard(): void;
}
/** The registration-side face the card's slot entry injects. */
export interface SuggestPromptCardFace extends SuggestPromptCardActions {
    hooks: {
        /** Card snapshot bound by the renderer as useSuggestPromptCard. */
        suggestPromptCard: SnapshotStore<SuggestPromptCardState>;
    };
}
/** Bridges the entry config forms onto the card's staged form. */
export declare class SuggestPromptCardController {
    private readonly form;
    private readonly catalogForm;
    private readonly deepSeekForm;
    private readonly staged;
    private readonly store;
    private readonly unsubscribers;
    private saving;
    private failed;
    /**
     * @param form - the config form of the `suggest-prompt` entry.
     * @param catalogForm - the read-only form for the `llm-pi-ai` provider catalog.
     * @param deepSeekForm - the read-only form for the built-in DeepSeek adapter.
     */
    constructor(form: ConfigForm<SuggestPromptSettings>, catalogForm: ConfigForm<PiAiProviderCatalog>, deepSeekForm: ConfigForm<DeepSeekCatalog>);
    /**
     * Stop observing the bound forms. Call once when the owning fiber unloads.
     */
    dispose(): void;
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject(): SuggestPromptCardFace;
    /** The form actions bound to this controller. */
    actions(): SuggestPromptCardActions;
    /** Publish the card state projection. */
    private projection;
    /** One control's draft state: staged text, override presence, and validity. */
    private field;
    /** The provider whose model list the card offers: the staged pick, else the entry value. */
    private effectiveProvider;
    /** Provider options: the pi-ai catalog routes plus the built-in DeepSeek route. */
    private catalogProviderOptions;
    /** Explicit model options one provider lists; empty means the catalog defaults apply. */
    private catalogModels;
    /** The composition-layer value one field reverts to once cleared. */
    private baseValue;
    /** Whether the user document layer carries this field (marks it overridden). */
    private stored;
    private stage;
    /** Whether one model id the effective provider route would resolve to. */
    private modelServes;
    /** Read one scalar as a string from a settings section, else ''. */
    private stringValue;
    /**
     * Write every staged edit, then re-seed from what the host accepted.
     *
     * The write contract ({@link ConfigForm.set}/{@link ConfigForm.unset})
     * resolves even when the document rejected the value — it folds/reloads
     * instead of throwing — so the edit is verified by reading the section back
     * after each write, not by relying on the promise to reject. A transport
     * failure does reject, which is the `catch` below.
     */
    private save;
    private publish;
}
/** The snapshot type one bound config form carries (re-exported for tests). */
export type SuggestPromptFormSnapshot = ConfigFormSnapshot<SuggestPromptSettings>;
//# sourceMappingURL=settings-controller.d.ts.map