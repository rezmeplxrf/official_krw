import os from "node:os";
import path from "node:path";

const dataDir = path.join(os.homedir(), ".official-krw");

export const config = {
	apiUrl: "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON",
	apiKey: process.env.KOREAEXIM_API_KEY ?? "",
	dataCode: "AP01",
	defaultQuery: `$[cur_unit='USD'].{"cur_unit": cur_unit, "cur_nm": cur_nm, "kftc_deal_bas_r": kftc_deal_bas_r, "deal_bas_r": deal_bas_r}`,
	cacheDir: path.join(dataDir, "cache"),
	cacheTtls: {
		today: 5 * 60_000,
		historical: 90 * 24 * 60 * 60_000,
	},
};
