// Compatible with DSH Desktop 0.11.1 / Harness 0.2.0-rc.2.
// Tavily-backed search provider for the DeepSeek Harness web capability seam.
// Registers a provider with `ctx.web` under the stable id "tavily".
//
// The provider calls the Tavily Search API (https://api.tavily.com/search) and
// normalizes the response into the seam's WebSearchResult shape.
//
// Credential resolution mirrors the shipped DeepSeek provider: a literal
// `apiKey` in config wins, otherwise the `apiKeyEnv` credential ref is resolved
// through the credentials service, falling back to the launch environment
// (process.env / $DSH_HOME/.env).
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";

/** Stable id this provider registers under. */
const TAVILY_PROVIDER_ID = "tavily";
/** Tavily Search API endpoint. */
const TAVILY_DEFAULT_BASE_URL = "https://api.tavily.com/search";
/** Default result count requested from Tavily. */
const TAVILY_DEFAULT_MAX_RESULTS = 5;
/** Default search depth. */
const TAVILY_DEFAULT_SEARCH_DEPTH = "basic";
/** Attribution header sent on every request. */
const USER_AGENT = "deepseek-harness/0.2.0-rc.2 (Tavily provider)";

/**
 * Map a Tavily search response to the normalized seam result. Tavily returns
 * `results[]` with `title`/`url`/`content`/`score` and an optional `answer`.
 */
function mapTavilyResponse(response) {
	const sources = (response.results ?? []).map((item) => ({
		url: item.url,
		...item.title != null && item.title.length > 0 ? { title: item.title } : {},
		...item.content != null && item.content.length > 0 ? { snippet: item.content } : {}
	}));
	return {
		...response.answer != null && response.answer.length > 0 ? { content: response.answer } : {},
		sources,
		truncated: false
	};
}

/** The Tavily-backed search provider. */
var TavilySearchProvider = class {
	resolveOptions;
	id = TAVILY_PROVIDER_ID;
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		const options = this.resolveOptions();
		return (options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== void 0;
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		const body = {
			query: request.query,
			max_results: Math.min(request.maxResults ?? options.maxResults, options.maxResults),
			search_depth: options.searchDepth
		};
		options.recordRequest?.({
			endpoint: options.baseURL,
			body
		});
		throwIfSearchAborted(signal);
		let response;
		try {
			response = await fetch(options.baseURL, {
				method: "POST",
				redirect: "error",
				headers: {
					"authorization": `Bearer ${apiKey}`,
					"content-type": "application/json",
					"accept": "application/json",
					"user-agent": USER_AGENT
				},
				body: JSON.stringify(body),
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Tavily search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `Tavily API error (HTTP ${response.status})`;
			try {
				const parsed = await response.json();
				const detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
				if (detail !== void 0 && detail.length > 0) message = detail;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}
		try {
			return mapTavilyResponse(await response.json());
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`Tavily returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Tavily search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (resolved !== void 0 && resolved.length > 0) return resolved;
		throw new WebError(`Tavily search has no API key for "${options.apiKeyEnv ?? "TAVILY_API_KEY"}"; store it through the credentials service, export it in the launching environment, or set a literal "apiKey" in the web-search-tavily config`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
};

/** Race a same-process asynchronous preflight against caller cancellation. */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(searchAborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
		});
	});
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
	return new WebError("Tavily search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}

/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-tavily";
/** The web seam this provider registers into. */
const inject = ["web"];
const DEFAULT_API_KEY_ENV = "TAVILY_API_KEY";

const Config = z.object({
	apiKey: z.string().role("secret").volatile(),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV).volatile(),
	baseURL: z.string().default(TAVILY_DEFAULT_BASE_URL).volatile(),
	maxResults: z.number().step(1).min(1).max(20).default(TAVILY_DEFAULT_MAX_RESULTS).volatile(),
	searchDepth: z.union(["basic", "advanced"]).default(TAVILY_DEFAULT_SEARCH_DEPTH).volatile()
});

/** Settings namespace carrying this provider's endpoint and key reference. */
const WEB_SEARCH_TAVILY_SETTINGS_NAMESPACE = "web-search-tavily";

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider.
 */
function resolveOptions(ctx, config) {
	const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	return {
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
			return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
		},
		apiKeyEnv,
		baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
		maxResults: config.maxResults ?? TAVILY_DEFAULT_MAX_RESULTS,
		searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
		// NOTE: The DeepSeek provider logs each search request to the session log
		// as `web/deepseek-search-llm-request` — an event type in DSH's generated
		// KNOWN_SESSION_EVENT_TYPES. Tavily's `web/tavily-search-request` is a
		// custom out-of-repo event type that DSH does NOT recognize, so writing it
		// here makes the session log unreadable (refused on resume). DSH currently
		// offers no registration surface for third-party session event types, so
		// this callback intentionally does NOT append to the session log. Search
		// itself is unaffected; only the per-request telemetry record is dropped.
		recordRequest: () => {
			// intentionally no-op — see note above.
		}
	};
}

/** Register the Tavily search provider with `ctx.web`. */
function apply(ctx, config) {
	ctx.web.registerSearchProvider(new TavilySearchProvider(() => resolveOptions(ctx, {
		apiKey: config.apiKey.get(),
		apiKeyEnv: config.apiKeyEnv.get(),
		baseURL: config.baseURL.get(),
		maxResults: config.maxResults.get(),
		searchDepth: config.searchDepth.get()
	})));
}

export { Config, TAVILY_PROVIDER_ID, TavilySearchProvider, WEB_SEARCH_TAVILY_SETTINGS_NAMESPACE, apply, inject, name };
