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
import { REVIEW_ENTRY, WORK_LIMIT_MS } from "./history.ts";

const model = fauxProvider({ provider: "faux", models: [{ id: "script" }] }).getModel();
const historyStamp = "2026-01-01T00:00:00.000Z";
const row = (id: number, status: Task["status"] = "pending"): Task => ({ id, subject: `item ${id}`, status });
const keep = (id: number) => ({
	id,
	kind: "keep",
	reason: `Item ${id} still represents acknowledged work`,
	sources: [],
});

function harness() {
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
		enabled: true,
		now: () => workMs,
		activity: { ...activity, open: async () => {}, close: async () => {} },
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
		run,
		refresh,
		emit,
		respond: (fn: typeof answer) => {
			answer = fn;
		},
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
		async loop() {
			const entry = {
				...nextEntry(),
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Work report" }],
					stopReason: "stop",
					timestamp: 0,
				},
			} as SessionMessageEntry;
			branch.push(entry);
			await emit("turn_end", { messageEntryId: entry.id, outcome: "completed" });
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
		await h.loop();
		expect(h.run).not.toHaveBeenCalled();
		h.respond(() => ({
			items: [
				keep(1),
				{
					id: 2,
					kind: "update",
					reason: "This item waits for the existing prerequisite.",
					sources: ["e1"],
					patch: { status: "pending", description: "Waiting for #1", addBlockedBy: [1] },
				},
			],
		}));
		h.board([a, row(2, "in_progress")]);
		await h.loop();
		await vi.waitFor(() => expect(h.pi.sendMessage).toHaveBeenCalledOnce());
		expect(h.state().tasks[1]).toMatchObject({ status: "pending", blockedBy: [1] });
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
					sources: ["e1"],
					patch: { status: "pending" },
				},
				keep(2),
			],
		}));
		h.board([row(1, "in_progress"), { ...row(2, "in_progress"), blockedBy: [1] }]);
		await h.loop();
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
		await h.command("jev-audit", "full");
		expect(h.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("retired"), "info");
	} finally {
		await h.close();
	}
});
