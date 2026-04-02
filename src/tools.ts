import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createCache } from "./cache.js";
import { config } from "./config.js";
import {
	applyJsonata,
	err,
	formatDate,
	ok,
	prevDay,
	todayKST,
} from "./helpers.js";
import { consume, exhaust, pickKey, remaining } from "./rate-limit.js";

const cache = createCache({
	dir: config.cacheDir,
	ttls: {
		today: config.cacheTtls.today,
		historical: config.cacheTtls.historical,
	},
});

interface ExchangeRateRaw {
	result: number;
	cur_unit: string;
	ttb: string;
	tts: string;
	deal_bas_r: string;
	bkpr: string;
	yy_efee_r: string;
	ten_dd_efee_r: string;
	kftc_bkpr: string;
	kftc_deal_bas_r: string;
	cur_nm: string;
}

const KNOWN_ERROR_CODES = new Set([2, 3, 4]);
const MAX_BACKFILL = 10;

// We cache empty responses as a sentinel so we don't re-fetch holidays
const EMPTY_SENTINEL: ExchangeRateRaw[] = [];

type FetchResult =
	| { ok: true; data: ExchangeRateRaw[]; fromCache: boolean }
	| { ok: true; empty: true; fromCache: boolean }
	| { ok: false; error: string };

async function fetchDate(dateStr: string): Promise<FetchResult> {
	const bucket = dateStr === todayKST() ? "today" : "historical";
	const cached = await cache.get<ExchangeRateRaw[]>(bucket, dateStr);

	if (cached !== null) {
		if (cached.length === 0) {
			return { ok: true, empty: true, fromCache: true };
		}
		return { ok: true, data: cached, fromCache: true };
	}

	// Try keys until one works or all exhausted
	for (let attempt = 0; attempt < config.apiKeys.length; attempt++) {
		const key = await pickKey();
		if (!key) {
			break;
		}

		const url = new URL(config.apiUrl);
		url.searchParams.set("authkey", key);
		url.searchParams.set("searchdate", dateStr);
		url.searchParams.set("data", config.dataCode);

		const response = await fetch(url.toString());
		await consume(key, 1);

		if (response.status === 429) {
			await exhaust(key);
			continue;
		}

		if (!response.ok) {
			return {
				ok: false,
				error: `API request failed: ${response.status} ${response.statusText}`,
			};
		}

		const data: ExchangeRateRaw[] = await response.json();

		if (data.length === 0) {
			// Cache the empty response so we don't re-fetch this holiday/weekend
			await cache.set(bucket, EMPTY_SENTINEL, dateStr);
			return { ok: true, empty: true, fromCache: false };
		}

		if (data[0].result !== 1) {
			if (KNOWN_ERROR_CODES.has(data[0].result)) {
				const codes: Record<number, string> = {
					2: "Invalid DATA code",
					3: "Authentication failed — check KOREAEXIM_API_KEY",
					4: "Invalid date format",
				};
				return { ok: false, error: codes[data[0].result] };
			}
			// Unknown result code — likely rate limited, exhaust this key and try next
			await exhaust(key);
			continue;
		}

		await cache.set(bucket, data, dateStr);
		return { ok: true, data, fromCache: false };
	}

	const left = await remaining();
	return {
		ok: false,
		error: `All API keys exhausted (remaining_requests_today: ${left}). Try again tomorrow.`,
	};
}

interface BackfillResult {
	ok: true;
	data: ExchangeRateRaw[];
	resolvedDate: string;
	fromCache: boolean;
}

type FetchWithBackfillResult = BackfillResult | { ok: false; error: string };

/**
 * Fetch exchange rates for a date, backfilling up to MAX_BACKFILL previous
 * days if the requested date has no data (weekend/holiday).
 */
async function fetchDateWithBackfill(
	dateStr: string,
): Promise<FetchWithBackfillResult> {
	let current = dateStr;
	let anyApiCall = false;

	for (let i = 0; i <= MAX_BACKFILL; i++) {
		const result = await fetchDate(current);

		if (!result.ok) {
			return result;
		}

		if (!("empty" in result)) {
			return {
				ok: true,
				data: result.data,
				resolvedDate: current,
				fromCache: result.fromCache && !anyApiCall,
			};
		}

		// Empty response — try previous day
		if (!result.fromCache) {
			anyApiCall = true;
		}
		current = prevDay(current);
	}

	return {
		ok: false,
		error: `No exchange rate data found within ${MAX_BACKFILL} days before ${dateStr}.`,
	};
}

function parseDateStr(date: string): string {
	return date.replace(/-/g, "");
}

function formatDateDisplay(dateStr: string): string {
	return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerTools(server: McpServer): void {
	server.tool(
		"get_exchange_rates",
		"Get official KRW exchange rates from Korea Eximbank (한국수출입은행). " +
			"Supports single date (search_date) or batch (search_dates, up to 30). " +
			"If the requested date is a weekend/holiday, automatically backfills with the most recent business day (up to 10 days back). " +
			"API is limited to 1000 requests/day per key — cached dates don't count. " +
			"Supports multiple API keys (comma-separated KOREAEXIM_API_KEY) for higher daily limits; " +
			"keys rotate automatically when exhausted. " +
			"Every response includes remaining_requests_today.\n\n" +
			"Response fields:\n" +
			"- cur_unit: Currency code (e.g. USD, EUR, JPY(100))\n" +
			"- cur_nm: Currency name in Korean (e.g. 미국 달러)\n" +
			"- ttb: Telegraphic Transfer Buying rate (송금 받을 때)\n" +
			"- tts: Telegraphic Transfer Selling rate (송금 보낼 때)\n" +
			"- deal_bas_r: Standard exchange rate (매매 기준율)\n" +
			"- bkpr: Book price (장부가격)\n" +
			"- kftc_deal_bas_r: KFTC standard rate (서울외국환중개 매매기준율)\n" +
			"- kftc_bkpr: KFTC book price\n" +
			"- yy_efee_r: Annual commission rate\n" +
			"- ten_dd_efee_r: 10-day commission rate\n\n" +
			"JSONata examples:\n" +
			"- All currencies: `$`\n" +
			"- All USD fields: `$[cur_unit='USD']`\n" +
			"- EUR rate: `$[cur_unit='EUR'].deal_bas_r`\n" +
			"- JPY rate: `$[cur_unit='JPY(100)'].kftc_deal_bas_r`\n" +
			"- Multiple currencies: `$[cur_unit in ['USD','EUR']].{\"cur_unit\": cur_unit, \"deal_bas_r\": deal_bas_r}`\n\n" +
			"Default filter (when query is omitted): returns only USD with cur_unit, cur_nm, kftc_deal_bas_r, and deal_bas_r. " +
			"Pass a custom query to override.\n\n" +
			"Batch response: when search_dates is used, returns `{date: {resolved_date, data}, ...}` keyed by each requested date. " +
			"resolved_date shows the actual business day used if backfill occurred. " +
			"The query is applied per-date.",
		{
			search_date: z
				.string()
				.optional()
				.describe(
					"Single date in yyyy-MM-dd format (e.g. '2026-04-02'). Defaults to today.",
				),
			search_dates: z
				.array(z.string())
				.optional()
				.describe(
					"Array of dates in yyyy-MM-dd format for batch requests (max 30). " +
						"Cannot be used with search_date.",
				),
			query: z
				.string()
				.optional()
				.describe(
					"JSONata expression to filter/transform the raw response. " +
						"Defaults to USD kftc_deal_bas_r and deal_bas_r.",
				),
		},
		async ({ search_date, search_dates, query }) => {
			try {
				if (config.apiKeys.length === 0) {
					return err(
						"KOREAEXIM_API_KEY environment variable is not set. " +
							"Get an API key from https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2",
					);
				}

				if (search_date && search_dates) {
					return err(
						"Cannot use both search_date and search_dates. Use one or the other.",
					);
				}

				const jsonataQuery = query ?? config.defaultQuery;

				// Single date mode
				if (!search_dates) {
					const dateStr = search_date
						? parseDateStr(search_date)
						: formatDate(new Date());

					const result = await fetchDateWithBackfill(dateStr);
					const left = await remaining();
					if (!result.ok) {
						return err(`${result.error} (remaining_requests_today: ${left})`);
					}
					const data = JSON.parse(
						await applyJsonata(result.data, jsonataQuery),
					);
					const payload: Record<string, unknown> = {
						data,
						remaining_requests_today: left,
					};
					if (result.resolvedDate !== dateStr) {
						payload.resolved_date = formatDateDisplay(result.resolvedDate);
					}
					return ok(JSON.stringify(payload));
				}

				// Batch mode
				if (search_dates.length === 0) {
					return err("search_dates array is empty.");
				}
				if (search_dates.length > 30) {
					return err(
						"search_dates exceeds maximum of 30 dates per batch request.",
					);
				}

				const dateStrs = search_dates.map(parseDateStr);

				const results: FetchWithBackfillResult[] = [];
				let lastWasApiCall = false;

				for (const ds of dateStrs) {
					if (lastWasApiCall) {
						await delay(config.batchDelayMs);
					}
					const result = await fetchDateWithBackfill(ds);
					lastWasApiCall = result.ok && !result.fromCache;
					results.push(result);
				}

				const output: Record<string, unknown> = {};
				for (let i = 0; i < search_dates.length; i++) {
					const r = results[i];
					if (r.ok) {
						const entry: Record<string, unknown> = {
							data: JSON.parse(await applyJsonata(r.data, jsonataQuery)),
						};
						if (r.resolvedDate !== dateStrs[i]) {
							entry.resolved_date = formatDateDisplay(r.resolvedDate);
						}
						output[search_dates[i]] = entry;
					} else {
						output[search_dates[i]] = { error: r.error };
					}
				}

				const left = await remaining();
				output.remaining_requests_today = left;

				return ok(JSON.stringify(output));
			} catch (e) {
				return err(e);
			}
		},
	);
}
