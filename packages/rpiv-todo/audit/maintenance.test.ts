import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import type { Task } from "../tool/types.ts";
import { createActivityDomain, WorkClock } from "./activity.ts";
import { evidence, makePrompt, parseChoices } from "./decision.ts";
import { CLOCK_ENTRY, dueItems, newActivations, REVIEW_ENTRY, replayAudit, WORK_LIMIT_MS } from "./history.ts";

const extra = (id: string, customType: string, data: unknown): SessionEntry => ({
	id,
	parentId: null,
	timestamp: "2026-01-01T00:00:00Z",
	type: "custom",
	customType,
	data,
});
const item = (id: number, status: Task["status"] = "pending"): Task => ({ id, status, subject: `Task ${id}` });
const board = (id: string, tasks: Task[], action = "update") =>
	extra(id, "rpiv-todo-state", { action, tasks, nextId: tasks.length + 1, params: {} });

it("opens one distinct review per new activation from the second active item, not from unchanged membership", () => {
	expect(newActivations([], [1])).toEqual([]);
	expect(newActivations([1], [1, 2])).toEqual([2]);
	expect(newActivations([1], [1, 2, 3])).toEqual([2, 3]);
	expect(newActivations([1, 2], [1, 3])).toEqual([3]);
	expect(newActivations([2, 1], [1, 2])).toEqual([]);
});

it("distinguishes item revisions, strict boundaries, no-ops and unchanged terminal reviews", () => {
	const old = [item(1), item(2, "in_progress"), item(3, "completed"), item(4, "deleted")];
	const later = [old[0], { ...old[1], description: "updated alone" }, old[2], old[3]];
	const start = [board("old", old), extra("clock", CLOCK_ENTRY, 100), board("new", later), board("identical", later)];
	const view = replayAudit(start);
	expect(view.items.get(2)?.revision).toBe("new");
	expect(view.items.get(1)?.revision).toBe("old");
	expect(dueItems(view, WORK_LIMIT_MS)).toEqual([]);
	expect(dueItems(view, WORK_LIMIT_MS + 1).map((x) => x.task.id)).toEqual([1, 3, 4]);
	expect(dueItems({ ...view, loops: 30 }, 100)).toEqual([]);
	expect(dueItems({ ...view, loops: 31 }, 100).map((x) => x.task.id)).toEqual([1, 2, 3, 4]);
	const laterView = replayAudit([
		...start,
		extra("clock2", CLOCK_ENTRY, WORK_LIMIT_MS + 1),
		extra(
			"accept",
			REVIEW_ENTRY,
			[1, 3, 4].map((id) => ({ id, revision: "old", loops: 0, workMs: WORK_LIMIT_MS + 1 })),
		),
	]);
	expect(dueItems(laterView, WORK_LIMIT_MS + 2)).toEqual([]);
	expect(dueItems(laterView, WORK_LIMIT_MS * 2 + 2).map((x) => x.task.id)).toEqual([1, 2]);
	const cleared = replayAudit([...start, board("clear", [], "clear"), board("same-ids", old)]);
	expect(cleared.generation).toBe("clear");
	expect(cleared.items.get(1)?.revision).toBe("same-ids");
});

it("counts union-of-work, pauses when everyone is idle and resumes a restored clock", () => {
	const activity = createActivityDomain({});
	let now = 100;
	const clock = new WorkClock(200, () => now);
	const off = activity.subscribe((state) => clock.setBusy(state));
	const main = {};
	const child = {};
	activity.observe(main, true);
	now += 1_000;
	activity.observe(child, true);
	now += 10_000;
	activity.observe(main, false);
	now += 4_000;
	activity.observe(child, false);
	now += 3_600_000;
	expect(clock.at()).toBe(15_200);
	off();
});

it.each(["These TODO items need periodic maintenance.", "New parallel activity. Account for the entire active set."])(
	"gives the reviewer contrasting active-work cases: %s",
	(trigger) => {
		const prompt = makePrompt([item(1, "in_progress")], [1], trigger, new Map());
		expect(prompt).toContain(trigger);
		expect(prompt).toContain("observing a still-running job qualifies");
		expect(prompt).toContain("cite a fresh original record");
		expect(prompt).toContain("propose status pending and addBlockedBy");
		expect(prompt).toContain("Waiting is not grounds for an active keep");
		expect(prompt).toContain("return unverified and name the missing fact");
		expect(prompt).toContain("identify both portions; never create tasks");
		expect(prompt).toContain('"kind":"keep|update|delete|unverified"');
	},
);

it("uses original, in-window evidence only for active keeps", () => {
	const assistant = (id: string, text: string): SessionEntry => ({
		id,
		parentId: null,
		timestamp: "",
		type: "message",
		message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", timestamp: 0 } as Extract<
			SessionEntry,
			{ type: "message" }
		>["message"],
	});
	const refs = evidence([
		assistant("old", "Task #1 test job is running."),
		extra("receipt", "pi-audit-todo", "Task #1 kept"),
		assistant("fresh", "Task #1 test job is running; now on suite 2."),
	]);
	const board = [item(1, "in_progress"), item(2), item(3, "completed")];
	const decision = (id: number, sources: string[]) => ({ id, kind: "keep", reason: "Record is accurate", sources });
	const order = new Map([
		["old", 0],
		["cutoff-not-a-message", 1],
		["fresh", 2],
	]);
	const isFresh = (_id: number, ref: string) => (order.get(ref) ?? -1) > order.get("cutoff-not-a-message")!;
	const check = (sources: string[]) =>
		parseChoices(
			{ items: [decision(1, sources), decision(2, []), decision(3, [])] },
			[1, 2, 3],
			board,
			refs,
			() => true,
			isFresh,
		)?.map((choice) => choice.kind);
	for (const sources of [[], ["old"], ["receipt"], ["after-anchor"]]) {
		expect(check(sources)).toEqual(["unverified", "keep", "keep"]);
	}
	expect(check(["fresh"])).toEqual(["keep", "keep", "keep"]);
	const prompt = makePrompt(board, [1], "Review", refs, new Map([[1, "cutoff-not-a-message"]]), isFresh);
	expect(prompt).toContain('[[1,{"after":"cutoff-not-a-message","candidates":["fresh"]}]]');
	expect(prompt).toContain('"old",{"role":"assistant"'); // Older records remain available as context.
});

it("requires exact item IDs and trusted original sources for operations", () => {
	const board = [item(1), item(2)];
	const refs = new Map([
		["u", { role: "user" as const, text: "Remove #1" }],
		["a", { role: "assistant" as const, text: "#2 completed" }],
	]);
	const keep = { id: 2, kind: "keep", reason: "Waiting on the configured dependency", sources: [] };
	const remove = { id: 1, kind: "delete", reason: "The user removed this work", sources: ["u"] };
	expect(parseChoices({ items: [remove, keep] }, [1, 2], board, refs)).toHaveLength(2);
	expect(parseChoices({ items: [remove, keep] }, [1, 2], board, refs, () => false)).toBeUndefined();
	const complete = {
		id: 1,
		kind: "update",
		reason: "The report names the whole item",
		sources: ["a"],
		patch: { status: "completed" },
	};
	expect(parseChoices({ items: [complete, keep] }, [1, 2], board, refs)).toBeUndefined();
	const reported = new Map(refs);
	reported.set("a", { role: "assistant", text: "Task #1 completed." });
	expect(parseChoices({ items: [complete, keep] }, [1, 2], board, reported)).toHaveLength(2);
	reported.set("a", { role: "assistant", text: "Task #1 not completed." });
	expect(parseChoices({ items: [complete, keep] }, [1, 2], board, reported)).toBeUndefined();
	expect(parseChoices({ items: [{ ...remove, sources: ["a"] }, keep] }, [1, 2], board, refs)).toBeUndefined();
	const unrelated = new Map(refs);
	unrelated.set("new-user", { role: "user", text: "Please explain the dependencies in the board." });
	expect(
		parseChoices({ items: [{ ...remove, sources: ["new-user"] }, keep] }, [1, 2], board, unrelated),
	).toBeUndefined();
	expect(parseChoices({ items: [remove, keep] }, [1, 2], board, unrelated)).toBeUndefined();
	expect(
		parseChoices(
			{ items: [{ ...remove, sources: ["new-user"], kind: "update", patch: { status: "in_progress" } }, keep] },
			[1, 2],
			board,
			unrelated,
		),
	).toBeUndefined();
	expect(parseChoices({ items: [keep, keep] }, [1, 2], board, refs)).toBeUndefined();
	expect(
		parseChoices({ items: [{ ...remove, kind: "update", patch: { id: 2 } }, keep] }, [1, 2], board, refs),
	).toBeUndefined();
});
