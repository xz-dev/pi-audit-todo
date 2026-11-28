import { fauxProvider } from "@earendil-works/pi-ai";
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi } from "@juicesharp/rpiv-test-utils";
import type { PrivateInquiryOptions, PrivateRuntime } from "pi-extension-utils/private-inquiry";
import { afterEach, expect, it, vi } from "vitest";
import { evictSession, getState, replaceState } from "../state/store.ts";
import type { Task } from "../tool/types.ts";
import { createActivityDomain } from "./activity.ts";
import type { Choice } from "./decision.ts";
import { installTodoAudit } from "./extension.ts";
import { REVIEW_ENTRY, replayAudit, WORK_LIMIT_MS } from "./history.ts";

const model = fauxProvider({ provider: "faux", models: [{ id: "script" }] }).getModel();
const historyStamp = "2026-01-01T00:00:00.000Z";
const row = (id: number, status: Task["status"] = "pending"): Task => ({ id, subject: `item ${id}`, status });
const keep = (id: number, sources: string[] = []) => ({
	id,
	kind: "keep",
	reason: `Item ${id} still represents acknowledged work`,
	sources,
});

const unverified = (id: number, reason: string) => ({ id, kind: "unverified", reason, sources: [] });

function harness(enabled = true) {
	const branch: SessionEntry[] = [];
	const sid = "audit-test";
	let id = 0;
	let working = false;
	let workMs = 0;
	let answer: (options: PrivateInquiryOptions<Choice[]>) => unknown | Promise<unknown> = () => undefined;
	const activity = createActivityDomain({});
	const createRuntime = vi.fn<() => Promise<PrivateRuntime>>(async () => ({
		fork: vi.fn().mockRejectedValue(new Error("Unexpected native call in scripted-decision test")),
		dispose: vi.fn(),
	}));
	const run = vi.fn(async (opts: PrivateInquiryOptions<Choice[]>) => {
		opts.prompt("result.json");
		if (!opts.isCurrent()) return { kind: "cancelled" as const };
		const verdict = opts.validate(await answer(opts));
		return verdict.valid
			? { kind: "decision" as const, sessionId: "private", decision: verdict.value, reconsidered: false }
			: {
					kind: "decision-failed" as const,
					error: opts.correction(verdict.error, "result.json"),
					sessionId: "private",
					reconsidered: false,
				};
	});
	const nextEntry = () => ({ id: `e${++id}`, parentId: branch.at(-1)?.id ?? null, timestamp: historyStamp });
	const { pi, captured } = createMockPi({
		appendEntry: vi.fn((customType, data) => {
			branch.push({ ...nextEntry(), type: "custom", customType, data });
		}),
	});
	const ctx = createMockCtx({ sid, sessionId: sid, branch, model } as Parameters<typeof createMockCtx>[0]);
	Object.assign(ctx, { isIdle: () => !working });
	Object.assign(ctx.sessionManager, { getEntry: (key: string) => branch.find((entry) => entry.id === key) });
	const refresh = vi.fn(async () => {});
	installTodoAudit(pi, refresh, {
		enabled,
		now: () => workMs,
		activity: Object.assign(activity, { open: async () => {}, close: async () => {} }),
		createRuntime,
		run,
	});
	const emit = async (name: string, ev = {}) => {
		for (const handle of captured.events.get(name) ?? []) await handle(ev, ctx);
	};
	const user = (content: string) => {
		const e = {
			...nextEntry(),
			type: "message",
			message: { role: "user", content, timestamp: 0 },
		} as SessionMessageEntry;
		branch.push(e);
		return e.id;
	};
	return {
		branch,
		pi,
		ctx,
		commands: captured.commands,
		run,
		refresh,
		emit,
		respond: (fn: typeof answer) => {
			answer = fn;
		},
		lastReport: () =>
			[...branch].reverse().find((entry) => entry.type === "message" && entry.message.role === "assistant")!.id,
		async start() {
			await emit("session_start");
			user("Please keep the board accurate.");
		},
		async startWork() {
			working = true;
			await emit("agent_start");
		},
		async settle() {
			working = false;
			await emit("agent_settled", { aborted: false });
		},
		advance(ms: number) {
			workMs += ms;
		},
		board(tasks: Task[]) {
			const nextId = Math.max(0, ...tasks.map((task) => task.id)) + 1;
			replaceState(sid, { tasks, nextId });
			pi.appendEntry("rpiv-todo-state", { action: "update", tasks, nextId, params: {} });
		},
		async loop(text = "Work report") {
			const entry = {
				...nextEntry(),
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text }],
					stopReason: "stop",
					timestamp: 0,
				},
			} as SessionMessageEntry;
			branch.push(entry);
			await emit("turn_end", { messageEntryId: entry.id, outcome: "completed" });
			return entry.id;
		},
		async command(name: string, args = "") {
			const handler = captured.commands.get(name)?.handler;
			await handler?.(args, ctx as never);
		},
		state: () => getState(sid),
		async close() {
			await emit("session_shutdown");
			evictSession(sid);
		},
	};
}

afterEach(() => vi.useRealTimers());

it("writes a private result through the board once, keeps siblings with reasons, and does not wake the agent", async () => {
	const h = harness();
	try {
		await h.start();
		await h.startWork();
		const a = row(1, "in_progress");
		h.board([a, row(2)]);
		const progress = await h.loop("Task #1 is actively debugging the failing fixture tests.");
		expect(h.run).not.toHaveBeenCalled();
		h.respond(() => ({
			items: [
				keep(1, [progress]),
				{
					id: 2,
					kind: "update",
					reason: "This item waits for the existing prerequisite.",
					sources: [h.lastReport()],
					patch: { status: "pending", description: "Waiting for #1", addBlockedBy: [1] },
				},
			],
		}));
		h.board([a, row(2, "in_progress")]);
		await h.loop("Task #2 work has stopped until task #1 fixes the fixture.");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledOnce());
		expect(h.state().tasks[1]).toMatchObject({ status: "pending", blockedBy: [1] });
		expect(replayAudit(h.branch).items.get(2)?.task).toMatchObject({ status: "pending", blockedBy: [1] });
		expect(h.refresh).toHaveBeenCalledOnce();
		expect(h.pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("dependencies: #1") }),
			{ deliverAs: "steer", triggerTurn: false },
		);
		expect(h.branch.filter((e) => e.type === "custom" && e.customType === REVIEW_ENTRY)).toHaveLength(1);
		await h.loop();
		await h.settle();
		expect(h.run).toHaveBeenCalledOnce();
	} finally {
		await h.close();
	}
});

it.each([keep(1), unverified(1, "The parser is underway, but its integration is deferred; track those separately.")])(
	"reports $kind without renewing the item or blocking an independent correction",
	async (choice) => {
		const h = harness();
		try {
			await h.start();
			h.board([row(1, "in_progress"), row(2), row(3)]);
			await h.loop();
			h.board([row(1, "in_progress"), row(2, "in_progress"), row(3)]);
			h.respond(() => ({
				items: [
					choice,
					{
						id: 2,
						kind: "update",
						reason: "Work stopped until task #3 supplies a fixture.",
						sources: [h.lastReport()],
						patch: { status: "pending", addBlockedBy: [3] },
					},
				],
			}));
			await h.loop("Task #2 is no longer underway and waits for task #3's fixture.");
			await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledOnce());
			const receipt = vi.mocked(h.pi.sendMessage).mock.calls[0];
			expect(receipt).toMatchObject([
				{
					content: expect.stringContaining(
						`#1 unverified: ${choice.kind === "unverified" ? choice.reason : "No fresh original evidence"}`,
					),
				},
				{ triggerTurn: false },
			]);
			expect(JSON.stringify(receipt[0])).toContain("dependencies: #3");
			expect(h.state().tasks).toMatchObject([row(1, "in_progress"), { ...row(2), blockedBy: [3] }, row(3)]);
			expect(h.branch.find((entry) => entry.type === "custom" && entry.customType === REVIEW_ENTRY)).toMatchObject({
				data: [expect.objectContaining({ id: 2 })],
			});
		} finally {
			await h.close();
		}
	},
);

it("does not renew a dependent item after its prerequisite changes in the same batch", async () => {
	const h = harness();
	try {
		await h.start();
		h.board([row(1, "in_progress"), { ...row(2), blockedBy: [1] }]);
		await h.loop();
		h.respond(() => ({
			items: [
				{
					id: 1,
					kind: "update",
					reason: "The prerequisite needs clarification.",
					sources: [h.lastReport()],
					patch: { status: "pending" },
				},
				keep(2, [h.lastReport()]),
			],
		}));
		h.board([row(1, "in_progress"), { ...row(2, "in_progress"), blockedBy: [1] }]);
		await h.loop("Task #1 paused pending clarification. A separate worker is testing task #2.");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledOnce());
		expect(h.pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("#2 skipped") }),
			expect.anything(),
		);
		const entry = h.branch.find((e) => e.type === "custom" && e.customType === REVIEW_ENTRY);
		expect(entry).toMatchObject({ data: [{ id: 1 }] });
	} finally {
		await h.close();
	}
});

it("uses a working-time deadline before the next loop and arms no review when everybody is idle", async () => {
	vi.useFakeTimers();
	const h = harness();
	try {
		await h.start();
		h.board([row(1)]);
		await h.loop();
		h.respond(() => ({ items: [keep(1)] }));
		h.advance(WORK_LIMIT_MS * 2);
		await vi.advanceTimersByTimeAsync(WORK_LIMIT_MS * 2);
		expect(h.run).not.toHaveBeenCalled();
		await h.startWork();
		h.advance(WORK_LIMIT_MS);
		await vi.advanceTimersByTimeAsync(WORK_LIMIT_MS);
		expect(h.run).not.toHaveBeenCalled();
		h.advance(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(h.run).toHaveBeenCalledOnce();
		expect(h.pi.sendMessage).toHaveBeenCalledOnce();
		await h.settle();
	} finally {
		await h.close();
	}
});

it("accepts an overlapping report only once and preserves observations made while the fork runs", async () => {
	const h = harness();
	try {
		await h.start();
		await h.startWork();
		const replies: ((result: unknown) => void)[] = [];
		h.respond(() => new Promise((resolve) => replies.push(resolve)));
		h.board([row(1, "in_progress"), row(2, "in_progress")]);
		const first = await h.loop("The #1 unit tests and #2 integration tests are running in separate jobs.");
		await vi.waitFor(() => expect(replies).toHaveLength(2));
		const newer = await h.loop(
			"The #1 unit test job reached suite 2; the #2 integration job has started browser tests.",
		);
		const result = (ref: string) => ({ items: [keep(1, [ref]), keep(2, [ref])] });
		replies[0](result(first));
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(1));
		const cutoff = h.run.mock.calls[0][0].fork.anchorId;
		expect(replayAudit(h.branch).items.get(1)?.activeCutoff).toBe(cutoff);
		replies[1](result(first));
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(2));
		expect(h.pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("#1 unverified: newer review already covers this evidence"),
			}),
			{ deliverAs: "steer", triggerTurn: false },
		);
		expect(h.branch.filter((entry) => entry.type === "custom" && entry.customType === REVIEW_ENTRY)).toHaveLength(1);
		await h.command("todo-audit");
		expect(h.run).toHaveBeenCalledTimes(2);
		h.respond(() => result(newer));
		h.advance(WORK_LIMIT_MS + 1);
		await h.command("todo-audit");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(3));
		expect(h.pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining("#1 kept:") }),
			{ deliverAs: "steer", triggerTurn: false },
		);
		expect(h.branch.filter((entry) => entry.type === "custom" && entry.customType === REVIEW_ENTRY)).toHaveLength(2);
	} finally {
		await h.close();
	}
});

it("replays a single overdue item's checkpoint, ignores a repeated report, and accepts new progress", async () => {
	const h = harness();
	try {
		await h.start();
		await h.startWork();
		const task = row(1, "in_progress");
		h.board([task]);
		const first = await h.loop("Task #1's test run is still executing, now on its second suite.");
		h.respond(() => ({ items: [keep(1, [first])] }));
		h.advance(WORK_LIMIT_MS + 1);
		await h.command("todo-audit");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(1));
		const before = replayAudit(h.branch).items.get(1);
		const reviewed = replayAudit(h.branch).reviews.get(1);
		expect(reviewed?.evidenceCutoff).toBeDefined();
		await h.emit("session_tree");
		h.advance(WORK_LIMIT_MS + 1);
		await h.command("todo-audit");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(2));
		expect(h.pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining("#1 unverified: No fresh original evidence") }),
			{ deliverAs: "steer", triggerTurn: false },
		);
		expect(replayAudit(h.branch).reviews.get(1)).toEqual(reviewed);
		await h.command("todo-audit");
		expect(h.run).toHaveBeenCalledTimes(2);
		const latest = await h.loop("Task #1's same test run is still executing, now on its final suite.");
		h.respond(() => ({ items: [keep(1, [latest])] }));
		h.advance(60_001);
		await h.command("todo-audit");
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledTimes(3));
		expect(replayAudit(h.branch).reviews.get(1)?.evidenceCutoff).not.toBe(reviewed?.evidenceCutoff);
		expect(replayAudit(h.branch).items.get(1)?.revision).toBe(before?.revision);
		expect(h.state().tasks).toEqual([task]);
	} finally {
		await h.close();
	}
});

it("does not publish after cancellation, and emits no success for a malformed or unsubstantiated decision", async () => {
	const h = harness();
	try {
		await h.start();
		let release!: (result: unknown) => void;
		h.respond(
			() =>
				new Promise((done) => {
					release = done;
				}),
		);
		h.board([row(1, "in_progress"), row(2, "in_progress")]);
		await h.loop();
		await vi.waitFor(() => expect(h.run).toHaveBeenCalledTimes(2));
		const calls = h.run.mock.calls;
		await h.command("cancel-todo-audit");
		expect(calls.every(([opt]) => opt.signal?.aborted)).toBe(true);
		release({ items: [keep(1), keep(2)] });
		await Promise.resolve();
		expect(h.pi.sendMessage).not.toHaveBeenCalled();
		expect(h.state().tasks).toEqual([row(1, "in_progress"), row(2, "in_progress")]);
	} finally {
		await h.close();
	}
});

it("registers the renamed manual check even when maintenance is disabled", async () => {
	const h = harness(false);
	try {
		await h.start();
		expect(h.commands.has("todo-audit")).toBe(true);
		expect(h.commands.has("jev-audit")).toBe(false);
		await h.command("todo-audit");
		expect(h.ctx.ui.notify).toHaveBeenCalledWith("TODO maintenance is disabled.", "info");
		expect(h.run).not.toHaveBeenCalled();
	} finally {
		await h.close();
	}
});

it("manually reviews only due items once and never starts a review for an argument", async () => {
	const h = harness();
	let finish!: (answer: unknown) => void;
	h.respond(() => new Promise((resolve) => (finish = resolve)));
	try {
		await h.start();
		await h.startWork();
		h.board([row(1)]);
		await h.command("todo-audit");
		expect(h.run).not.toHaveBeenCalled();

		h.advance(WORK_LIMIT_MS + 1);
		await h.emit("session_compact"); // Persist work elapsed before adding the fresh item.
		h.board([row(1), row(2)]);
		await h.command("todo-audit", "full");
		expect(h.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("retired"), "info");
		await h.command("todo-audit", "unexpected");
		expect(h.ctx.ui.notify).toHaveBeenCalledWith("Usage: /todo-audit", "info");
		expect(h.run).not.toHaveBeenCalled();

		await h.command("todo-audit");
		await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
		await h.command("todo-audit");
		expect(h.run).toHaveBeenCalledOnce();

		finish({ items: [keep(1)] });
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledOnce());
		expect(h.branch.find((entry) => entry.type === "custom" && entry.customType === REVIEW_ENTRY)).toMatchObject({
			data: [expect.objectContaining({ id: 1 })],
		});
	} finally {
		await h.close();
		finish?.({ items: [keep(1)] });
	}
});
