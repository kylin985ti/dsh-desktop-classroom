window.__ModuleLoader__.load({
	id: "@studyzy/dsh-suggest-prompt/client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region src/browser/accept-key.ts
		/** Key tokens that map to a `KeyboardEvent.code` that is not a letter or digit. */
		const KEY_CODES = {
			tab: "Tab",
			enter: "Enter",
			space: "Space",
			" ": "Space",
			slash: "Slash",
			"/": "Slash",
			backspace: "Backspace",
			delete: "Delete",
			escape: "Escape",
			esc: "Escape",
			insert: "Insert",
			home: "Home",
			end: "End",
			pageup: "PageUp",
			pagedown: "PageDown",
			arrowup: "ArrowUp",
			up: "ArrowUp",
			arrowdown: "ArrowDown",
			down: "ArrowDown",
			arrowleft: "ArrowLeft",
			left: "ArrowLeft",
			arrowright: "ArrowRight",
			right: "ArrowRight",
			period: "Period",
			".": "Period",
			comma: "Comma",
			",": "Comma",
			semicolon: "Semicolon",
			";": "Semicolon",
			quote: "Quote",
			"'": "Quote",
			bracketleft: "BracketLeft",
			"[": "BracketLeft",
			bracketright: "BracketRight",
			"]": "BracketRight",
			backslash: "Backslash",
			"\\": "Backslash",
			minus: "Minus",
			"-": "Minus",
			equal: "Equal",
			"=": "Equal",
			backquote: "Backquote",
			"`": "Backquote"
		};
		/** One key token to a `KeyboardEvent.code`; unknown tokens map to nothing. */
		function keyCode(token) {
			const lower = token.toLowerCase();
			const named = KEY_CODES[lower];
			if (named !== void 0) return named;
			if (/^[a-z]$/.test(lower)) return `Key${lower.toUpperCase()}`;
			if (/^[0-9]$/.test(lower)) return `Digit${lower}`;
			if (/^f(?:[1-9]|1[0-2])$/.test(lower)) return `F${lower.slice(1)}`;
		}
		/**
		* Encode a `KeyboardEvent`'s code and modifier state as a canonical accept
		* shortcut spec such as `Tab`, `Alt+Slash`, or `Ctrl+Alt+X` — the inverse of
		* {@link parseAcceptKey}, so the emitted spec always round-trips through it.
		* @param code - the event's `code` (e.g. `KeyT`, `Slash`, `Tab`).
		* @param modifiers - the event's modifier flags.
		* @returns the canonical spec, or `undefined` when `code` names a pure modifier
		* key (an event with no main key cannot encode a shortcut).
		*/
		function encodeKey(code, modifiers = {}) {
			const parts = [];
			if (modifiers.alt) parts.push("Alt");
			if (modifiers.ctrl) parts.push("Ctrl");
			if (modifiers.meta) parts.push("Meta");
			if (modifiers.shift) parts.push("Shift");
			if (KEY_MODIFIER_CODES.has(code)) return void 0;
			const main = encodeMainKey(code);
			if (main === void 0) return void 0;
			parts.push(main);
			return parts.join("+");
		}
		/** Codes of the pure modifier keys (no shortcut can name one as its main key). */
		const KEY_MODIFIER_CODES = /* @__PURE__ */ new Set([
			"AltLeft",
			"AltRight",
			"ControlLeft",
			"ControlRight",
			"MetaLeft",
			"MetaRight",
			"ShiftLeft",
			"ShiftRight"
		]);
		/** Map a main key `code` to its canonical accept-spec token. */
		function encodeMainKey(code) {
			const keyMatch = /^Key([A-Z])$/.exec(code);
			if (keyMatch !== null) return keyMatch[1];
			const digitMatch = /^Digit([0-9])$/.exec(code);
			if (digitMatch !== null) return digitMatch[1];
			if (/^F(?:[1-9]|1[0-2])$/.test(code)) return code;
			return code;
		}
		/**
		* Parse a shortcut spec such as `Tab`, `Alt+Slash`, `Alt+/`, or `Ctrl+Enter`
		* into an exact event matcher. Modifiers (`alt`, `ctrl`, `meta`, `shift`, with
		* aliases `option`, `control`, `cmd`, `command`) are case-insensitive and may
		* appear in any order before the single key token.
		* @param spec - the configured shortcut.
		* @returns an exact matcher, or `undefined` when the spec cannot be parsed
		* (an unknown key token, a missing key, or more than one key token).
		*/
		function parseAcceptKey(spec) {
			const parts = spec.trim().split(/\s*\+\s*/).map((part) => part.toLowerCase());
			if (parts.some((part) => part === "")) return void 0;
			let code;
			let alt = false;
			let ctrl = false;
			let meta = false;
			let shift = false;
			for (const part of parts) {
				if (part === "alt" || part === "option") {
					alt = true;
					continue;
				}
				if (part === "ctrl" || part === "control") {
					ctrl = true;
					continue;
				}
				if (part === "meta" || part === "cmd" || part === "command") {
					meta = true;
					continue;
				}
				if (part === "shift") {
					shift = true;
					continue;
				}
				if (code !== void 0) return void 0;
				code = keyCode(part);
				if (code === void 0) return void 0;
			}
			if (code === void 0) return void 0;
			return (event) => event.code === code && event.altKey === alt && event.ctrlKey === ctrl && event.metaKey === meta && event.shiftKey === shift;
		}
		//#endregion
		//#region src/rpc-contract.ts
		/**
		* The RPC contract shared by this plugin's two halves.
		*
		* Deliberately free of host-only and browser-only imports: the host half
		* registers the route and the browser half calls it, and the client bundle may
		* only `require` the shell-seeded platform modules — so this module must stay
		* plain constants and types that both programs can include.
		* @module @studyzy/dsh-suggest-prompt/rpc-contract
		*/
		/**
		* Exact browser-facing path this plugin owns, dispatched by Connection's
		* shared `/api` gateway.
		*
		* It must sit under `/api` (`assertFetchRoute` rejects anything else), and it
		* is registered with `ctx.connection.fetch.register(...)` rather than
		* `ctx.connection.rpc.handle(...)`.
		*
		* That choice is not stylistic. `rpc.handle` registers an HTTP route through
		* `owner.webServer.register(...)`, where `owner` is the **connection service's
		* own fiber** — and that fiber injects `['credentials']` (package) plus
		* `[webRuntime]` (its profile row), never `webServer`. The read therefore
		* throws `cannot get property "webServer" without inject` inside `rpc.handle`
		* no matter what this plugin declares, and the plugin body is rolled back with
		* the session listener in it. `registerFetchRoute` only writes to the
		* connection's own `fetchRoutes` map, so it carries no such dependency — and
		* it is the surface the harness's own `dsh-client-file-upload` uses.
		*/
		const SUGGEST_ROUTE_PATH = "/api/suggest-prompt";
		/**
		* HTTP method the suggestion route answers. The browser half calls this with a
		* plain `fetch` through the ordinary `/api` gateway, so the route declares
		* exactly the one method it serves.
		*/
		const SUGGEST_ROUTE_METHOD = "POST";
		/**
		* Read the stored suggestion for one session.
		*
		* Every failure mode returns `null` rather than throwing: this feeds ghost text
		* inside the composer, and a broken read must degrade to "no suggestion"
		* instead of surfacing an error where the user is typing.
		* @param sessionId - session whose suggestion is read.
		* @param signal - abort signal for the request.
		* @returns the suggestion, or `null` when none is stored or the read failed.
		*/
		async function fetchSuggestion(sessionId, signal) {
			try {
				const response = await fetch(SUGGEST_ROUTE_PATH, {
					method: SUGGEST_ROUTE_METHOD,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId }),
					signal
				});
				if (!response.ok) {
					warnOnce(`suggest-prompt: read failed with HTTP ${String(response.status)}`);
					return null;
				}
				const value = (await response.json()).suggestion;
				return value === null || value === void 0 ? null : value;
			} catch (error) {
				warnOnce(`suggest-prompt: read threw ${String(error)}`);
				return null;
			}
		}
		/** Whether the one-shot transport diagnostic has already been emitted. */
		let warned = false;
		/**
		* Report a transport failure once per page.
		*
		* Rate-limited because the caller polls: an unreachable host would otherwise
		* write the same line every {@link POLL_INTERVAL_MS}.
		* @param message - the diagnostic to emit.
		*/
		function warnOnce(message) {
			if (warned) return;
			warned = true;
			console.warn(message);
		}
		/**
		* Subscribe to the stored suggestion for one session, polling while mounted.
		*
		* The first read is immediate so a suggestion stored before this page loaded
		* (a reload, or a session reopened from history) reappears without waiting a
		* full interval.
		* @param sessionId - session whose suggestion is tracked.
		* @returns the latest suggestion, or `null` while none is stored.
		*/
		function useStoredSuggestion(sessionId) {
			const [snapshot, setSuggestion] = (0, react.useState)({ sessionId: null, value: null });
			(0, react.useEffect)(() => {
				let cancelled = false;
				let inFlight = false;
				const controller = new AbortController();
				const read = () => {
					if (inFlight || cancelled || document.visibilityState === "hidden") return;
					inFlight = true;
					fetchSuggestion(sessionId, controller.signal).then((value) => {
						if (cancelled) return;
						setSuggestion((previous) => previous.sessionId === sessionId && sameSuggestion(previous.value, value) ? previous : { sessionId, value });
					}).finally(() => { inFlight = false; });
				};
				read();
				const timer = setInterval(read, 700);
				return () => {
					cancelled = true;
					controller.abort();
					clearInterval(timer);
				};
			}, [sessionId]);
			return snapshot.sessionId === sessionId ? snapshot.value : null;
		}
		/**
		* Whether two reads carry the same suggestion.
		*
		* Compared field-by-field rather than by deep equality: the payload is flat, so
		* this is both cheaper and total (no cycle or prototype concerns on data that
		* crossed the transport boundary).
		* @param left - previously displayed suggestion.
		* @param right - newly read suggestion.
		* @returns true when the two describe the same suggestion.
		*/
		function sameSuggestion(left, right) {
			if (left === null || right === null) return left === right;
			return left.turn === right.turn && left.baseSeq === right.baseSeq && left.text === right.text && left.truncated === right.truncated && left.acceptKey === right.acceptKey && left.route?.provider === right.route?.provider && left.route?.model === right.route?.model;
		}
		//#endregion
		//#region src/browser/GhostSuggestion.tsx
		/**
		* Suggested-next-prompt ghost text: reads the host's STORED suggestion over the
		* plugin's own `connection.rpc` channel and, when the session is idle with an
		* empty draft, renders it as light placeholder text INSIDE the composer
		* (overlay slot, `pointer-events: none`, so it never blocks input). Pressing the
		* configured shortcut (default `Tab`) while focus sits in the composer fills the
		* draft with the suggestion through `inputActions.setDraft`, leaving it
		* editable.
		*
		* The suggestion deliberately does NOT arrive through a session projection: a
		* projection advances only on a committed session event, and a plugin-private
		* event type is what made sessions unreadable on cold read (issue #4). See
		* ./suggestion-source.ts for the storage + RPC path that replaced it.
		*
		* `dsh >= 0.2.0` note: the composer is a Lexical `contenteditable` host, not a
		* `<textarea>`, and its native placeholder is a sibling `<div>` rather than a
		* `::placeholder` pseudo-element. Both facts drive the selectors and the focus
		* check below.
		*/
		/** Fallback shortcut when the suggestion carries no key or the configured one is unparseable. */
		const DEFAULT_ACCEPT_KEY = "Tab";
		const DEFAULT_ACCEPT_MATCHER = (event) => event.code === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
		const STYLE_TAG_ID$1 = "dsh-suggest-prompt-style";
		let styleUsers = 0;
		const CSS_TEXT = `
.dsh-suggest-prompt-ghost {
  position: absolute;
  /* overlayAnchor sits at the composer card's top edge (inset: 0 0 auto).
     Align the ghost with the editor's text origin: the card adds 10px top
     padding and the editor scroll layer adds 4px top / 16px left (see
     InputBar/DraftEditor). pointer-events:none keeps the caret and clicks on
     the editor. */
  top: calc(10px + 4px);
  left: 16px;
  right: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  font: inherit;
  font-size: inherit;
  line-height: inherit;
  color: var(--dsw-alias-label-tertiary, #68707d);
  pointer-events: none;
  user-select: none;
}
/* The native composer placeholder ("给智能体发消息") occupies the SAME text
   origin as the ghost. In dsh >= 0.2.0 it is a real element, not a textarea
   ::placeholder pseudo-element, so hiding it means hiding that node: while a
   ghost is visible the two would otherwise paint on top of each other and
   neither reads. Scoped with :has() to the composer that actually carries a
   ghost, so the built-in placeholder is untouched everywhere else.

   Visibility (not display) is deliberate: the node still occupies its box, so
   the composer's height and the ghost's baseline do not shift when the
   suggestion appears or is accepted. */
[data-composer-card]:has(.dsh-suggest-prompt-ghost) [data-composer-placeholder] {
  visibility: hidden;
}
/* Older assemblies (and any future regression back to a textarea) paint the
   placeholder with the pseudo-element; WebKit uses -webkit-text-fill-color,
   which outranks color, so both must go transparent. */
[data-composer-card]:has(.dsh-suggest-prompt-ghost) textarea::placeholder {
  color: transparent;
  -webkit-text-fill-color: transparent;
}
`;
		const ROOT_STYLE = { display: "contents" };
		/**
		* Whether focus currently sits in the chat composer's editor.
		*
		* The composer changed shape in `dsh >= 0.2.0` (Lexical `contenteditable` host
		* instead of a `<textarea>`), so this matches either form rather than
		* asserting one. The editor layer's `[data-input-scroll]` marker is the stable
		* anchor: it identifies the composer regardless of the inner element, and a
		* node inside it therefore means "the user is typing a prompt".
		* @returns true when the active element belongs to the composer editor.
		*/
		function isComposerFocused() {
			const active = document.activeElement;
			if (active === null) return false;
			if (active instanceof HTMLTextAreaElement) return true;
			if (!(active instanceof HTMLElement)) return false;
			return active.isContentEditable || active.closest("[data-input-scroll]") !== null;
		}
		/**
		* The suggestion to surface, or `undefined` when none should show.
		*
		* `dsh >= 0.2.0` removed `turnEnds` from the Session snapshot, so the client no
		* longer has a local map of completed turns to compare against. Freshness is
		* derived from state the client does have: the stored suggestion carries the
		* turn it answers, and `running` tells us whether a newer turn is in flight. A
		* suggestion is therefore current while the agent is idle, and is hidden the
		* moment a new turn starts (which is when the stale text would otherwise linger
		* under a fresh draft).
		* @param suggestion - the latest stored suggestion, or `null`.
		* @param running - whether the session agent is mid-turn.
		* @param draft - the current composer draft.
		* @returns the suggestion text to surface, or `undefined` to show nothing.
		*/
		function currentSuggestion(suggestion, running, draft) {
			if (running) return void 0;
			if (suggestion === null) return void 0;
			if (draft !== "") return void 0;
			return suggestion.text;
		}
		/**
		* Render the suggestion as placeholder text inside the composer; accept on the
		* configured shortcut (default Tab).
		*
		* @param props - standard session kit (session snapshot, input state, actions).
		*/
		function GhostSuggestion({ useSession, useInput, inputActions, sessionId }) {
			const suggestion = useStoredSuggestion(sessionId);
			const session = useSession((s) => s);
			const input = useInput((s) => s);
			const root = (0, react.useRef)(null);
			const floor = (0, react.useRef)({ sessionId, turn: 0, running: false });
			const [dismissed, dismiss] = (0, react.useState)(null);
			if (floor.current.sessionId !== sessionId) floor.current = { sessionId, turn: 0, running: false };
			if (session.running && !floor.current.running && suggestion !== null) floor.current.turn = Math.max(floor.current.turn, suggestion.turn + 1);
			floor.current.running = session.running;
			const key = suggestion === null ? null : `${sessionId}:${suggestion.turn}`;
			const eligible = !session.removed && !session.subagent && input?.phase === "plain" && input.attachmentIds.length === 0 && input.queue.length === 0 && suggestion?.turn >= floor.current.turn && dismissed !== key;
			const text = eligible ? currentSuggestion(suggestion, session.running, input.draft) : void 0;
			const acceptMatcher = (0, react.useMemo)(() => parseAcceptKey(suggestion?.acceptKey ?? DEFAULT_ACCEPT_KEY) ?? DEFAULT_ACCEPT_MATCHER, [suggestion?.acceptKey]);
			(0, react.useEffect)(() => {
				if (text === void 0) return;
				const card = root.current?.closest("[data-composer-card]");
				const editor = card?.querySelector("[data-composer-input]");
				if (editor == null) return;
				const onKeyDown = (event) => {
					if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || editor.hasAttribute("data-composer-composing")) return;
					if (event.target !== editor && !editor.contains(event.target)) return;
					if (!editor.isContentEditable || editor.getAttribute("aria-disabled") === "true") return;
					if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
						event.preventDefault();
						event.stopImmediatePropagation();
						dismiss(key);
						return;
					}
					if (!acceptMatcher(event) || input.draft !== "" || input.attachmentIds.length > 0) return;
					event.preventDefault();
					event.stopImmediatePropagation();
					inputActions.setDraft(text);
				};
				card.addEventListener("keydown", onKeyDown, true);
				return () => {
					card.removeEventListener("keydown", onKeyDown, true);
				};
			}, [
				text,
				acceptMatcher,
				inputActions,
				input,
				key
			]);
			(0, react.useEffect)(() => {
				styleUsers += 1;
				if (document.getElementById(STYLE_TAG_ID$1) === null) {
					const tag = document.createElement("style");
					tag.id = STYLE_TAG_ID$1;
					tag.textContent = CSS_TEXT;
					document.head.appendChild(tag);
				}
				return () => {
					styleUsers -= 1;
					if (styleUsers !== 0) return;
					document.getElementById(STYLE_TAG_ID$1)?.remove();
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: root,
				style: ROOT_STYLE,
				"data-suggest-prompt-ghost": "",
				children: text === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-suggest-prompt-ghost",
					"aria-hidden": true,
					children: text
				})
			});
		}
		//#endregion
		//#region src/browser/SettingsCard.tsx
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
		/** Style tag id owning this card's copy of the plugin-card chrome. */
		const STYLE_TAG_ID = "dsh-suggest-prompt-settings-style";
		/** The plugin-card chrome, mirrored from the harness PluginCard/fields modules. */
		const CARD_CSS = `
.dsh-sug-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
}
.dsh-sug-pending {
  flex: none;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-sug-body {
  padding: 0 16px 8px;
}
.dsh-sug-readonly {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-sug-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.dsh-sug-field + .dsh-sug-field { border-top: 1px solid var(--dsw-alias-border-l2); }
.dsh-sug-head { display: flex; align-items: center; gap: 8px; }
.dsh-sug-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-sug-badges { display: inline-flex; align-items: center; gap: 8px; }
.dsh-sug-badge {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  font-weight: 500;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-sug-reset {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-sug-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsh-sug-reset:disabled { cursor: default; }
.dsh-sug-input {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-sug-input:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-sug-input:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-sug-select { padding-right: 28px; }
.dsh-sug-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-sug-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-sug-failed {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-error);
}
.dsh-sug-discard,
.dsh-sug-save {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh-sug-discard {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-sug-discard:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-sug-save {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh-sug-discard:disabled,
.dsh-sug-save:disabled { opacity: 0.4; cursor: default; }
.dsh-sug-discard:focus-visible,
.dsh-sug-save:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`;
		/** One route field row mirroring the harness ValueField, with a select control. */
		function RouteField(props) {
			const { t, id, label, hint, state, field, options, selectable, onEdit, onReset } = props;
			const value = state[field];
			const disabled = !state.writable;
			const className = `dsh-sug-input${selectable ? " dsh-sug-select" : ""}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-sug-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-sug-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: "dsh-sug-label",
							htmlFor: id,
							children: label
						}), value.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-sug-badges",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-sug-badge",
								children: t("overridden")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-sug-reset",
								disabled,
								onClick: onReset,
								children: t("reset")
							})]
						}) : null]
					}),
					selectable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id,
						className,
						value: value.text,
						disabled,
						onChange: (event) => {
							onEdit(event.target.value);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("followRoute")
						}), options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: option.value,
							children: option.label
						}, option.value))]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id,
						className,
						type: "text",
						value: value.text,
						disabled,
						onChange: (event) => {
							onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-sug-hint",
						children: hint
					})
				]
			});
		}
		/**
		* A shortcut recorder field: focusing it arms capture, and the next key press
		* (a main key with any held modifiers, e.g. `Alt`+`Slash`) commits the combo
		* as its canonical spec (`Alt+Slash`). Pressing only modifiers keeps the
		* recording live; blurring without a main key cancels back to the stored value.
		*/
		function KeyRecorderField(props) {
			const { t, id, label, hint, state, onEdit, onReset } = props;
			const value = state.acceptKey;
			const disabled = !state.writable;
			const [armed, setArmed] = (0, react.useState)(false);
			const [pending, setPending] = (0, react.useState)("");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-sug-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-sug-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: "dsh-sug-label",
							htmlFor: id,
							children: label
						}), value.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-sug-badges",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-sug-badge",
								children: t("overridden")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-sug-reset",
								disabled,
								onClick: onReset,
								children: t("reset")
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id,
						className: "dsh-sug-input",
						type: "text",
						value: armed ? pending : value.text,
						readOnly: true,
						placeholder: armed ? t("pressKeys") : void 0,
						disabled,
						onFocus: () => {
							setPending("");
							setArmed(true);
						},
						onBlur: () => {
							setArmed(false);
							setPending("");
						},
						onKeyDown: (event) => {
							event.preventDefault();
							const spec = encodeKey(event.code, {
								alt: event.altKey,
								ctrl: event.ctrlKey,
								meta: event.metaKey,
								shift: event.shiftKey
							});
							if (spec === void 0) {
								setPending(modifierSpec(event.altKey, event.ctrlKey, event.metaKey, event.shiftKey));
								return;
							}
							onEdit(spec);
							setArmed(false);
							setPending("");
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-sug-hint",
						children: hint
					})
				]
			});
		}
		/** The canonical modifier-prefix string (`Alt+Ctrl`, empty when none held). */
		function modifierSpec(alt, ctrl, meta, shift) {
			const parts = [];
			if (alt) parts.push("Alt");
			if (ctrl) parts.push("Ctrl");
			if (meta) parts.push("Meta");
			if (shift) parts.push("Shift");
			return parts.join("+");
		}
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
		function SettingsCardSummary(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: props.t("description") });
		}
		/**
		* Render the suggest-prompt configuration entry.
		*
		* Branches on the view the Plugins page asked for, then delegates: the two
		* branches are separate components, so each has a constant hook count of its
		* own regardless of how the page renders them, or in what order.
		* @param props - locale copy, the requested view, the card snapshot, and its form actions.
		* @returns the summary line, or the configuration form.
		*/
		function SettingsCard(props) {
			const { t } = props;
			if (props.view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsCardSummary, { t });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardBody, {
				...props,
				t
			});
		}
		/**
		* The configuration form: the route pair and the accept shortcut, staged until
		* save. This is the body that both the plugin's own page (`plugins.item` with
		* `view: 'page'`) and the installed package's page (`plugins.bundle.config`)
		* render, and both entry points inject the same face, so a draft staged here is
		* the draft the other page shows.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the form, or nothing while the namespace is unavailable.
		*/
		function CardBody(props) {
			const { t } = props;
			const state = props.useSuggestPromptCard((snapshot) => snapshot);
			if (!state.available) return null;
			const blocked = !state.dirty || state.invalid || state.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", {
				id: STYLE_TAG_ID,
				children: CARD_CSS
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-sug-card",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-sug-body",
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-sug-readonly",
							children: t("readOnly")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteField, {
							t,
							id: "suggest-prompt-settings-provider",
							label: t("provider"),
							hint: t("providerHint"),
							state,
							field: "provider",
							options: state.providerOptions,
							selectable: state.providerOptions.length > 0,
							onEdit: (text) => {
								if (text === "") props.resetField("provider");
								else props.edit("provider", text);
							},
							onReset: () => {
								props.resetField("provider");
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteField, {
							t,
							id: "suggest-prompt-settings-model",
							label: t("model"),
							hint: t("modelHint"),
							state,
							field: "model",
							options: state.modelOptions,
							selectable: state.modelSelectable,
							onEdit: (text) => {
								if (text === "") props.resetField("model");
								else props.edit("model", text);
							},
							onReset: () => {
								props.resetField("model");
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeyRecorderField, {
							t,
							id: "suggest-prompt-settings-accept-key",
							label: t("acceptKey"),
							hint: t("acceptKeyHint"),
							state,
							onEdit: (text) => {
								props.edit("acceptKey", text);
							},
							onReset: () => {
								props.resetField("acceptKey");
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-sug-footer",
							children: [
								state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-sug-pending",
									children: t("unsaved")
								}) : null,
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsh-sug-failed",
									children: t("saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-sug-discard",
									disabled: !state.dirty || state.saving,
									onClick: props.discard,
									children: t("discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-sug-save",
									disabled: blocked,
									onClick: props.save,
									children: t(state.saving ? "saving" : "save")
								})
							]
						})
					]
				})
			})] });
		}
		//#endregion
		//#region src/browser/settings-controller.ts
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
		/**
		* Settings namespace of the suggest-prompt host plugin. In `dsh >= 0.2.0` a
		* plugin's settings namespace IS its profile entry id, so this is the id the
		* bundle patch mounts the host plugin under. Spelled here rather than imported:
		* a client package must not depend on a Host package, and the host plugin that
		* owns it spells the same value.
		*/
		const SUGGEST_PROMPT_NS = "suggest-prompt";
		/** The built-in DeepSeek adapter's provider route (spelled here, not imported). */
		const DEEPSEEK_PROVIDER = "deepseek-official";
		/** Bridges the entry config forms onto the card's staged form. */
		var SuggestPromptCardController = class {
			form;
			catalogForm;
			deepSeekForm;
			staged = /* @__PURE__ */ new Map();
			store;
			unsubscribers;
			saving = false;
			failed = false;
			/**
			* @param form - the config form of the `suggest-prompt` entry.
			* @param catalogForm - the read-only form for the `llm-pi-ai` provider catalog.
			* @param deepSeekForm - the read-only form for the built-in DeepSeek adapter.
			*/
			constructor(form, catalogForm, deepSeekForm) {
				this.form = form;
				this.catalogForm = catalogForm;
				this.deepSeekForm = deepSeekForm;
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.projection());
				this.unsubscribers = [
					form.subscribe(() => {
						this.publish();
					}),
					catalogForm.subscribe(() => {
						this.publish();
					}),
					deepSeekForm.subscribe(() => {
						this.publish();
					})
				];
			}
			/**
			* Stop observing the bound forms. Call once when the owning fiber unloads.
			*/
			dispose() {
				for (const unsubscribe of this.unsubscribers) unsubscribe();
				this.unsubscribers.length = 0;
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				return {
					hooks: { suggestPromptCard: this.store },
					...this.actions()
				};
			}
			/** The form actions bound to this controller. */
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.baseValue(field),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.publish();
					}
				};
			}
			/** Publish the card state projection. */
			projection() {
				const snapshot = this.form.getSnapshot();
				const section = snapshot.value ?? {};
				const providerOptions = this.catalogProviderOptions();
				const effectiveProvider = this.effectiveProvider(section);
				const catalogModels = this.catalogModels(effectiveProvider);
				const model = this.field("model", section.model);
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: this.staged.size > 0,
					invalid: false,
					saving: this.saving,
					failed: this.failed,
					provider: this.field("provider", section.provider),
					model,
					acceptKey: this.field("acceptKey", section.acceptKey),
					providerOptions,
					modelOptions: catalogModels.length > 0 && model.text !== "" && !catalogModels.some((o) => o.value === model.text) ? [{
						value: model.text,
						label: model.text
					}, ...catalogModels] : catalogModels,
					modelSelectable: catalogModels.length > 0
				};
			}
			/** One control's draft state: staged text, override presence, and validity. */
			field(field, value) {
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: typeof value === "string" ? value : "",
					overridden: this.stored(field),
					invalid: false
				};
				return {
					text: staged.clear ? "" : staged.text,
					overridden: !staged.clear,
					invalid: false
				};
			}
			/** The provider whose model list the card offers: the staged pick, else the entry value. */
			effectiveProvider(section) {
				const staged = this.staged.get("provider");
				if (staged !== void 0) return staged.clear ? "" : staged.text.trim();
				return typeof section.provider === "string" ? section.provider : "";
			}
			/** Provider options: the pi-ai catalog routes plus the built-in DeepSeek route. */
			catalogProviderOptions() {
				const options = [];
				if (this.deepSeekForm.getSnapshot().status === "ready") options.push({
					value: DEEPSEEK_PROVIDER,
					label: "DeepSeek"
				});
				const catalog = this.catalogForm.getSnapshot();
				if (catalog.status === "ready" && catalog.value?.providers !== void 0) for (const route of Object.keys(catalog.value.providers).sort()) options.push({
					value: route,
					label: route
				});
				return options;
			}
			/** Explicit model options one provider lists; empty means the catalog defaults apply. */
			catalogModels(provider) {
				if (provider === "") return [];
				const models = provider === DEEPSEEK_PROVIDER ? this.deepSeekForm.getSnapshot().value?.models : this.catalogForm.getSnapshot().status === "ready" ? this.catalogForm.getSnapshot().value?.providers?.[provider]?.models : void 0;
				return models === void 0 ? [] : models.map((model) => ({
					value: model.id,
					label: model.id
				}));
			}
			/** The composition-layer value one field reverts to once cleared. */
			baseValue(field) {
				const value = this.form.getSnapshot().base?.[field];
				return typeof value === "string" ? value : "";
			}
			/** Whether the user document layer carries this field (marks it overridden). */
			stored(field) {
				const user = this.form.getSnapshot().user;
				return user !== void 0 && Object.hasOwn(user, field);
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				if (field === "provider") {
					const provider = edit.clear ? "" : edit.text.trim();
					const section = this.form.getSnapshot().value ?? {};
					const stagedModel = this.staged.get("model");
					const model = stagedModel === void 0 ? this.stringValue(section.model) : stagedModel.clear ? "" : stagedModel.text.trim();
					if (!this.modelServes(model, provider)) {
						const base = this.baseValue("model");
						if (base !== "") this.staged.set("model", {
							text: base,
							clear: true
						});
						else this.staged.delete("model");
					}
				}
				this.publish();
			}
			/** Whether one model id the effective provider route would resolve to. */
			modelServes(model, provider) {
				if (model === "" || provider === "") return true;
				const models = this.catalogModels(provider);
				return models.length === 0 || models.some((option) => option.value === model);
			}
			/** Read one scalar as a string from a settings section, else ''. */
			stringValue(value) {
				return typeof value === "string" ? value : "";
			}
			/**
			* Write every staged edit, then re-seed from what the host accepted.
			*
			* The write contract ({@link ConfigForm.set}/{@link ConfigForm.unset})
			* resolves even when the document rejected the value — it folds/reloads
			* instead of throwing — so the edit is verified by reading the section back
			* after each write, not by relying on the promise to reject. A transport
			* failure does reject, which is the `catch` below.
			*/
			async save() {
				const writes = [...this.staged].flatMap(([field, edit]) => {
					if (edit.clear) return this.stored(field) ? [{
						field,
						run: () => this.form.unset(field)
					}] : [];
					const value = edit.text.trim();
					return value === "" ? [] : [{
						field,
						run: () => this.form.set(field, value)
					}];
				});
				for (const field of this.staged.keys()) if (!writes.some((write) => write.field === field)) this.staged.delete(field);
				if (writes.length === 0 || this.saving) {
					if (writes.length === 0) this.publish();
					return;
				}
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const write of writes) try {
					if (!await write.run()) landed = false;
				} catch {
					landed = false;
				}
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			publish() {
				this.store.set(this.projection());
			}
		};
		//#endregion
		//#region src/browser/settings-locales.ts
		/** English copy for the card. */
		const en = {
			title: "Suggested next prompt",
			description: "Model that generates the ghost suggestion after each turn",
			provider: "Provider",
			providerHint: "Registered pi-ai provider; choose \"follow session route\" to use the session model.",
			model: "Model",
			modelHint: "A model of the selected provider; choose \"follow session route\" to use the session model.",
			acceptKey: "Accept shortcut",
			acceptKeyHint: "Press the key (or key combo) you want; focus the field first.",
			pressKeys: "Press keys…",
			followRoute: "Follow session route",
			overridden: "overridden",
			reset: "Reset",
			readOnly: "Settings are read-only in this deployment.",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			unsaved: "Unsaved",
			saveFailed: "Save failed; the host rejected the values."
		};
		/** Simplified Chinese copy for the card. */
		const zh = {
			title: "建议提示词",
			description: "每轮结束后生成幽灵建议所使用的模型",
			provider: "Provider",
			providerHint: "已注册的 pi-ai provider；选择\"跟随会话路由\"则使用会话模型。",
			model: "Model",
			modelHint: "所选 provider 的模型；选择\"跟随会话路由\"则使用会话模型。",
			acceptKey: "接受快捷键",
			acceptKeyHint: "先点击该输入框获得焦点，然后按下你想用的按键（或组合键）。",
			pressKeys: "请按键…",
			followRoute: "跟随会话路由",
			overridden: "已覆盖",
			reset: "重置",
			readOnly: "当前部署下设置为只读。",
			save: "保存",
			saving: "保存中…",
			discard: "放弃",
			unsaved: "未保存",
			saveFailed: "保存失败：宿主拒绝了该值。"
		};
		//#endregion
		//#region src/browser/index.ts
		/** Locale namespace of the settings card copy. */
		const NS = "suggest-prompt.settings";
		/**
		* This package's name, which is the key its own bundle configuration registers
		* under.
		*
		* `plugins.bundle.config` is a **keyed** slot addressed by the *package* name,
		* not by the settings namespace: the page computes `configured` as
		* `ledger.bundles.has(pkg.name)`, so a namespace key (or an `id`, which a keyed
		* slot does not read at all) registers without erroring and then never matches
		* — the configuration section silently never renders.
		*
		* Spelled as a literal rather than imported from `package.json`: the client
		* bundle is a browser artifact, and pulling the manifest in would either inline
		* the whole file or need a bundler-specific JSON import. The value cannot drift
		* without the page losing the section outright, which is exactly what
		* tests/slot-contract.client.spec.tsx and scripts/verify-client-bundle.mjs
		* assert against.
		*/
		const PACKAGE_NAME = "@studyzy/dsh-suggest-prompt";
		/**
		* The official-plugins seat this plugin's configuration card occupies.
		*
		* A root-scoped **list** slot declared at runtime by the Plugins page (the
		* plugin-manager client bundle), alongside `plugins.bundle.config` and
		* `plugins.row.config`. It is not merged into `SlotMap` by any published type
		* package, so the key is spelled here; `ctx.slots.register` is generic over the
		* key at runtime, and only type-only imports stay free of the merge.
		*/
		const PLUGINS_ITEM = "plugins.item";
		/**
		* The per-bundle configuration seat, a root-scoped **keyed** slot.
		*
		* Declared by the same Plugins page as {@link PLUGINS_ITEM}. This package needs
		* it in addition to the official card because it is a *profile dependency*: it
		* is both a `bundles` member and a `dependencies` member of the profile, so the
		* page files it under the "Installed" group as a package card too. That card's
		* detail page — the one carrying the enable switch, which is where users look
		* first — renders its configuration from this seat, and only when `configured`
		* is true, i.e. only when this registration carries the package name as its key.
		*/
		const BUNDLE_CONFIG = "plugins.bundle.config";
		/** Registration order of the official-plugins card among the contributed cards. */
		const ITEM_ORDER = 30;
		/** Required services for the suggestion ghost bridge (the slot registry only). */
		const inject = ["slots"];
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
		function apply(ctx) {
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "suggest-prompt",
				order: 30
			}, (props) => GhostSuggestion(props)));
			ctx.inject(["configForms", "locale"], (settingsCtx) => {
				settingsCtx.effect(() => settingsCtx.locale.register(NS, {
					zh,
					en
				}), "ui-suggest-prompt: settings card dictionary");
				const t = settingsCtx.locale.bind(NS);
				const settings = new SuggestPromptCardController(settingsCtx.configForms.get(SUGGEST_PROMPT_NS), settingsCtx.configForms.get("llm-pi-ai"), settingsCtx.configForms.get("llm-deepseek"));
				settingsCtx.effect(() => () => {
					settings.dispose();
				}, "ui-suggest-prompt: settings card form observers");
				const face = settings.inject();
				settingsCtx.slots.inject(PLUGINS_ITEM, () => settingsCtx.slots.register({
					name: PLUGINS_ITEM,
					id: SUGGEST_PROMPT_NS,
					order: ITEM_ORDER,
					label: () => t("title"),
					locale: NS,
					inject: () => face
				}, SettingsCard));
				settingsCtx.slots.inject(BUNDLE_CONFIG, () => settingsCtx.slots.register({
					name: BUNDLE_CONFIG,
					key: PACKAGE_NAME,
					locale: NS,
					inject: () => face
				}, SettingsCard));
			});
		}
		//#endregion
		exports.GhostSuggestion = GhostSuggestion;
		exports.SUGGEST_PROMPT_NS = SUGGEST_PROMPT_NS;
		exports.SettingsCard = SettingsCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
