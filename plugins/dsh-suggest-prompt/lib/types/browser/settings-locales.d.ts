/**
 * Locale copy for the suggest-prompt settings card.
 * @module @studyzy/dsh-client-ui-suggest-prompt/settings-locales
 */
/** Locale keys the settings card renders. */
export type SuggestPromptSettingsLocaleKey = 'title' | 'description' | 'provider' | 'providerHint' | 'model' | 'modelHint' | 'acceptKey' | 'acceptKeyHint' | 'pressKeys' | 'followRoute' | 'overridden' | 'reset' | 'readOnly' | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'suggest-prompt.settings': SuggestPromptSettingsLocaleKey;
    }
}
/** English copy for the card. */
export declare const en: Record<SuggestPromptSettingsLocaleKey, string>;
/** Simplified Chinese copy for the card. */
export declare const zh: Record<SuggestPromptSettingsLocaleKey, string>;
//# sourceMappingURL=settings-locales.d.ts.map