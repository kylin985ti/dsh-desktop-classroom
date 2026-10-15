import z from "@deepseek-ai/schemastery";
import { z as z$1 } from "zod";
import { MAX_TIMER_DELAY_MS, deadline } from "@deepseek-ai/dsh-timeout";
import { BlockAssembler, ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { deriveEventMessage } from "@deepseek-ai/dsh-session/surface";
//#region lib/types/sanitize.js
/**
* Transcript redaction, suggestion sanitization, and semantic output
* filtering for the suggest-prompt auxiliary call: nothing that reaches the
* model carries secret-shaped text, and nothing the model returns can inject
* terminal control into the web composer or read as meta-text instead of a
* real next prompt. Pure functions, exported for direct unit coverage.
* @module @studyzy/dsh-suggest-prompt/sanitize
*/
/** Common credential shapes masked before the transcript reaches the model. */
const SECRET_PATTERNS = [
	{
		pattern: /\bAKIA[0-9A-Z]{16}\b/g,
		label: "<aws-access-key-id>"
	},
	{
		pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
		label: "<secret-token>"
	},
	{
		pattern: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/g,
		label: "<github-token>"
	},
	{
		pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
		label: "<slack-token>"
	},
	{
		pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
		label: "<jwt>"
	},
	{
		pattern: /\brk_(live|test)_[A-Za-z0-9]{16,}\b/g,
		label: "<stripe-key>"
	}
];
/**
* Mask secret-shaped substrings so the auxiliary model never receives them.
* @param text - transcript text.
* @returns the same text with every matched secret replaced by a label.
*/
function redactSecrets(text) {
	let out = text;
	for (const { pattern, label } of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		out = out.replace(pattern, label);
	}
	return out;
}
/**
* ANSI/OSC/CSI/DCS escape sequences: CSI `ESC[ ...`, OSC `ESC] ... (BEL|ESC\)`,
* and the two-byte `ESC ( X` / `ESC # X` families.
*/
const ESCAPE_SEQUENCE = /\u001b(?:\[[0-9;:]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[()][0-9A-Za-z]|#[0-9A-Za-z])/g;
/** C0 controls (except tab/newline/CR), C1 controls, bidi overrides, and the chip placeholder. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFFFC]/g;
/** Fence delimiters the model may wrap the suggestion in. */
const FENCE_DELIMITER = /^(?:`{3,}|~{3,})[^\n]*\n?|\n?(?:`{3,}|~{3,})$/g;
/** One matched pair of surrounding quotes (optionally after a colon/label), stripped by replace. */
const QUOTED_OUTER = /^(?:.*?:\s*)?(["'“”‘’])([\s\S]*?)\1$/u;
/** Strip unpaired surrogate code units (an emoji's broken half cannot render). */
function stripLoneSurrogates(text) {
	let out = "";
	for (const char of text) {
		const code = char.charCodeAt(0);
		if (code >= 55296 && code <= 57343) continue;
		out += char;
	}
	return out;
}
/**
* Structurally clean one raw model output into composer-safe single-line
* text, without the length cap: control sequences, lone surrogates, fences,
* and surrounding quotes are stripped, and whitespace is collapsed.
* @param text - raw model output.
* @returns the cleaned single-line text.
*/
function cleanSuggestion(text) {
	let value = stripLoneSurrogates(text.replace(ESCAPE_SEQUENCE, "").replace(CONTROL_CHARS, ""));
	value = value.trim();
	value = value.replace(FENCE_DELIMITER, "").trim();
	value = value.replace(QUOTED_OUTER, "$2").trim();
	return value.replace(/\s+/g, " ").trim();
}
/**
* Sanitize one raw suggestion into composer-safe single-line text, truncating
* to the visible-character cap.
* @param text - raw model output.
* @param maxChars - hard visible-character cap (code points).
* @returns the sanitized text and whether it was truncated.
*/
function sanitizeSuggestion(text, maxChars) {
	const value = cleanSuggestion(text);
	const truncated = Array.from(value).length > maxChars;
	if (truncated) return {
		text: Array.from(value).slice(0, maxChars).join(""),
		truncated
	};
	return {
		text: value,
		truncated
	};
}
/**
* Report whether `text` contains a CJK unified ideograph. CJK text has no
* spaces, so word counts need this check; it also picks the suggestion
* language to match the conversation.
* @param text - inspected text.
* @returns true when any code point falls in the CJK unified ideographs range.
*/
function hasCJK(text) {
	for (const char of text) {
		const code = char.charCodeAt(0);
		if (code >= 19968 && code <= 40959) return true;
	}
	return false;
}
/** Meta-text the model might emit instead of a suggestion ("stay silent"). */
const SILENCE_META = /\bsilence\b|\bstay silent\b|\bno more\b/i;
/** Parenthesized or bracketed meta the model may wrap the whole reply in. */
const WRAPPED_META = /^\(.*\)$|^\[.*\]$/u;
/** Two ASCII sentences; CJK sentence punctuation is not space-separated. */
const MULTIPLE_SENTENCE = /[.!?]\s+[A-Z]/;
/** Markdown emphasis or a literal newline that survived sanitization. */
const FORMATTING = /[\n*]/;
const EVALUATIVE = new RegExp(`\\b(?:${[
	"thanks",
	"thank you",
	"looks good",
	"sounds good",
	"that works",
	"that worked",
	"that's all",
	"nice",
	"great",
	"perfect",
	"makes sense",
	"awesome",
	"excellent"
].join("|")})\\b|谢谢|感谢|不错|很好|很棒|太棒了|完美|没毛病`, "i");
const ASSISTANT_VOICE = new RegExp(`^(?:${[
	"let me",
	"i'll",
	"i've",
	"i'm",
	"i can",
	"i would",
	"i think",
	"i notice",
	"here's",
	"here is",
	"here are",
	"that's",
	"this is",
	"this will",
	"you can",
	"you should",
	"you could",
	"sure,",
	"of course",
	"certainly",
	"我来",
	"我帮你",
	"我建议",
	"我可以",
	"让我",
	"这可以",
	"这里可以"
].join("|")})`, "i");
/** Single-word suggestions only count as real next prompts when they are known user commands. */
const ALLOWED_SINGLE_WORDS = /* @__PURE__ */ new Set([
	"yes",
	"yeah",
	"yep",
	"yea",
	"yup",
	"sure",
	"ok",
	"okay",
	"push",
	"commit",
	"deploy",
	"stop",
	"continue",
	"check",
	"exit",
	"quit",
	"no",
	"继续",
	"好",
	"好的",
	"行",
	"可以",
	"提交",
	"推送",
	"停止",
	"退出",
	"完成",
	"检查",
	"部署",
	"测试",
	"运行"
]);
function isAllowedSingleWord(lower) {
	return ALLOWED_SINGLE_WORDS.has(lower) || lower.startsWith("/");
}
/**
* Reject raw model output that is not a usable next prompt: meta-text
* ("no suggestion", "stay silent"), evaluative filler, assistant-voice
* phrasing, multi-sentence or over-long output, or formatting. Returns true
* when the output should be treated as "no suggestion" instead of displayed.
* @param text - sanitized, single-line model output.
* @returns true when the suggestion should be dropped silently.
*/
function shouldFilterSuggestion(text) {
	const value = text.trim();
	if (value === "") return true;
	const lower = value.toLowerCase();
	const wordCount = value.split(/\s+/).filter(Boolean).length;
	if (lower === "done" || lower === "nothing found" || lower.startsWith("nothing to suggest") || lower.startsWith("no suggestion") || lower.startsWith("no follow-up") || SILENCE_META.test(lower)) return true;
	if (WRAPPED_META.test(value)) return true;
	if (lower.startsWith("api error:") || lower.startsWith("error:")) return true;
	if (hasCJK(value)) {
		if (Array.from(value).length < 2 && !isAllowedSingleWord(lower)) return true;
	} else {
		if (wordCount > 12) return true;
		if (wordCount < 2 && !isAllowedSingleWord(lower)) return true;
	}
	if (Buffer.byteLength(value, "utf8") >= 100) return true;
	if (MULTIPLE_SENTENCE.test(value)) return true;
	if (FORMATTING.test(value)) return true;
	if (EVALUATIVE.test(value)) return true;
	if (ASSISTANT_VOICE.test(value)) return true;
	return false;
}
//#endregion
//#region lib/types/generate.js
/**
* Bounded auxiliary suggestion generation: transcript framing, secret
* redaction, route resolution, deadline-fused LLM dispatch, and output
* sanitization. Generation is PURE with respect to durability: it returns the
* suggestion payload and the caller persists it through the plugin's own
* storage domain (see ./records.ts). Nothing is ever written to the session
* log — that is what made sessions unreadable (issue #4).
* @module @studyzy/dsh-suggest-prompt/generate
*/
var __addDisposableResource = function(env, value, async) {
	if (value !== null && value !== void 0) {
		if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
		var dispose, inner;
		if (async) {
			if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
			dispose = value[Symbol.asyncDispose];
		}
		if (dispose === void 0) {
			if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
			dispose = value[Symbol.dispose];
			if (async) inner = dispose;
		}
		if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
		if (inner) dispose = function() {
			try {
				inner.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		};
		env.stack.push({
			value,
			dispose,
			async
		});
	} else if (async) env.stack.push({ async: true });
	return value;
};
var __disposeResources = (function(SuppressedError) {
	return function(env) {
		function fail(e) {
			env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
			env.hasError = true;
		}
		var r, s = 0;
		function next() {
			while (r = env.stack.pop()) try {
				if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
				if (r.dispose) {
					var result = r.dispose.call(r.value);
					if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
						fail(e);
						return next();
					});
				} else s |= 1;
			} catch (e) {
				fail(e);
			}
			if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
			if (env.hasError) throw env.error;
		}
		return next();
	};
})(typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
	var e = new Error(message);
	return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** Capability-owned timeout reason code for auxiliary suggestion requests. */
const SUGGEST_PROMPT_TIMEOUT_CODE = "SUGGEST_PROMPT_TIMEOUT";
/**
* Suggestion generation is an opportunistic, must-be-fast-and-cheap auxiliary
* call: reasoning/thinking is disabled. `off` maps to `thinking: disabled` on
* the DeepSeek adapter and to `reasoning_effort: off` on OpenAI-compatible
* (pi-ai) routes, so the request never spends budget on a chain of thought.
*/
const SUGGEST_REASONING_EFFORT = ReasoningEffortId("off");
/**
* Informational purpose tag for auxiliary suggestion calls. The published
* `GenerateOptions['purpose']` union predates the suggest-prompt capability and
* no provider tailors transport for it yet, so the literal widens through
* `unknown` once; the runtime value stays `'suggest-prompt'` for providers that
* learn it later.
*/
const SUGGEST_PURPOSE = "suggest-prompt";
/** Complete configuration key set for direct construction validation. */
const CONFIG_KEYS = /* @__PURE__ */ new Set([
	"maxInputBytes",
	"maxOutputTokens",
	"timeoutMs",
	"maxRecentTurns",
	"maxTranscriptChars",
	"maxSuggestionChars",
	"provider",
	"model",
	"acceptKey"
]);
/** Validate one positive integer limit. */
function assertPositiveInteger(name, value) {
	if (!Number.isInteger(value) || value <= 0) throw new Error(`suggest-prompt: ${name} must be a positive integer`);
}
/**
* Read one configuration field as plain data.
*
* `dsh >= 0.2.0` settings expose a `volatile()`-marked field as a live
* reference (`{ get(), set() }`) rather than the value itself, so the loader
* hands this plugin reference objects for exactly the fields the settings form
* may edit live. Everything downstream wants plain JSON, so unwrap here — at
* the one boundary where untrusted config enters — rather than at each read.
* A non-reference value passes through unchanged, which keeps the plugin usable
* with a plain config object (tests, direct composition).
* @param value - a config field, possibly a volatile reference.
* @returns the plain value.
*/
function readConfigField(value) {
	if (value !== null && typeof value === "object" && typeof value.get === "function") return value.get();
	return value;
}
/**
* Unwrap every volatile reference in a config object, dropping `undefined`
* fields so an absent optional stays absent rather than becoming an explicit
* undefined key.
* @param config - the raw plugin config.
* @returns a plain object of resolved values.
*/
function unwrapVolatileFields(config) {
	const out = {};
	for (const [key, raw] of Object.entries(config)) {
		const value = readConfigField(raw);
		if (value !== void 0) out[key] = value;
	}
	return out;
}
/**
* Validate and detach the required suggestion policy.
* @param config - untrusted plugin configuration.
* @returns immutable policy with optional route absence preserved.
*/
function resolveSuggestPromptConfig(config) {
	const candidate = config;
	if (candidate === null || typeof candidate !== "object") throw new Error("suggest-prompt: configuration is required");
	const value = unwrapVolatileFields(candidate);
	for (const key of Object.keys(value)) if (!CONFIG_KEYS.has(key)) throw new Error(`suggest-prompt: unknown config key "${key}"`);
	assertPositiveInteger("maxInputBytes", value.maxInputBytes);
	assertPositiveInteger("maxOutputTokens", value.maxOutputTokens);
	assertPositiveInteger("timeoutMs", value.timeoutMs);
	if (value.maxRecentTurns !== void 0) assertPositiveInteger("maxRecentTurns", value.maxRecentTurns);
	assertPositiveInteger("maxTranscriptChars", value.maxTranscriptChars);
	assertPositiveInteger("maxSuggestionChars", value.maxSuggestionChars);
	if (value.timeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`suggest-prompt: timeoutMs must not exceed ${MAX_TIMER_DELAY_MS}`);
	if (value.provider !== void 0 && (typeof value.provider !== "string" || value.provider.length === 0)) throw new Error("suggest-prompt: provider override must be a non-empty string");
	if (value.model !== void 0 && (typeof value.model !== "string" || value.model.length === 0)) throw new Error("suggest-prompt: model override must be a non-empty string");
	if (value.acceptKey !== void 0 && (typeof value.acceptKey !== "string" || value.acceptKey.trim().length === 0)) throw new Error("suggest-prompt: acceptKey must be a non-empty shortcut string");
	return deepFreeze(Object.assign({}, value));
}
/**
* Stable instruction for the suggestion extraction call. The model is bound to
* predicting the user's next prompt in the user's own voice, forbidden from
* generating content or meta-text; `language` constrains the reply language to
* match the conversation.
* @param maxSuggestionChars - visible-character cap baked into the instruction.
* @param language - reply language ("简体中文" for CJK conversations, else "English").
*/
function systemPrompt(maxSuggestionChars, language) {
	return [
		"You are a prompt suggestion generator. Your ONLY purpose is to predict the user's next prompt in a coding-assistant chat — never to generate content.",
		"",
		"Your job:",
		"1. Read the user's most recent message and the assistant's final answer.",
		"2. Predict what the USER would naturally type next — not what the assistant should do.",
		"",
		"CRITICAL CONSTRAINTS:",
		"- You are NOT a code generator, writer, or task executor.",
		"- You MUST respond with ONLY the suggestion text, on a single line.",
		"- NEVER generate, implement, code, or produce any content.",
		"- NEVER provide explanations, reasoning, or extra text.",
		"- NEVER use quotes, labels, Markdown, XML, or formatting.",
		"- Be specific when you can — name files, functions, or actions.",
		"- If the next step is not obvious, reply with nothing at all.",
		"",
		"THE TEST: would the user think \"I was just about to type that\"?",
		"",
		"EXAMPLES:",
		"User asked \"fix the bug and run tests\", bug is fixed -> \"run the tests\"",
		"After code written -> \"try it out\"",
		"Assistant offers options -> pick the one the user would choose",
		"Assistant asks to continue -> \"yes\" or \"go ahead\"",
		"Task complete, obvious follow-up -> \"commit this\" or \"push it\"",
		"After an error or misunderstanding -> reply with nothing",
		"",
		"NEVER SUGGEST:",
		"- Evaluative feedback (\"looks good\", \"thanks\")",
		"- Questions (\"what about...?\")",
		"- Assistant-voice phrasing (\"Let me...\", \"I'll...\", \"Here's...\")",
		"- New ideas the user did not ask about",
		"- Multiple sentences",
		"",
		"Reply with ONLY the suggestion, 3-12 words, no quotes or explanation. If the next step is not obvious, reply with nothing.",
		"",
		`Language: ${language}`,
		`At most ${maxSuggestionChars} visible characters.`
	].join("\n");
}
/** Pick the reply language to match the user's last prompt (CJK → 简体中文). */
function suggestionLanguage(pairs) {
	for (const pair of [...pairs].reverse()) {
		if (pair.role !== "user") continue;
		return hasCJK(pair.text) ? "简体中文" : "English";
	}
	return "English";
}
/** Frame the kept pairs as labelled blocks so the model reads them as context. */
function frameTranscript(pairs) {
	const blocks = [];
	for (const pair of pairs) blocks.push(pair.role === "user" ? `[User Message]\n${pair.text}` : `[Assistant Response]\n${pair.text}`);
	return blocks.join("\n\n");
}
/** Keep the newest pairs while the budget lasts; always keep the newest one. */
function keepTail(pairs, budget) {
	let remaining = budget;
	let kept = 0;
	for (const pair of [...pairs].reverse()) {
		const cost = pair.role.length + pair.text.length + 2;
		if (cost > remaining && kept > 0) break;
		kept += 1;
		remaining -= cost;
	}
	return Math.max(1, kept);
}
/**
* Build the model-visible transcript from the retained fold state: user and
* assistant pairs of the last `maxRecentTurns` completed turns (default 1 —
* only the last completed turn's user input and assistant final answer),
* tail-trimmed to `maxTranscriptChars`.
*
* The state arrives pre-redacted and pre-filtered from
* `applyTranscriptProjection`; this function only bounds the window and the
* character budget. Reading fold state — rather than scanning session history
* — is what keeps the plugin clear of the deprecated synchronous history
* readers.
* @param state - the retained `suggestPromptTranscript` fold state.
* @param maxRecentTurns - completed-turn tail to include (1 keeps only the last turn).
* @param maxTranscriptChars - character budget for the kept tail.
* @returns the bounded transcript, or `undefined` when the window holds no text.
*/
function buildTranscript(state, maxRecentTurns, maxTranscriptChars) {
	const lastTurn = state.lastCompletedTurn;
	if (lastTurn === 0) return void 0;
	const cutoffTurn = Math.max(1, lastTurn - Math.max(1, maxRecentTurns) + 1);
	const inWindow = state.entries.filter((entry) => entry.turn >= cutoffTurn);
	if (inWindow.length === 0) return void 0;
	const pairs = inWindow.map((entry) => ({
		role: entry.role,
		text: entry.text
	}));
	const sourceMessageSeqs = inWindow.map((entry) => entry.seq);
	const keptCount = keepTail(pairs, Math.max(1, maxTranscriptChars));
	const kept = pairs.slice(pairs.length - keptCount);
	const keptSeqs = sourceMessageSeqs.slice(sourceMessageSeqs.length - keptCount);
	// A long answer must not evict the user's most recent request.
	if (!kept.some((pair) => pair.role === "user")) {
		const userIndex = pairs.findLastIndex((pair) => pair.role === "user");
		if (userIndex >= 0) {
			kept.unshift(pairs[userIndex]);
			keptSeqs.unshift(sourceMessageSeqs[userIndex]);
		}
	}
	return {
		pairs: kept,
		sourceMessageSeqs: keptSeqs,
		baseSeq: keptSeqs[keptSeqs.length - 1] ?? 0
	};
}
/**
* Resolve the effective route: an explicit override wins for a member, and a
* missing member falls back to the session's latest logged request route.
* @param session - session whose logged request header supplies the fallback.
* @param config - validated suggestion policy.
* @returns the complete route, or throws when neither a configured pair nor a
* logged session route supplies every member.
*/
function routeOf(session, config) {
	if (config.provider !== void 0 && config.model !== void 0) return {
		provider: config.provider,
		model: config.model
	};
	const route = session.requestHeader()?.config;
	const provider = config.provider ?? route?.provider;
	const model = config.model ?? route?.model;
	if (provider !== void 0 && model !== void 0 && provider.length > 0 && model.length > 0) return {
		provider,
		model
	};
	throw new Error("suggest-prompt: no complete route is available; configure provider and model, or run a turn that logs a session route");
}
/** Translate terminal finish reasons into an auxiliary-call failure. */
function finishError(finish) {
	switch (finish.kind) {
		case "stop": return;
		case "error":
		case "aborted": {
			const error = new Error(finish.failure.message);
			error.code = finish.failure.code;
			return error;
		}
		case "max-tokens": return /* @__PURE__ */ new Error("suggest-prompt: suggestion output reached maxOutputTokens");
		case "tool-calls": return /* @__PURE__ */ new Error("suggest-prompt: suggestion model unexpectedly requested a tool");
		/* v8 ignore next 2 -- FinishReason is a closed five-member union; this default cannot be reached */
		default: return /* @__PURE__ */ new Error(`suggest-prompt: unsupported finish reason "${String(finish.kind)}"`);
	}
}
/**
* Generate one suggestion for a completed turn through the shared auxiliary
* LLM call.
* @param ctx - context exposing the registered LLM service.
* @param config - validated suggestion policy.
* @param session - owning session log.
* @param turn - completed turn whose completion this suggestion answers.
* @param signal - cancellation forwarded to the auxiliary call.
* @returns the generated suggestion payload, or `undefined` when the model
* produced no usable suggestion (an empty or semantically rejectable reply —
* the system prompt tells it to reply with nothing when the next step is not
* obvious). Genuine failures throw. Persisting the result is the caller's job.
*/
// Bound the actual UTF-8 request, including labels. Keep both
// the user's intent and the end of the latest answer when a message is large.
function boundedFrameTranscript(pairs, maxBytes) {
	const bounded = pairs.map((pair) => ({ ...pair }));
	let framed = frameTranscript(bounded);
	while (Buffer.byteLength(framed, "utf8") > maxBytes) {
		const largest = bounded.reduce((index, pair, i) => pair.text.length > bounded[index].text.length ? i : index, 0);
		const points = Array.from(bounded[largest].text);
		if (points.length < 32) throw new Error("suggest-prompt: input budget is too small");
		const keep = Math.floor(points.length * 0.75);
		const head = Math.floor(keep / 3);
		bounded[largest].text = points.slice(0, head).join("") + "\n[…]\n" + points.slice(-(keep - head)).join("");
		framed = frameTranscript(bounded);
	}
	return framed;
}
async function generateSuggestion(ctx, config, session, turn, transcriptState, signal) {
	const env_1 = {
		stack: [],
		error: void 0,
		hasError: false
	};
	try {
		signal.throwIfAborted();
		const transcript = buildTranscript(transcriptState, config.maxRecentTurns ?? 1, config.maxTranscriptChars);
		if (transcript === void 0) throw new Error("suggest-prompt: session has no model-visible transcript to suggest from");
		const route = routeOf(session, config);
		const language = suggestionLanguage(transcript.pairs);
		const system = systemPrompt(config.maxSuggestionChars, language);
		const framed = boundedFrameTranscript(transcript.pairs, config.maxInputBytes);
		const inputBytes = Buffer.byteLength(framed, "utf8");
		if (inputBytes > config.maxInputBytes) throw new Error(`suggest-prompt: input is ${inputBytes} bytes, exceeding maxInputBytes ${config.maxInputBytes}`);
		const messages = [createUserMessage({
			content: [{
				type: "text",
				text: framed
			}],
			source: {
				kind: "suggest-prompt",
				plugin: "dsh-suggest-prompt",
				form: "transcript"
			}
		})];
		const callDeadline = __addDisposableResource(env_1, deadline(signal, config.timeoutMs, SUGGEST_PROMPT_TIMEOUT_CODE), false);
		const requestOptions = (reasoningOff) => deepFreeze({
			provider: route.provider,
			model: route.model,
			messages,
			system,
			maxTokens: config.maxOutputTokens,
			sessionId: session.id,
			purpose: SUGGEST_PURPOSE,
			...reasoningOff ? { reasoningEffort: SUGGEST_REASONING_EFFORT } : {},
			signal: callDeadline.signal
		});
		callDeadline.signal.throwIfAborted();
		const drain = async (options) => {
			const assembler = new BlockAssembler();
			for await (const chunk of ctx.llm.stream(options)) {
				callDeadline.signal.throwIfAborted();
				assembler.push(chunk);
			}
			callDeadline.signal.throwIfAborted();
			const terminalError = finishError(assembler.finish);
			if (terminalError !== void 0) throw terminalError;
			return assembler.blocks();
		};
		let blocks;
		try {
			blocks = await drain(requestOptions(true));
		} catch (error) {
			if (error?.code !== "UNSUPPORTED_REASONING_EFFORT") throw error;
			blocks = await drain(requestOptions(false));
		}
		if (blocks.some((block) => block.type === "tool-call")) throw new Error("suggest-prompt: suggestion output must contain text only");
		const cleaned = cleanSuggestion(blocks.filter((block) => block.type === "text").map((block) => block.text).join(" "));
		if (cleaned.length === 0 || shouldFilterSuggestion(cleaned)) return;
		const { text: suggestion, truncated } = sanitizeSuggestion(cleaned, config.maxSuggestionChars);
		return {
			version: 1,
			turn,
			baseSeq: transcript.baseSeq,
			text: suggestion,
			truncated,
			route,
			acceptKey: config.acceptKey ?? "Tab"
		};
	} catch (e_1) {
		env_1.error = e_1;
		env_1.hasError = true;
	} finally {
		__disposeResources(env_1);
	}
}
//#endregion
//#region lib/types/records.js
/**
* The durable suggestion store: how a suggestion is persisted and reloaded
* without ever touching the session log.
*
* Issue #4 history (why this is NOT a session event): the pre-1.2 build wrote
* `suggest-prompt/request` and `suggest-prompt/suggested` through
* `Session.append`. Those types are outside the harness's closed
* `KNOWN_SESSION_EVENT_TYPES`, and `0.2.0-rc.2` offers no way to mark an
* appended event `ignorable`, so `validateStoredEvents` refused the whole log
* on the next cold read — every session that completed one suggestion became
* unloadable. The 1.2.0 answer was an `appendPluginRecord` record, which
* rc.2 does not have either; gating generation on that API's presence left
* the feature permanently disabled on the shipped desktop app (a regression).
*
* This module takes the third path, and the one the plugin's own scope always
* implied: a suggestion is plugin-owned derived state, so it belongs in the
* plugin's own storage — not in the agent's conversation log at all. The
* `domain` form of `ctx.storage` is mounted by `@deepseek-ai/dsh-base`, which
* every profile composes, so this channel exists on rc.2 and on any future
* harness, and it needs no harness change and no app repackaging. With zero
* session-log writes, issue #4 cannot recur by construction.
*
* Records live one per session under the `suggest_prompt` domain
* (`<dshHome>/storages/suggest_prompt/sessions/`), so a write rewrites one
* session's document. The record is disposable derived data: an unreadable
* record is backed up and skipped rather than failing the boot.
* @module @studyzy/dsh-suggest-prompt/records
*/
/** The stored-record name; also the domain's identity on the medium. */
const SUGGEST_DOMAIN_NAME = "suggest_prompt";
/** Validates one stored suggestion record at the durable boundary. */
const storedSuggestionSchema = z$1.object({
	version: z$1.literal(1),
	turn: z$1.number().int().positive(),
	baseSeq: z$1.number().int().nonnegative(),
	text: z$1.string().min(1),
	truncated: z$1.boolean(),
	acceptKey: z$1.string().min(1),
	route: z$1.object({
		provider: z$1.string().min(1),
		model: z$1.string().min(1)
	}).optional()
});
/**
* The suggestion domain: one `sessions` table keyed by session id, each record
* the complete latest suggestion (whole-value discipline — the record is
* replaced, never patched). `per-record` layout keeps a write to one session's
* document rather than the whole unit.
*
* `invalidRecords: 'backup-and-skip'`: a record that fails the schema is
* disposable derived data, so it must never cost the boot — the domain layer
* moves the document aside and serves the session with no stored suggestion.
*/
const suggestPromptDomainSpec = defineDomain({
	name: SUGGEST_DOMAIN_NAME,
	version: 1,
	layout: "per-record",
	invalidRecords: "backup-and-skip",
	tables: { sessions: domainTable(storedSuggestionSchema) }
});
/**
* The suggestion payload as persisted: the projection value plus the record
* version. Deliberately not the projection type itself — a stored record is
* owner-validated data whose schema is a durable contract.
* @param suggestion - the generated suggestion.
* @returns the record to store.
*/
function toStoredRecord(suggestion) {
	return {
		version: 1,
		turn: suggestion.turn,
		baseSeq: suggestion.baseSeq,
		text: suggestion.text,
		truncated: suggestion.truncated,
		acceptKey: suggestion.acceptKey,
		...suggestion.route !== void 0 ? { route: suggestion.route } : {}
	};
}
/**
* Project one stored record onto the wire value the client reads.
* @param record - a validated stored record.
* @returns the suggestion payload, or `undefined` when the record is unusable.
*/
function toSuggestion(record) {
	const parsed = storedSuggestionSchema.safeParse(record);
	if (!parsed.success) return void 0;
	const stored = parsed.data;
	return {
		turn: stored.turn,
		baseSeq: stored.baseSeq,
		text: stored.text,
		truncated: stored.truncated,
		acceptKey: stored.acceptKey,
		...stored.route !== void 0 ? { route: stored.route } : {}
	};
}
/**
* Read one session's stored suggestion.
*
* A record read back is validated before it is trusted: the harness leaves
* record data to its owner, so an earlier build — or a hand edit — may have
* written a shape this build does not accept.
* @param domain - the opened suggestion domain.
* @param sessionId - the session whose record is read.
* @returns the stored suggestion, or `undefined` when none is usable.
*/
function readSuggestion(domain, sessionId) {
	return toSuggestion(domain.table("sessions").get(sessionId));
}
/**
* Persist one suggestion for a session, replacing any previous record.
*
* Awaited by the caller so a generation is durable before its in-flight slot
* clears; a failed write surfaces as the generation's failure rather than
* leaving the composer showing state the medium never accepted.
* @param domain - the opened suggestion domain.
* @param sessionId - the session whose suggestion is stored.
* @param suggestion - the generated suggestion.
*/
async function writeSuggestion(domain, sessionId, suggestion) {
	await domain.table("sessions").put(sessionId, toStoredRecord(suggestion));
}
/**
* Drop one session's stored suggestion.
* @param domain - the opened suggestion domain.
* @param sessionId - the session whose record is removed.
* @returns whether a record was present.
*/
async function clearSuggestion(domain, sessionId) {
	return await domain.table("sessions").delete(sessionId);
}
/** The empty fold: no completed turn, no retained pair, no prior suggestion. */
const EMPTY_TRANSCRIPT_STATE = Object.freeze({
	lastCompletedTurn: 0,
	turnStarts: [],
	entries: [],
	lastSuggestedTurn: -1
});
/** Render a message's text blocks; non-text blocks contribute nothing. */
function renderMessageText(message) {
	let out = "";
	for (const block of message.content) if (block.type === "text") out += block.text;
	return out;
}
/**
* The retained entry for one user/assistant message event, or `undefined` when
* the event carries nothing the suggestion prompt may see.
*
* Harness-injected context is excluded here for the same reason it was
* excluded from the old log scan: the workspace instructions, the runtime
* snapshot and the skill catalog are written as `user/message` events, can be
* very large, and are not the user's own words. Only `source.kind === 'user'`
* counts as genuine typed input.
* @param event - a committed `user/message` or `assistant/message` event.
* @param turn - turn the event belongs to.
* @returns the retained entry, or `undefined` when the event contributes no text.
*/
function retainedEntry(event, turn) {
	const message = deriveEventMessage(event);
	if (message === null) return void 0;
	const text = renderMessageText(message).trim();
	if (text.length === 0) return void 0;
	if (message.role === "user" && message.source.kind !== "user") return void 0;
	return {
		seq: event.seq,
		role: message.role === "user" ? "user" : "assistant",
		text: redactSecrets(text),
		turn
	};
}
/** Drop turn-start rows older than the retained window. */
function trimTurnStarts(turnStarts) {
	const cutoff = turnStarts.length - 5;
	return cutoff > 0 ? turnStarts.slice(cutoff) : turnStarts;
}
/**
* Pure transition for the `suggestPromptTranscript` unit: fold one committed
* event into the retained transcript state. Returns the same reference for
* every event the unit does not retain, which is what keeps the projection
* drive's `Object.is` gate cheap.
* @param state - the fold covering all prior events.
* @param event - the next committed session event.
* @returns the next state (same reference when the event is not retained).
*/
function applyTranscriptProjection(state, event) {
	switch (event.type) {
		case "turn/start": return {
			...state,
			turnStarts: trimTurnStarts([...state.turnStarts, {
				turn: event.data.turn,
				seq: event.seq
			}])
		};
		case "turn/end": {
			const completed = {
				...state,
				lastCompletedTurn: event.data.turn
			};
			const cutoffTurn = Math.max(1, event.data.turn - 4 + 1);
			const kept = state.entries.filter((entry) => entry.turn >= cutoffTurn);
			return kept.length === state.entries.length ? completed : {
				...completed,
				entries: kept
			};
		}
		case "user/message":
		case "assistant/message": {
			const entry = retainedEntry(event, state.lastCompletedTurn + 1);
			if (entry === void 0) return state;
			return {
				...state,
				entries: [...state.entries, entry]
			};
		}
		default: return state;
	}
}
//#endregion
//#region lib/types/rpc-contract.js
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
//#endregion
//#region lib/types/index.js
/**
* suggest-prompt plugin: after every completed agent turn, generate one
* suggested next prompt for the user through a bounded auxiliary LLM call and
* deliver it to the web composer, which renders it as ghost placeholder text.
*
* Delivery does NOT go through the session log. The pre-1.2 build appended
* private `SessionEventMap` types (`suggest-prompt/…`), which are outside the
* harness's closed `KNOWN_SESSION_EVENT_TYPES`; `0.2.0-rc.2` offers no way to
* mark an appended event `ignorable`, so `validateStoredEvents` refused the
* whole log on the next cold read and the session could not be reopened
* (issue #4). A suggestion is plugin-owned derived state, so it is persisted in
* this plugin's own storage domain and served to the browser over a
* plugin-owned `connection.rpc` channel. With zero session-log writes, issue #4
* cannot recur by construction.
*
* The plugin is scoped to the projection registry, whose host-only transcript
* fold supplies the bounded transcript: generation reads that fold rather than
* scanning session history, which `dsh >= 0.2.0` deprecates for new callers.
* @module @studyzy/dsh-suggest-prompt
*/
/** Persisted-state schema of the host-only `suggestPromptTranscript` fold. */
const transcriptStateSchema = z$1.object({
	lastCompletedTurn: z$1.number().int().nonnegative(),
	turnStarts: z$1.array(z$1.object({
		turn: z$1.number().int().positive(),
		seq: z$1.number().int().nonnegative()
	})),
	entries: z$1.array(z$1.object({
		seq: z$1.number().int().nonnegative(),
		role: z$1.union([z$1.literal("user"), z$1.literal("assistant")]),
		text: z$1.string(),
		turn: z$1.number().int().positive()
	})),
	lastSuggestedTurn: z$1.number().int().min(-1)
});
/**
* Exported loader schema. Cast to the runtime shape: `volatile()` only affects
* how the settings form projects the field, not the value the plugin receives.
*/
const Config = z.object({
	maxInputBytes: z.number().step(1).min(1).required(),
	maxOutputTokens: z.number().step(1).min(1).required(),
	timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
	maxRecentTurns: z.number().step(1).min(1).default(1),
	maxTranscriptChars: z.number().step(1).min(1).required(),
	maxSuggestionChars: z.number().step(1).min(1).required(),
	provider: z.string().volatile(),
	model: z.string().volatile(),
	acceptKey: z.string().default("Tab").volatile()
});
/** Cordis plugin identity. */
const name = "suggest-prompt";
/**
* Services required before this plugin activates. `storageDomain` is the
* durable suggestion store (`@deepseek-ai/dsh-base` mounts it, so it is present
* in every profile); `connection` carries the shared `/api` gateway this
* plugin's browser route hangs off.
*
* `webServer` is deliberately NOT here. The plugin never touches it: it
* registers through `connection.fetch.register`, which writes only to the
* connection service's own route table. The sibling surface `rpc.handle` does
* read `owner.webServer`, but on the *connection* fiber — which injects neither
* `webServer` nor anything that provides it — so that call throws there
* regardless of this plugin's own list. See `SUGGEST_ROUTE_PATH`.
*/
const inject = [
	"llm",
	"sessions",
	"storageDomain",
	"connection"
];
/**
* Settings namespace of the suggestion route. `dsh >= 0.2.0` keys a plugin's
* settings page by its profile entry id and derives the form from the plugin's
* own `Config` schema, so this value names that entry/page rather than a
* separately registered namespace. It is what the WebUI settings card binds to
* and what `configEditor` writes through.
*/
const SUGGEST_PROMPT_NS = "suggest-prompt";
/**
* Narrow an untrusted RPC payload to the session id the caller asked about.
* @param payload - decoded request payload.
* @returns the session id, or `undefined` when the payload is malformed.
*/
function sessionIdOf(payload) {
	if (typeof payload !== "object" || payload === null) return void 0;
	const candidate = payload.sessionId;
	return typeof candidate === "string" && candidate.length > 0 ? candidate : void 0;
}
/**
* Mount the plugin: open the suggestion store, expose the browser read
* endpoint, and generate one suggestion per completed turn.
* @param ctx - context exposing LLM, session, storage, and connection services.
* @param config - required bounded-generation policy.
*/
function apply(ctx, config) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		applyWithProjections(projectionCtx, config);
	});
}
/**
* Body of the plugin once the projection registry is present.
*
* The domain open is asynchronous, so the body is async and every reader awaits
* the same open promise: the browser endpoint answers `null` until the store is
* ready rather than failing, and generation waits for it before its first
* write.
* @param ctx - context exposing the LLM, session, projection, storage, and connection services.
* @param config - required bounded-generation policy.
*/
function applyWithProjections(ctx, config) {
	const states = /* @__PURE__ */ new Map();
	const latestTurns = /* @__PURE__ */ new Map();
	const tracked = /* @__PURE__ */ new Set();
	let domainPromise;
	const domain = () => {
		domainPromise ??= ctx.storageDomain.open(suggestPromptDomainSpec);
		return domainPromise;
	};
	/** The retained transcript fold for one session. */
	const transcriptStateOf = (session) => ctx.sessionProjections.stateOf(session, "suggestPromptTranscript") ?? EMPTY_TRANSCRIPT_STATE;
	/**
	* Answer one browser read. Every failure mode resolves to `null` rather than
	* throwing: the caller is the composer, which renders "no suggestion" for an
	* absent value and nothing at all for an error.
	* @param request - the buffered POST the browser sent.
	* @returns the stored suggestion, or `null` when there is none to show.
	*/
	const readForBrowserRequest = async (request) => {
		let body;
		try {
			body = await request.json();
		} catch {
			return null;
		}
		const sessionId = sessionIdOf(body);
		if (sessionId === void 0) return null;
		const suggestion = readSuggestion(await domain(), sessionId);
		if (suggestion === void 0) return null;
		const latest = latestTurns.get(sessionId);
		if (latest !== void 0 && (!latest.completed || latest.turn !== suggestion.turn)) return null;
		const live = ctx.sessions.get(sessionId);
		const liveTurn = live === void 0 ? void 0 : transcriptStateOf(live).turnStarts.at(-1)?.turn;
		if (liveTurn !== void 0 && liveTurn !== suggestion.turn) return null;
		return suggestion;
	};
	const handleTurnEnd = (session, turn) => {
		let state = states.get(session.id);
		if (state === void 0) {
			state = {
				lastSuggestedTurn: -1,
				pending: void 0
			};
			states.set(session.id, state);
			tracked.add(state);
		}
		if (state.pending?.turn === turn) return;
		const pending = state.pending;
		if (pending !== void 0) pending.controller.abort();
		const controller = new AbortController();
		state.pending = {
			turn,
			controller
		};
		const resolved = resolveSuggestPromptConfig(config);
		/**
		* Retire the previous turn's suggestion before generating this one.
		*
		* Without this the browser serves the *superseded* suggestion for the whole
		* duration of the new generation: the composer stops hiding ghost text the
		* moment the turn ends, the poll then reads a store that still holds the
		* older turn's text, and only the write at the end of this function
		* displaces it. The user sees the old prompt flash and then swap — the
		* stale window is exactly the model's latency, which is why it reads as
		* "about a second".
		*
		* Clearing is a microtask that races generation but NOT the poll: the read
		* path stays a single awaited step of the same async chain that does the
		* work, so a poll landing in between answers `null` ("no suggestion yet")
		* rather than a retracted one. A cleared store is also honest about what
		* the host knows at that instant — this turn has no suggestion yet.
		*
		* A failed clear is not fatal: it costs the stale flash, not correctness,
		* and the write below still lands. It is reported once so a persistently
		* unwritable store is not silent.
		* @returns nothing; the clear is awaited by the caller's chain.
		*/
		const retirePrevious = async () => {
			if (state.lastSuggestedTurn < 0) return;
			try {
				const opened = await domain();
				if (state.pending?.controller !== controller) return;
				await clearSuggestion(opened, session.id);
			} catch (error) {
				if (state.pending?.controller !== controller) return;
				const message = error instanceof Error ? error.message : String(error);
				ctx.logger.warn(`suggest-prompt: could not retire the previous suggestion: ${message}`);
			}
		};
		/**
		* Whether this turn already has a durable suggestion.
		*
		* The cursor is seeded from the store, not from the log: a session reopened
		* from history must not regenerate a turn it already answered. The read is
		* awaited (not fired alongside generation) because the decision it informs
		* is whether to call the model at all — racing it would let every reload
		* issue one redundant request before the seed landed.
		* @returns true when the stored record already answers this turn.
		*/
		const alreadySuggested = async () => {
			if (state.lastSuggestedTurn >= turn) return true;
			const stored = readSuggestion(await domain(), session.id);
			if (stored === void 0) return false;
			state.lastSuggestedTurn = Math.max(state.lastSuggestedTurn, stored.turn);
			return state.lastSuggestedTurn >= turn;
		};
		/**
		* Persist one generated suggestion, or advance the cursor for a silent
		* no-suggestion.
		*
		* Separate from the settling callback so a WRITE failure reaches the same
		* reporting path as a generation failure: an `async` fulfillment handler's
		* rejection is NOT delivered to the sibling rejection handler, so inlining
		* this would let a failed write escape as an unhandled rejection.
		*
		* A superseding turn that started while the store was opening drops the
		* write — persisting then would resurrect a suggestion the user already
		* moved past.
		* @param suggested - the generated suggestion, or `undefined` when the
		*   model produced nothing usable.
		*/
		const persist = async (suggested) => {
			if (suggested === void 0) {
				if (state.pending?.controller !== controller) return;
				state.pending = void 0;
				state.lastSuggestedTurn = turn;
				return;
			}
			const opened = await domain();
			if (state.pending?.controller !== controller) return;
			const latest = latestTurns.get(session.id);
			if (controller.signal.aborted || latest?.turn !== turn || latest.completed !== true) return;
			await writeSuggestion(opened, session.id, suggested);
			if (state.pending?.controller !== controller) return;
			state.pending = void 0;
			state.lastSuggestedTurn = turn;
		};
		/**
		* Report one failed generation or write.
		* @param error - the rejection reason.
		*/
		const reportFailure = (error) => {
			if (state.pending?.controller === controller) state.pending = void 0;
			if (controller.signal.aborted) return;
			/* v8 ignore next 2 -- non-Error rejections are wrapped by the LLM layer */
			const message = error instanceof Error ? error.message : String(error);
			ctx.logger.warn(`suggest-prompt: suggestion generation failed: ${message}`);
		};
		Promise.resolve().then(async () => {
			if (await alreadySuggested()) return;
			if (state.pending?.controller !== controller) return;
			await retirePrevious();
			if (state.pending?.controller !== controller) return;
			return await generateSuggestion(ctx, resolved, session, turn, transcriptStateOf(session), controller.signal);
		}).then((suggested) => persist(suggested), (error) => {
			reportFailure(error);
		}).catch((error) => {
			reportFailure(error);
		});
	};
	ctx.on("session/event", (session, event) => {
		if (event.type === "turn/start") {
			const turn = event.data.turn;
			latestTurns.set(session.id, { turn, completed: false });
			const state = states.get(session.id);
			state?.pending?.controller.abort();
			if (state !== void 0) state.pending = void 0;
			// Never reenter the synchronous session notification or write its log.
			Promise.resolve().then(async () => {
				const opened = await domain();
				const stored = readSuggestion(opened, session.id);
				if (stored !== void 0 && stored.turn < turn) await clearSuggestion(opened, session.id);
			}).catch(() => {});
		} else if (event.type === "turn/end") {
			const completed = event.data.reason.kind === "completed";
			latestTurns.set(session.id, { turn: event.data.turn, completed });
			if (completed) handleTurnEnd(session, event.data.turn);
		}
	});
	ctx.effect(() => () => {
		for (const state of tracked) state.pending?.controller.abort();
	});
	ctx.effect(() => ctx.connection.fetch.register({
		path: SUGGEST_ROUTE_PATH,
		methods: [SUGGEST_ROUTE_METHOD],
		requestBody: "buffered",
		fetch: async (request) => {
			const suggestion = await readForBrowserRequest(request);
			return Response.json({ suggestion });
		}
	}), "suggest-prompt: browser suggestion route");
	ctx.sessionProjections.register({
		key: "suggestPromptTranscript",
		stateSchema: transcriptStateSchema,
		init: () => EMPTY_TRANSCRIPT_STATE,
		apply: applyTranscriptProjection,
		stateVersion: 1
	});
}
//#endregion
export { Config, SUGGEST_PROMPT_NS, SUGGEST_ROUTE_METHOD, SUGGEST_ROUTE_PATH, apply, inject, name };
