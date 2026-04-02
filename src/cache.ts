import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface CacheEntry {
	data: unknown;
	cachedAt: number;
	expiresAt: number;
}

interface MetaEntry {
	bucket: string;
	file: string;
	cachedAt: number;
	expiresAt: number;
}

interface CacheMeta {
	entries: Record<string, MetaEntry>;
}

export interface CacheStats {
	totalEntries: number;
	expiredEntries: number;
	activeEntries: number;
	byBucket: Record<string, { total: number; expired: number }>;
}

export interface CacheConfig {
	dir: string;
	ttls: Record<string, number>;
}

export interface Cache {
	get<T>(bucket: string, ...keyParts: unknown[]): Promise<T | null>;
	set(bucket: string, data: unknown, ...keyParts: unknown[]): Promise<void>;
	prune(): Promise<number>;
	clear(): Promise<number>;
	stats(): Promise<CacheStats>;
}

export function createCache(cfg: CacheConfig): Cache {
	function makeKey(bucket: string, ...parts: unknown[]): string {
		const raw = bucket + JSON.stringify(parts);
		return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
	}

	function filePath(bucket: string, key: string): string {
		return path.join(cfg.dir, bucket, `${key}.json`);
	}

	const metaPath = path.join(cfg.dir, "meta.json");

	async function loadMeta(): Promise<CacheMeta> {
		try {
			const raw = await fs.readFile(metaPath, "utf-8");
			return JSON.parse(raw) as CacheMeta;
		} catch {
			return { entries: {} };
		}
	}

	async function saveMeta(meta: CacheMeta): Promise<void> {
		await fs.mkdir(cfg.dir, { recursive: true });
		await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
	}

	return {
		async get<T>(bucket: string, ...keyParts: unknown[]): Promise<T | null> {
			const key = makeKey(bucket, ...keyParts);
			const file = filePath(bucket, key);

			try {
				const raw = await fs.readFile(file, "utf-8");
				const entry = JSON.parse(raw) as CacheEntry;
				if (Date.now() > entry.expiresAt) {
					await fs.unlink(file).catch(() => {});
					const meta = await loadMeta();
					delete meta.entries[key];
					await saveMeta(meta);
					return null;
				}
				return entry.data as T;
			} catch {
				return null;
			}
		},

		async set(
			bucket: string,
			data: unknown,
			...keyParts: unknown[]
		): Promise<void> {
			const ttl = cfg.ttls[bucket];
			if (!ttl) return;

			const key = makeKey(bucket, ...keyParts);
			const file = filePath(bucket, key);
			const now = Date.now();
			const expiresAt = now + ttl;

			const entry: CacheEntry = { data, cachedAt: now, expiresAt };
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(file, JSON.stringify(entry), "utf-8");

			const meta = await loadMeta();
			meta.entries[key] = { bucket, file, cachedAt: now, expiresAt };
			await saveMeta(meta);
		},

		async prune(): Promise<number> {
			const meta = await loadMeta();
			const now = Date.now();
			let pruned = 0;

			for (const [key, entry] of Object.entries(meta.entries)) {
				if (now > entry.expiresAt) {
					await fs.unlink(entry.file).catch(() => {});
					delete meta.entries[key];
					pruned++;
				}
			}

			await saveMeta(meta);
			return pruned;
		},

		async clear(): Promise<number> {
			const meta = await loadMeta();
			const count = Object.keys(meta.entries).length;

			for (const entry of Object.values(meta.entries)) {
				await fs.unlink(entry.file).catch(() => {});
			}

			try {
				const items = await fs.readdir(cfg.dir);
				for (const item of items) {
					if (item === "meta.json") continue;
					const dir = path.join(cfg.dir, item);
					const stat = await fs.stat(dir);
					if (stat.isDirectory()) await fs.rm(dir, { recursive: true });
				}
			} catch {
				// cache dir doesn't exist
			}

			await saveMeta({ entries: {} });
			return count;
		},

		async stats(): Promise<CacheStats> {
			const meta = await loadMeta();
			const now = Date.now();
			const byBucket: Record<string, { total: number; expired: number }> = {};
			let expired = 0;

			for (const entry of Object.values(meta.entries)) {
				if (!byBucket[entry.bucket])
					byBucket[entry.bucket] = { total: 0, expired: 0 };
				byBucket[entry.bucket].total++;
				if (now > entry.expiresAt) {
					expired++;
					byBucket[entry.bucket].expired++;
				}
			}

			const total = Object.keys(meta.entries).length;
			return {
				totalEntries: total,
				expiredEntries: expired,
				activeEntries: total - expired,
				byBucket,
			};
		},
	};
}
