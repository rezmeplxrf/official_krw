import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const testDir = path.join(os.tmpdir(), `official-krw-rl-test-${Date.now()}`);
const testRateLimitPath = path.join(testDir, "rate-limit.json");

// Patch config before importing rate-limit
const { config } = await import("../dist/config.js");
config.rateLimitPath = testRateLimitPath;
config.maxRequestsPerDay = 10;
config.apiKeys = ["key_a", "key_b"];

const { remaining, remainingForKey, consume, exhaust, pickKey } = await import(
	"../dist/rate-limit.js"
);

describe("rate-limit (per-key)", () => {
	before(async () => {
		await fs.mkdir(testDir, { recursive: true });
		// Clean state
		await fs.rm(testRateLimitPath, { force: true });
	});

	after(async () => {
		await fs.rm(testDir, { recursive: true, force: true });
	});

	it("starts with full budget across all keys", async () => {
		const left = await remaining();
		assert.equal(left, 20); // 10 per key × 2 keys
	});

	it("remainingForKey returns per-key budget", async () => {
		assert.equal(await remainingForKey("key_a"), 10);
		assert.equal(await remainingForKey("key_b"), 10);
	});

	it("consume decrements specific key only", async () => {
		await consume("key_a", 3);
		assert.equal(await remainingForKey("key_a"), 7);
		assert.equal(await remainingForKey("key_b"), 10);
		assert.equal(await remaining(), 17);
	});

	it("exhaust sets key to max", async () => {
		await exhaust("key_a");
		assert.equal(await remainingForKey("key_a"), 0);
		assert.equal(await remaining(), 10);
	});

	it("pickKey returns first available key", async () => {
		// key_a is exhausted, key_b should be picked
		assert.equal(await pickKey(), "key_b");
	});

	it("pickKey returns null when all exhausted", async () => {
		await exhaust("key_b");
		assert.equal(await pickKey(), null);
	});

	it("remaining returns 0 when all exhausted", async () => {
		assert.equal(await remaining(), 0);
	});

	it("resets when date changes", async () => {
		await fs.writeFile(
			testRateLimitPath,
			JSON.stringify({
				date: "19700101",
				keys: { key_a: 999, key_b: 999 },
			}),
			"utf-8",
		);
		assert.equal(await remaining(), 20);
		assert.equal(await pickKey(), "key_a");
	});

	it("handles old format gracefully", async () => {
		await fs.writeFile(
			testRateLimitPath,
			JSON.stringify({ date: "19700101", count: 500 }),
			"utf-8",
		);
		// Old format → treated as fresh state
		assert.equal(await remaining(), 20);
	});
});
