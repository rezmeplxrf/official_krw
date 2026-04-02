import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "./config.js";
import { applyJsonata, err, formatDate, ok } from "./helpers.js";

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

export function registerTools(server: McpServer): void {
	server.tool(
		"get_exchange_rates",
		"Get official KRW exchange rates from Korea Eximbank (한국수출입은행). " +
			"Returns raw API response filtered by JSONata. " +
			"By default returns USD kftc_deal_bas_r and deal_bas_r only.\n\n" +
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
			"Pass a custom query to override.",
		{
			search_date: z
				.string()
				.optional()
				.describe(
					"Date in yyyy-MM-dd format (e.g. '2026-04-02'). Defaults to today.",
				),
			query: z
				.string()
				.optional()
				.describe(
					"JSONata expression to filter/transform the raw response. " +
						"Defaults to USD kftc_deal_bas_r and deal_bas_r.",
				),
		},
		async ({ search_date, query }) => {
			try {
				if (!config.apiKey) {
					return err(
						"KOREAEXIM_API_KEY environment variable is not set. " +
							"Get an API key from https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2",
					);
				}

				const dateStr = search_date
					? search_date.replace(/-/g, "")
					: formatDate(new Date());

				const url = new URL(config.apiUrl);
				url.searchParams.set("authkey", config.apiKey);
				url.searchParams.set("searchdate", dateStr);
				url.searchParams.set("data", config.dataCode);

				const response = await fetch(url.toString());
				if (!response.ok) {
					return err(
						`API request failed: ${response.status} ${response.statusText}`,
					);
				}

				const data: ExchangeRateRaw[] = await response.json();

				if (data.length === 0) {
					return ok(
						`No exchange rate data available for ${search_date ?? dateStr}. ` +
							"The API may not have data for weekends or holidays.",
					);
				}

				if (data[0].result !== 1) {
					const codes: Record<number, string> = {
						2: "Invalid DATA code",
						3: "Authentication failed — check KOREAEXIM_API_KEY",
						4: "Invalid date format",
					};
					return err(
						codes[data[0].result] ?? `Unknown error code: ${data[0].result}`,
					);
				}

				const jsonataQuery = query ?? config.defaultQuery;
				const result = await applyJsonata(data, jsonataQuery);
				return ok(result);
			} catch (e) {
				return err(e);
			}
		},
	);
}
