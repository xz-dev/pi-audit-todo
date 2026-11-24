import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { isTaskDetails } from "../state/replay.ts";
import { STATE_ENTRY_TYPE, type Task, TOOL_NAME } from "../tool/types.ts";

export const CLOCK_ENTRY = "pi-audit-todo:clock";
export const SETTLED_ENTRY = "pi-audit-todo:settled";
export const REVIEW_ENTRY = "pi-audit-todo:review";
export const LOOP_LIMIT = 30;
export const WORK_LIMIT_MS = 30 * 60 * 1000;
export const ACTIVE_THRESHOLD = 2;

export interface Baseline {
	loops: number;
	workMs: number;
}
export interface ItemRevision extends Baseline {
	task: Task;
	revision: string;
	created: string;
}
export interface Reviewed extends Baseline {
	id: number;
	revision: string;
}
export interface History extends Baseline {
	items: Map<number, ItemRevision>;
	reviews: Map<number, Reviewed>;
	settled?: { generation: string; ids: readonly number[] };
	generation: string;
	user?: string;
}

export function ordinaryLoop(entry: SessionEntry): boolean {
	if (entry.type !== "message" || entry.message.role !== "assistant") return false;
	const msg = entry.message;
	return (
		(msg.stopReason === "stop" || msg.stopReason === "toolUse") &&
		!msg.errorMessage &&
		msg.content.some((part) => part.type === "toolCall" || (part.type === "text" && !!part.text.trim()))
	);
}

const count = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** Canonical snapshots beat delayed tool results. Entry IDs distinguish identical tasks recreated after clear. */
export function replayAudit(entries: readonly SessionEntry[]): History {
	const out: History = { loops: 0, workMs: 0, items: new Map(), reviews: new Map(), generation: "initial" };
	let usingNative = false;
	for (const entry of entries) {
		if (ordinaryLoop(entry)) out.loops++;
		if (
			entry.type === "message" &&
			entry.message.role === "user" &&
			!("source" in entry.message && entry.message.source === "extension")
		)
			out.user = entry.id;
		if (entry.type === "custom") {
			if (entry.customType === CLOCK_ENTRY && count(entry.data)) out.workMs = Math.max(out.workMs, entry.data);
			if (entry.customType === SETTLED_ENTRY && entry.data && typeof entry.data === "object") {
				const { generation, ids } = entry.data as { generation?: unknown; ids?: unknown };
				if (typeof generation === "string" && Array.isArray(ids) && ids.every(count))
					out.settled = { generation, ids };
			}
			if (entry.customType === REVIEW_ENTRY && Array.isArray(entry.data)) {
				for (const review of entry.data) {
					if (
						review &&
						count(review.id) &&
						typeof review.revision === "string" &&
						count(review.loops) &&
						count(review.workMs) &&
						out.items.get(review.id)?.revision === review.revision
					) {
						out.reviews.set(review.id, {
							...review,
							loops: Math.min(out.loops, review.loops),
							workMs: Math.min(out.workMs, review.workMs),
						});
					}
				}
			}
		}
		const native = entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE;
		const details = native
			? entry.data
			: !usingNative &&
					entry.type === "message" &&
					entry.message.role === "toolResult" &&
					entry.message.toolName === TOOL_NAME &&
					!entry.message.isError
				? entry.message.details
				: undefined;
		if (!isTaskDetails(details) || details.error) continue;
		if (native) usingNative = true;
		if (details.action === "clear") {
			out.generation = entry.id;
			out.items.clear();
			out.reviews.clear();
			continue;
		}
		const previous = out.items;
		out.items = new Map();
		for (const task of details.tasks) {
			const prior = previous.get(task.id);
			out.items.set(
				task.id,
				prior && JSON.stringify(prior.task) === JSON.stringify(task)
					? prior
					: {
							task,
							created: prior?.created ?? entry.id,
							revision: entry.id,
							loops: out.loops,
							workMs: out.workMs,
						},
			);
		}
		for (const id of out.reviews.keys()) if (!out.items.has(id)) out.reviews.delete(id);
	}
	return out;
}

export function activeIds(history: History): number[] {
	return [...history.items.values()].filter(({ task }) => task.status === "in_progress").map(({ task }) => task.id);
}

export function newActivations(prior: readonly number[], current: readonly number[]): number[] {
	return current.length >= ACTIVE_THRESHOLD ? current.filter((id) => !prior.includes(id)) : [];
}

export function reviewBaseline(history: History, item: ItemRevision): Baseline | undefined {
	const review = history.reviews.get(item.task.id);
	if (!review || review.revision !== item.revision) return item;
	if (item.task.status === "completed" || item.task.status === "deleted") return undefined;
	return { loops: Math.max(review.loops, item.loops), workMs: Math.max(review.workMs, item.workMs) };
}

export function dueItems(history: History, workMs: number): ItemRevision[] {
	return [...history.items.values()].filter((item) => {
		const base = reviewBaseline(history, item);
		return base && (history.loops - base.loops > LOOP_LIMIT || workMs - base.workMs > WORK_LIMIT_MS);
	});
}
