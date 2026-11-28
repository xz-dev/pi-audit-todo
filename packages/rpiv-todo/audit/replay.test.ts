import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { createActivityDomain } from "./activity.ts";
import {
	activeEvidenceAfter,
	activeIds,
	CLOCK_ENTRY,
	dueItems,
	REVIEW_ENTRY,
	replayAudit,
	WORK_LIMIT_MS,
} from "./history.ts";

it("reads nested native commits once and ignores old tool results and unrelated branch receipts", () => {
	const task = { id: 1, subject: "Nested task", status: "pending" };
	const nested = {
		id: "n",
		parentId: null,
		timestamp: "",
		type: "custom",
		customType: "rpiv-todo-state",
		data: { action: "create", tasks: [task], nextId: 2 },
	} as const;
	const delayed = {
		id: "t",
		parentId: "n",
		timestamp: "",
		type: "message",
		message: {
			role: "toolResult",
			toolName: "todo",
			isError: false,
			details: nested.data,
			content: [],
			toolCallId: "call",
			timestamp: 0,
		},
	} as SessionEntry;
	const active = { ...nested, id: "a", data: { ...nested.data, tasks: [{ ...task, status: "in_progress" }] } };
	const clock = { ...nested, id: "clock", customType: CLOCK_ENTRY, data: WORK_LIMIT_MS + 1 };
	const review = {
		...nested,
		id: "r",
		customType: REVIEW_ENTRY,
		data: [{ id: 1, revision: "a", workMs: WORK_LIMIT_MS + 1, loops: 0 }],
	};
	const left = replayAudit([nested, active, delayed, clock, review]);
	expect(left.items.get(1)).toMatchObject({ created: "n", revision: "a" });
	expect(activeIds(left)).toEqual([1]);
	expect(dueItems(left, left.workMs)).toEqual([]);
	const right = replayAudit([nested, delayed, clock, review]);
	expect(activeIds(right)).toEqual([]);
	expect(right.reviews.size).toBe(0);
	expect(dueItems(right, right.workMs).map((x) => x.task.id)).toEqual([1]);
});

it("keeps active cutoffs branch-local across edits and resets them only on a new active period", () => {
	const entry = (id: string, customType: string, data: unknown): SessionEntry => ({
		id,
		parentId: null,
		timestamp: "",
		type: "custom",
		customType,
		data,
	});
	const state = (id: string, status: "pending" | "in_progress", description = "", action = "update") =>
		entry(id, "rpiv-todo-state", {
			action,
			nextId: 2,
			tasks: action === "clear" ? [] : [{ id: 1, subject: "Build", status, description }],
		});
	const review = (id: string, revision: string, evidenceCutoff?: string) =>
		entry(id, REVIEW_ENTRY, [{ id: 1, revision, loops: 0, workMs: 0, evidenceCutoff }]);
	const pending = state("create", "pending");
	const active = state("active", "in_progress");
	const legacy = review("legacy", "active");
	const edited = state("edited", "in_progress", "metadata changed");
	const anchor = entry("anchor", CLOCK_ENTRY, 10);
	const fresh = review("new", "edited", "anchor");
	const initial = [pending, active, legacy, edited];
	const cutoff = (branch: SessionEntry[]) => {
		const item = replayAudit(branch).items.get(1)!;
		return activeEvidenceAfter(item, new Map(branch.map(({ id }, index) => [id, index])));
	};
	expect(replayAudit(initial).items.get(1)).toMatchObject({ activeSince: "active", revision: "edited" });
	expect(cutoff(initial)).toBe("legacy");
	const branch = [...initial, anchor, fresh];
	expect(cutoff(branch)).toBe("anchor");
	expect(cutoff([...initial, fresh])).toBeUndefined(); // A discarded anchor is not usable.
	expect(cutoff([...initial, anchor, review("other", "other-revision", "anchor")])).toBe("legacy");
	expect(cutoff([...branch, state("wait", "pending"), state("resume", "in_progress")])).toBe("resume");
	expect(cutoff([...branch, state("clear", "pending", "", "clear"), state("reused", "in_progress")])).toBe("reused");
});

it("uses an isolated activity transport; a child reports and disconnects without touching Continue's declaration", async () => {
	const env = { PI_EXTENSION_UTILS_PROCESS_DOMAIN: "some other extension" };
	const main = createActivityDomain(env);
	let child: ReturnType<typeof createActivityDomain> | undefined;
	try {
		await main.open();
		child = createActivityDomain({ ...env });
		await child.open();
		expect(child.isClient).toBe(true);
		child.observe({}, true);
		await expect.poll(() => main.busy).toBe(true);
		await child.close();
		child = undefined;
		await expect.poll(() => main.busy).toBe(false);
		expect(env.PI_EXTENSION_UTILS_PROCESS_DOMAIN).toBe("some other extension");
	} finally {
		await child?.close();
		await main.close();
	}
});
