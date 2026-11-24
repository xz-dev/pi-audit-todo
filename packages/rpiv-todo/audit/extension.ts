import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { probePiAgentState } from "pi-extension-utils/pi-agent-state";
import { captureAnchor, type PrivateRuntime, runPrivateInquiry } from "pi-extension-utils/private-inquiry";
import { getState, sid } from "../state/store.ts";
import { commitTodo } from "../todo.ts";
import { sanitizeTerminalText } from "../tool/sanitize.ts";
import type { Task } from "../tool/types.ts";
import { createActivityDomain, WorkClock } from "./activity.ts";
import { type Choice, evidence, makePrompt, parseChoices } from "./decision.ts";
import {
	activeIds,
	CLOCK_ENTRY,
	dueItems,
	type History,
	newActivations,
	ordinaryLoop,
	REVIEW_ENTRY,
	type Reviewed,
	replayAudit,
	reviewBaseline,
	SETTLED_ENTRY,
	WORK_LIMIT_MS,
} from "./history.ts";

const RECEIPT = "pi-audit-todo";
const RETRY_WORK_MS = 60_000;
const MAX_RUNNING = 2;
const MAINTENANCE_BATCH = 16;
const domain = createActivityDomain();
const participants = new Set<object>();
let root: object | undefined;

export interface AuditOptions {
	enabled: boolean;
	createRuntime?: () => Promise<PrivateRuntime>;
	run?: typeof runPrivateInquiry<Choice[]>;
	now?: () => number;
	activity?: ReturnType<typeof createActivityDomain>;
}

interface Job {
	ids: number[];
	parallel?: number;
	key: string;
	history: History;
	anchor: string;
	model: string;
	ctx: ExtensionContext;
	abort: AbortController;
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((id) => b.includes(id));
}

function changes(before: Task | undefined, after: Task | undefined): string {
	if (!before || !after) return "changed";
	const fields: string[] = [];
	if (before.status !== after.status) fields.push(`${before.status} → ${after.status}`);
	if (before.description !== after.description) fields.push("description updated");
	if (before.activeForm !== after.activeForm) fields.push("activity label updated");
	if (!sameIds(before.blockedBy ?? [], after.blockedBy ?? [])) {
		fields.push(
			after.blockedBy?.length
				? `dependencies: ${after.blockedBy.map((id) => `#${id}`).join(", ")}`
				: "dependencies cleared",
		);
	}
	return fields.join("; ") || "updated";
}

/** The only parent write path is the board owner's synchronous tool commit lane. */
export function installTodoAudit(pi: ExtensionAPI, refresh: () => Promise<void>, options: AuditOptions) {
	const activity = options.activity ?? domain;
	const token = {};
	const attachments = new Map<string, object>();
	let ctx: ExtensionContext | undefined;
	let clock = new WorkClock(0, options.now);
	let lastPersisted = 0;
	let deadline: ReturnType<typeof setTimeout> | undefined;
	let stopActivity: (() => void) | undefined;
	let runtime: Promise<PrivateRuntime> | undefined;
	const queue = new Map<string, Job>();
	const running = new Map<string, Job>();
	const retry = new Map<string, { loops: number; workMs: number }>();
	const retired = () => root !== token || !ctx;
	const history = () => replayAudit(ctx?.sessionManager.getBranch() ?? []);
	const checkpoint = () => {
		if (retired()) return;
		const workMs = clock.at();
		if (workMs <= lastPersisted) return;
		try {
			pi.appendEntry(CLOCK_ENTRY, workMs);
			lastPersisted = workMs;
		} catch {
			// A bookkeeping failure must never prevent ordinary board operations.
		}
	};
	const overdueKey = (id: number, revision: string) => `${id}:${revision}`;
	const reserved = (id: number, revision: string) =>
		[...queue.values(), ...running.values()].some(
			(job) => job.ids.includes(id) && job.history.items.get(id)?.revision === revision,
		);
	const backoff = (id: number, revision: string, h: History) => {
		const failure = retry.get(overdueKey(id, revision));
		return !!failure && h.loops - failure.loops < 10 && clock.at() - failure.workMs < RETRY_WORK_MS;
	};
	const disabled = () => options.enabled === false || process.env.PI_AUDIT_TODO_DISABLE === "1";
	const warn = (message: string) => ctx?.ui.notify(message, "warning");

	function retire() {
		clearTimeout(deadline);
		deadline = undefined;
		for (const job of running.values()) job.abort.abort();
		for (const job of queue.values()) job.abort.abort();
		queue.clear();
		retry.clear();
	}

	function current(job: Job, now = history()): boolean {
		return (
			!retired() &&
			!job.abort.signal.aborted &&
			sid(ctx!) === sid(job.ctx) &&
			ctx!.sessionManager.getBranch().some((entry) => entry.id === job.anchor) &&
			now.generation === job.history.generation &&
			now.user === job.history.user
		);
	}

	function enqueue(h: History, ids: number[], parallel?: number) {
		if (!ctx?.model || ids.length === 0) return;
		try {
			const anchor = captureAnchor(ctx.sessionManager);
			const key = `${parallel ?? "maintenance"}:${h.loops}:${ids.map((id) => overdueKey(id, h.items.get(id)!.revision)).join(",")}`;
			if (queue.has(key) || running.has(key)) return;
			queue.set(key, {
				key,
				ids,
				parallel,
				history: h,
				ctx,
				anchor,
				abort: new AbortController(),
				model: `${ctx.model.provider}/${ctx.model.id}:${pi.getThinkingLevel()}`,
			});
		} catch {
			// The timer can fire before the first persisted, closed assistant/tool prefix.
			// Work becomes eligible again at the next official settled loop.
		}
	}

	function settle(job: Job, decisions: Choice[]) {
		const snapshot = history();
		if (!current(job, snapshot)) return;
		const coversCohort = job.parallel === undefined || sameIds(job.ids, activeIds(snapshot));
		const cohortCurrent =
			coversCohort &&
			(job.parallel === undefined ||
				job.ids.every((id) => snapshot.items.get(id)?.revision === job.history.items.get(id)?.revision));
		const originalBoard = getState(sid(job.ctx));
		const lines: string[] = [];
		const accepted: number[] = [];
		let changed = false;
		for (const choice of decisions) {
			const before = snapshot.items.get(choice.id);
			const original = job.history.items.get(choice.id);
			const deps = new Set([
				...(original?.task.blockedBy ?? []),
				...(choice.kind === "update"
					? [...(choice.patch.addBlockedBy ?? []), ...(choice.patch.removeBlockedBy ?? [])]
					: []),
			]);
			const staleDep = [...deps].some(
				(id) => snapshot.items.get(id)?.revision !== job.history.items.get(id)?.revision,
			);
			if (!cohortCurrent || !before || before.revision !== original?.revision || staleDep) {
				lines.push(`#${choice.id} skipped: newer board information.`);
				continue;
			}
			const reason = sanitizeTerminalText(choice.reason).replace(/\s+/g, " ");
			if (choice.kind === "keep") {
				accepted.push(choice.id);
				lines.push(`#${choice.id} kept: ${reason}`);
				continue;
			}
			try {
				const passed = commitTodo(
					pi,
					sid(job.ctx),
					choice.kind,
					choice.kind === "update" ? choice.patch : { id: choice.id },
					(board) => {
						const live = board.tasks.find((task) => task.id === choice.id);
						return (
							live === originalBoard.tasks.find((task) => task.id === choice.id) &&
							JSON.stringify(live) === JSON.stringify(before.task)
						);
					},
					checkpoint,
				);
				if (!passed || passed.op.kind === "error" || (passed.op.kind === "update" && !passed.op.changed)) {
					lines.push(`#${choice.id} not changed: board rejected the proposed operation or it had no effect.`);
					continue;
				}
				changed = true;
				accepted.push(choice.id);
				lines.push(
					`#${choice.id} ${changes(
						before.task,
						passed.state.tasks.find((t) => t.id === choice.id),
					)}: ${reason}`,
				);
			} catch {
				lines.push(`#${choice.id} write unverified; check the persisted board before retrying.`);
			}
		}
		if (changed)
			void refresh().catch(() => warn("TODO audit updated the board, but its panel could not be refreshed."));
		const final = history();
		const reviews: Reviewed[] = accepted.flatMap((id) => {
			const item = final.items.get(id);
			return item ? [{ id, revision: item.revision, loops: final.loops, workMs: clock.at() }] : [];
		});
		for (const id of job.ids) {
			const version = final.items.get(id)?.revision;
			if (version && !accepted.includes(id))
				retry.set(overdueKey(id, version), { loops: final.loops, workMs: clock.at() });
		}
		try {
			if (reviews.length) {
				checkpoint();
				pi.appendEntry(REVIEW_ENTRY, reviews);
			}
		} catch {
			lines.push("Review checkpoint unverified; the board changes listed above were applied independently.");
		}
		if (lines.length)
			pi.sendMessage(
				{
					customType: RECEIPT,
					display: true,
					content: [
						job.parallel === undefined
							? "TODO audit · maintenance"
							: `TODO audit · parallel work (#${job.parallel})`,
						...lines,
						"Board bookkeeping only; this does not authorize or request additional work.",
					].join("\n"),
					details: { key: job.key },
				},
				{ deliverAs: "steer", triggerTurn: false },
			);
	}

	async function reflect(job: Job) {
		if (!current(job)) return;
		const create =
			options.createRuntime ??
			(() => import("private-inquiry-subagents-runtime/watchdog-runtime").then((m) => m.createWatchdogRuntime()));
		runtime ??= create().catch((error: unknown) => {
			runtime = undefined;
			throw error;
		});
		const ready = await runtime;
		if (!current(job)) return;
		const prefix = job.ctx.sessionManager.getBranch();
		const segment = prefix.slice(0, prefix.findIndex((entry) => entry.id === job.anchor) + 1);
		const refs = evidence(segment);
		const sourceOrder = new Map(segment.map((entry, index) => [entry.id, index]));
		const board = [...job.history.items.values()].map((item) => item.task);
		const result = await (options.run ?? runPrivateInquiry<Choice[]>)({
			runtime: ready,
			fork: {
				parent: job.ctx.sessionManager,
				parentProviderRegistry: job.ctx.modelRegistry,
				cwd: job.ctx.cwd,
				anchorId: job.anchor,
				model: job.model,
				retryPolicy: "native",
				profile: { kind: "read-only-evidence", maxHelperCalls: 4 },
			},
			signal: job.abort.signal,
			isCurrent: () => current(job),
			validate: (value) => {
				const choices = parseChoices(value, job.ids, board, refs, (id, ref) => {
					const created = job.history.items.get(id)?.created;
					const origin = created ? sourceOrder.get(created) : undefined;
					return origin !== undefined && (sourceOrder.get(ref) ?? -1) > origin;
				});
				return choices
					? { valid: true, value: choices }
					: {
							valid: false,
							error: "Use only requested IDs, concrete reasons, original evidence IDs, and allowed operations.",
						};
			},
			prompt: () =>
				makePrompt(
					board,
					job.ids,
					job.parallel === undefined
						? "These TODO items need periodic maintenance."
						: `Activity #${job.parallel} became active with ${job.ids.length} concurrent entries. Account for the entire active set.`,
					refs,
				),
			correction: (error) => `No result was accepted: ${error}. Return a complete corrected result.`,
		});
		if (result.kind === "decision") settle(job, result.decision);
		else if (result.kind !== "cancelled" && current(job))
			throw new Error("Private TODO review did not produce an accepted decision.");
	}

	function pump() {
		for (const [key, job] of queue) {
			if (running.size >= MAX_RUNNING || retired()) return;
			queue.delete(key);
			running.set(key, job);
			void reflect(job)
				.catch(() => {
					if (!current(job)) return;
					const h = history();
					for (const id of job.ids) {
						const version = h.items.get(id)?.revision;
						if (version) retry.set(overdueKey(id, version), { loops: h.loops, workMs: clock.at() });
					}
					warn("TODO audit: private review failed; no unverified result was applied.");
				})
				.finally(() => {
					running.delete(key);
					pump();
					arm();
				});
		}
	}

	function arm() {
		clearTimeout(deadline);
		deadline = undefined;
		if (retired() || !clock.busy || !ctx?.model) return;
		const h = history();
		const workMs = clock.at();
		let next = Number.POSITIVE_INFINITY;
		for (const item of h.items.values()) {
			const base = reviewBaseline(h, item);
			const id = item.task.id;
			if (!base || reserved(id, item.revision)) continue;
			const failure = retry.get(overdueKey(id, item.revision));
			const when = Math.max(base.workMs + WORK_LIMIT_MS + 1, failure ? failure.workMs + RETRY_WORK_MS : 0);
			// If the anchor is not replayable yet, wait for a settled main loop
			// rather than running a timer hot against an open tool batch.
			if (when > workMs) next = Math.min(next, when);
		}
		if (!Number.isFinite(next)) return;
		deadline = setTimeout(
			() => {
				if (retired()) return;
				checkpoint();
				checkDue();
			},
			Math.max(1, next - workMs),
		);
		deadline.unref?.();
	}

	function checkDue() {
		if (retired()) return;
		const h = history();
		const allowed = dueItems(h, clock.at()).filter(
			(item) => !reserved(item.task.id, item.revision) && !backoff(item.task.id, item.revision, h),
		);
		for (let index = 0; index < allowed.length; index += MAINTENANCE_BATCH)
			enqueue(
				h,
				allowed.slice(index, index + MAINTENANCE_BATCH).map((item) => item.task.id),
			);
		pump();
		arm();
	}

	function reset(branch: ExtensionContext) {
		ctx = branch;
		retire();
		const h = history();
		clock = new WorkClock(h.workMs, options.now);
		lastPersisted = h.workMs;
		clock.setBusy(activity.busy);
		if (!h.settled && h.items.size) pi.appendEntry(SETTLED_ENTRY, { generation: h.generation, ids: activeIds(h) });
		arm();
	}

	function observe(from: ExtensionContext) {
		const attachment = attachments.get(sid(from));
		if (attachment) activity.observe(attachment, probePiAgentState(from).busy);
	}

	pi.on("session_start", (_event, from) => {
		if (disabled() || typeof from.isIdle !== "function" || typeof from.sessionManager.getLeafId !== "function")
			return;
		const id = sid(from);
		if (!id) return;
		if (!attachments.has(id)) attachments.set(id, {});
		participants.add(token);
		if (!root && !activity.isClient) {
			root = token;
			reset(from);
			stopActivity = activity.subscribe((busy) => {
				clock.setBusy(busy);
				if (!busy) checkpoint();
				checkDue();
			});
		}
		void activity
			.open()
			.catch(() =>
				from.ui.notify(
					"TODO audit could not observe child-process activity; local work is still counted.",
					"warning",
				),
			);
		observe(from);
	});
	pi.on("agent_start", (_event, from) => observe(from));
	pi.on("turn_start", (_event, from) => observe(from));
	pi.on("agent_settled", (event, from) => {
		if (event.aborted && !retired() && sid(from) === sid(ctx!)) retire();
		observe(from);
	});
	pi.on("message_start", (event, from) => {
		if (
			retired() ||
			sid(from) !== sid(ctx!) ||
			event.message.role !== "user" ||
			("source" in event.message && event.message.source === "extension")
		)
			return;
		retire();
	});
	pi.on("turn_end", (event, from) => {
		observe(from);
		if (retired() || sid(from) !== sid(ctx!)) return;
		const entry = from.sessionManager.getEntry(event.messageEntryId);
		if (!entry || !ordinaryLoop(entry) || event.outcome === "aborted") return;
		ctx = from;
		checkpoint();
		const h = history();
		const active = activeIds(h);
		const prior = h.settled?.generation === h.generation ? h.settled.ids : [];
		if (!sameIds(prior, active) || h.settled?.generation !== h.generation) {
			pi.appendEntry(SETTLED_ENTRY, { generation: h.generation, ids: active });
			const settled = history();
			for (const id of newActivations(prior, active)) enqueue(settled, active, id);
		}
		checkDue();
	});
	pi.on("session_tree", (_event, from) => {
		if (!retired() && sid(from) === sid(ctx!)) reset(from);
	});
	pi.on("session_compact", (_event, from) => {
		if (!retired() && sid(from) === sid(ctx!)) {
			ctx = from;
			checkpoint();
			arm();
		}
	});
	pi.on("session_shutdown", (_event, from) => {
		const id = sid(from);
		const attachment = attachments.get(id);
		if (!attachment) return;
		if (root === token && ctx && sid(ctx) === id) {
			checkpoint();
			root = undefined;
			ctx = undefined;
			retire();
			stopActivity?.();
			stopActivity = undefined;
			void runtime?.then((instance) => instance.dispose()).catch(() => {});
			runtime = undefined;
		}
		activity.observe(attachment, false);
		attachments.delete(id);
		if (attachments.size === 0) participants.delete(token);
		if (!participants.size) void activity.close().catch(() => {});
	});
	pi.registerCommand("cancel-todo-audit", {
		description: "Cancel background TODO audits for this session without stopping the agent",
		handler: async (_args, from) => {
			if (retired() || sid(from) !== sid(ctx!) || (!queue.size && !running.size)) return;
			const h = history();
			const ids = [...queue.values(), ...running.values()].flatMap((job) => job.ids);
			retire();
			for (const id of ids) {
				const version = h.items.get(id)?.revision;
				if (version) retry.set(overdueKey(id, version), { loops: h.loops, workMs: clock.at() });
			}
			arm();
			from.ui.notify("Cancelled this session’s background TODO reviews.", "info");
		},
	});
	pi.registerCommand("jev-audit", {
		description: "Check for due TODO maintenance (legacy command name)",
		handler: async (args, from) => {
			if (args.trim() === "full") {
				from.ui.notify("JEV full reassessment has been retired.", "info");
				return;
			}
			if (args.trim()) {
				from.ui.notify("Usage: /jev-audit", "info");
				return;
			}
			if (disabled()) {
				from.ui.notify("TODO maintenance is disabled.", "info");
				return;
			}
			if (!retired() && sid(from) === sid(ctx!)) {
				ctx = from;
				checkDue();
			}
		},
	});
	return (id: string) => {
		if (!retired() && sid(ctx!) === id) checkpoint();
	};
}
