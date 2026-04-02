import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("live exchange rate", () => {
	it("fetches rates from Korea Eximbank", async () => {
		const apiKey = process.env.KOREAEXIM_API_KEY;
		if (!apiKey) {
			console.log("Skipping live test — KOREAEXIM_API_KEY not set");
			return;
		}

		const url = new URL(
			"https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON",
		);
		url.searchParams.set("authkey", apiKey);
		url.searchParams.set("data", "AP01");

		const res = await fetch(url.toString());
		assert.equal(res.ok, true);

		const data = await res.json();
		// Weekends/holidays may return empty array
		if (data.length > 0) {
			assert.equal(data[0].result, 1);
			assert.ok(data[0].cur_unit);
			assert.ok(data[0].kftc_deal_bas_r);
			assert.ok(data[0].deal_bas_r);
		}
	});
});
