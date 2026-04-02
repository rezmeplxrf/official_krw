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

export function todayKST(): string {
	const now = new Date();
	const kst = new Date(now.getTime() + 9 * 60 * 60_000);
	const y = kst.getUTCFullYear();
	const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
	const d = String(kst.getUTCDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}
