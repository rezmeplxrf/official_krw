import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { applyJsonata, formatDate } = await import("../dist/helpers.js");
const { config } = await import("../dist/config.js");

const FIXTURE = [
	{
		result: 1,
		cur_unit: "USD",
		ttb: "1,448.44",
		tts: "1,477.55",
		deal_bas_r: "1,462.5",
		bkpr: "1,462",
		yy_efee_r: "0",
		ten_dd_efee_r: "0",
		kftc_bkpr: "1,462",
		kftc_deal_bas_r: "1,462.5",
		cur_nm: "미국 달러",
	},
	{
		result: 1,
		cur_unit: "JPY(100)",
		ttb: "976.25",
		tts: "995.83",
		deal_bas_r: "986.04",
		bkpr: "986",
		yy_efee_r: "0",
		ten_dd_efee_r: "0",
		kftc_bkpr: "986",
		kftc_deal_bas_r: "986.04",
		cur_nm: "일본 엔",
	},
	{
		result: 1,
		cur_unit: "EUR",
		ttb: "1,588.91",
		tts: "1,620.88",
		deal_bas_r: "1,604.9",
		bkpr: "1,604",
		yy_efee_r: "0",
		ten_dd_efee_r: "0",
		kftc_bkpr: "1,604",
		kftc_deal_bas_r: "1,604.9",
		cur_nm: "유로",
	},
];

describe("formatDate", () => {
	it("formats date as yyyyMMdd", () => {
		const d = new Date(2026, 3, 2);
		assert.equal(formatDate(d), "20260402");
	});

	it("pads single-digit month and day", () => {
		const d = new Date(2026, 0, 5);
		assert.equal(formatDate(d), "20260105");
	});
});

describe("default JSONata query", () => {
	it("filters to USD with kftc_deal_bas_r and deal_bas_r", async () => {
		const result = JSON.parse(await applyJsonata(FIXTURE, config.defaultQuery));
		assert.equal(result.cur_unit, "USD");
		assert.equal(result.cur_nm, "미국 달러");
		assert.equal(result.kftc_deal_bas_r, "1,462.5");
		assert.equal(result.deal_bas_r, "1,462.5");
		assert.equal(result.ttb, undefined);
		assert.equal(result.tts, undefined);
	});
});

describe("custom JSONata queries", () => {
	it("returns all currencies", async () => {
		const result = JSON.parse(await applyJsonata(FIXTURE, "$"));
		assert.equal(result.length, 3);
	});

	it("filters EUR deal_bas_r", async () => {
		const result = JSON.parse(
			await applyJsonata(FIXTURE, "$[cur_unit='EUR'].deal_bas_r"),
		);
		assert.equal(result, "1,604.9");
	});

	it("filters JPY(100) kftc_deal_bas_r", async () => {
		const result = JSON.parse(
			await applyJsonata(FIXTURE, "$[cur_unit='JPY(100)'].kftc_deal_bas_r"),
		);
		assert.equal(result, "986.04");
	});

	it("returns raw JSON without query", async () => {
		const result = JSON.parse(await applyJsonata(FIXTURE));
		assert.equal(result.length, 3);
		assert.equal(result[0].cur_unit, "USD");
	});
});
