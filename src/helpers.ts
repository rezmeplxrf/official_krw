import jsonata from "jsonata";

export function ok(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

export function err(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: "text" as const, text: message }],
		isError: true,
	};
}

export async function applyJsonata(
	data: unknown,
	query?: string,
): Promise<string> {
	if (query) {
		const expr = jsonata(query);
		const result = await expr.evaluate(data);
		return JSON.stringify(result);
	}
	return JSON.stringify(data);
}

export function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

/** Parse yyyyMMdd string and return the previous day as yyyyMMdd. */
export function prevDay(dateStr: string): string {
	const y = Number(dateStr.slice(0, 4));
	const m = Number(dateStr.slice(4, 6)) - 1; // 0-indexed
	const d = Number(dateStr.slice(6, 8));
	const date = new Date(y, m, d);
	date.setDate(date.getDate() - 1);
	return formatDate(date);
}

export function todayKST(): string {
	const now = new Date();
	const kst = new Date(now.getTime() + 9 * 60 * 60_000);
	const y = kst.getUTCFullYear();
	const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
	const d = String(kst.getUTCDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}
