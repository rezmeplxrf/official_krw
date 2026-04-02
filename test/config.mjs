import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { parseKeys } = await import("../dist/config.js");

describe("parseKeys", () => {
	it("splits comma-separated keys", () => {
		assert.deepEqual(parseKeys("k1,k2,k3"), ["k1", "k2", "k3"]);
	});

	it("trims whitespace", () => {
		assert.deepEqual(parseKeys("k1 , k2 , k3"), ["k1", "k2", "k3"]);
	});

	it("filters empty segments", () => {
		assert.deepEqual(parseKeys("k1,,k2,"), ["k1", "k2"]);
	});

	it("handles single key", () => {
		assert.deepEqual(parseKeys("k1"), ["k1"]);
	});

	it("returns empty for empty string", () => {
		assert.deepEqual(parseKeys(""), []);
	});

	it("filters out YOUR_API_KEY placeholder", () => {
		assert.deepEqual(parseKeys("YOUR_API_KEY"), []);
	});

	it("filters out YOUR_API_KEY among real keys", () => {
		assert.deepEqual(parseKeys("real_key,YOUR_API_KEY,another"), [
			"real_key",
			"another",
		]);
	});

	it("filters out YOUR_KEY placeholder", () => {
		assert.deepEqual(parseKeys("YOUR_KEY"), []);
	});

	it("filters out CHANGE_ME placeholder", () => {
		assert.deepEqual(parseKeys("CHANGE_ME"), []);
	});
});
