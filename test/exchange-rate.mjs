import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const { applyJsonata, formatDate, prevDay, todayKST } = await import(
	"../dist/helpers.js"
);
const { config } = await import("../dist/config.js");
const { createCache } = await import("../dist/cache.js");

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

describe("prevDay", () => {
	it("returns the previous day", () => {
		assert.equal(prevDay("20260402"), "20260401");
	});

	it("crosses month boundary", () => {
		assert.equal(prevDay("20260301"), "20260228");
	});

	it("crosses year boundary", () => {
		assert.equal(prevDay("20260101"), "20251231");
	});

	it("handles leap year", () => {
		assert.equal(prevDay("20240301"), "20240229");
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

describe("todayKST", () => {
	it("returns 8-digit date string", () => {
		const result = todayKST();
		assert.match(result, /^\d{8}$/);
	});
});

describe("cache", () => {
	const testDir = path.join(os.tmpdir(), `official-krw-test-${Date.now()}`);
	const testCache = createCache({
		dir: testDir,
		ttls: { today: 5 * 60_000, historical: 90 * 24 * 60 * 60_000 },
	});

	after(async () => {
		await fs.rm(testDir, { recursive: true, force: true });
	});

	it("returns null on cache miss", async () => {
		const result = await testCache.get("today", "20260402");
		assert.equal(result, null);
	});

	it("stores and retrieves data", async () => {
		await testCache.set("historical", FIXTURE, "20250101");
		const result = await testCache.get("historical", "20250101");
		assert.deepEqual(result, FIXTURE);
	});

	it("returns same data on second get", async () => {
		const first = await testCache.get("historical", "20250101");
		const second = await testCache.get("historical", "20250101");
		assert.deepEqual(first, second);
	});

	it("caches and retrieves empty arrays (holiday sentinel)", async () => {
		await testCache.set("historical", [], "20260101");
		const result = await testCache.get("historical", "20260101");
		assert.deepEqual(result, []);
		assert.notEqual(result, null);
	});
});
