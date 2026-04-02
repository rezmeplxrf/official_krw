import fs from "node:fs/promises";
import { config } from "./config.js";
import { todayKST } from "./helpers.js";

interface RateLimitState {
	date: string;
	keys: Record<string, number>;
}

async function load(): Promise<RateLimitState> {
	try {
		const raw = await fs.readFile(config.rateLimitPath, "utf-8");
		const parsed = JSON.parse(raw);
		// Migrate old format {date, count} → new format {date, keys}
		if (parsed.keys && typeof parsed.keys === "object") {
			return parsed as RateLimitState;
		}
		return { date: todayKST(), keys: {} };
	} catch {
		return { date: todayKST(), keys: {} };
	}
}

async function save(state: RateLimitState): Promise<void> {
	const dir = config.rateLimitPath.replace(/[/\\][^/\\]+$/, "");
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		config.rateLimitPath,
		JSON.stringify(state, null, 2),
		"utf-8",
	);
}

function current(state: RateLimitState): RateLimitState {
	const today = todayKST();
	if (state.date !== today) {
		return { date: today, keys: {} };
	}
	return state;
}

function countForKey(state: RateLimitState, key: string): number {
	return state.keys[key] ?? 0;
}

export async function remaining(): Promise<number> {
	const state = current(await load());
	let total = 0;
	for (const key of config.apiKeys) {
		total += Math.max(0, config.maxRequestsPerDay - countForKey(state, key));
	}
	return total;
}

export async function remainingForKey(key: string): Promise<number> {
	const state = current(await load());
	return Math.max(0, config.maxRequestsPerDay - countForKey(state, key));
}

export async function consume(key: string, n: number): Promise<void> {
	const state = current(await load());
	state.keys[key] = countForKey(state, key) + n;
	await save(state);
}

export async function exhaust(key: string): Promise<void> {
	const state = current(await load());
	state.keys[key] = config.maxRequestsPerDay;
	await save(state);
}

export async function pickKey(): Promise<string | null> {
	const state = current(await load());
	for (const key of config.apiKeys) {
		if (countForKey(state, key) < config.maxRequestsPerDay) {
			return key;
		}
	}
	return null;
}
