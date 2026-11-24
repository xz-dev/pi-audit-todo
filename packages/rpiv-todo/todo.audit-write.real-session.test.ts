import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionAPI,
	type ExtensionUIContext,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createMockUI } from "@juicesharp/rpiv-test-utils";
import { expect, it } from "vitest";
import todo from "./index.ts";
import { isTaskDetails } from "./state/replay.ts";
import { getState } from "./state/store.ts";
import { commitTodo } from "./todo.ts";

it("applies a guarded background update on the parent and persists the same board across resume", async () => {
	const root = mkdtempSync("/var/tmp/pi-audit-todo-parent-");
	const faux = fauxProvider({ provider: "faux", models: [{ id: "scripted" }] });
	const settingsManager = SettingsManager.inMemory();
	const runtime = await ModelRuntime.create({
		authPath: join(root, "auth.json"),
		modelsPath: join(root, "models.json"),
	});
	runtime.registerNativeProvider(faux.provider);
	let api: ExtensionAPI | undefined;
	let session: AgentSession | undefined;
	const uiContext = createMockUI();
	async function open(sessionManager: SessionManager) {
		const resourceLoader = new DefaultResourceLoader({
			cwd: root,
			agentDir: root,
			settingsManager,
			extensionFactories: [
				{
					name: "todo",
					factory: (pi) => {
						api = pi;
						todo(pi);
					},
				},
			],
		});
		await resourceLoader.reload();
		const { session } = await createAgentSession({
			cwd: root,
			agentDir: root,
			modelRuntime: runtime,
			resourceLoader,
			settingsManager,
			sessionManager,
			model: faux.getModel(),
		});
		await session.bindExtensions({ uiContext: uiContext as unknown as ExtensionUIContext });
		return session;
	}
	async function close() {
		await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
		session?.dispose();
		session = undefined;
	}
	try {
		session = await open(SessionManager.create(root, root));
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall("todo", { action: "create", tasks: [{ subject: "Prerequisite" }, { subject: "Work item" }] }),
			),
			fauxAssistantMessage(fauxToolCall("todo", { action: "update", id: 2, status: "in_progress" })),
			fauxAssistantMessage("Board prepared"),
		]);
		await session.prompt("Prepare the board");
		const sid = session.sessionManager.getSessionId();
		const expected = getState(sid).tasks[1];
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall("todo", { action: "update", id: 2, description: "Newer human-authorized detail" }),
			),
			fauxAssistantMessage("Updated"),
		]);
		await session.prompt("Add context to the work item");
		const update = { id: 2, status: "pending" as const, addBlockedBy: [1] };
		expect(commitTodo(api!, sid, "update", update, (board) => board.tasks[1] === expected)).toBeUndefined();
		const latest = getState(sid).tasks[1];
		const before = session.sessionManager.getBranch().length;
		expect(commitTodo(api!, sid, "update", update, (board) => board.tasks[1] === latest)?.op.kind).toBe("update");
		expect(
			session.sessionManager
				.getBranch()
				.slice(before)
				.map((e) => e.type),
		).toEqual(["custom"]);
		const file = session.sessionFile;
		await session.prompt("/todos");
		expect(uiContext.notify).toHaveBeenLastCalledWith(expect.stringMatching(/#2 Work item.*#1/), "info");
		await close();
		if (!file) throw new Error("Expected a persisted parent session");
		session = await open(SessionManager.open(file, root));
		await session.prompt("/todos");
		expect(uiContext.notify).toHaveBeenCalledWith(expect.stringContaining("Work item"), "info");
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("todo", { action: "list" })),
			fauxAssistantMessage("Listed"),
		]);
		await session.prompt("List the recorded tasks");
		const results = session.sessionManager
			.getBranch()
			.flatMap((e) => (e.type === "message" && e.message.role === "toolResult" ? [e.message] : []));
		const details = results.at(-1)?.details;
		if (!isTaskDetails(details)) throw new Error("Missing TODO list result");
		expect(details.tasks[1]).toMatchObject({
			id: 2,
			status: "pending",
			blockedBy: [1],
			description: "Newer human-authorized detail",
		});
		const prior = getState(sid).tasks[1];
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("todo", { action: "clear" })),
			fauxAssistantMessage(
				fauxToolCall("todo", { action: "create", tasks: [{ subject: "Prerequisite" }, { subject: "Work item" }] }),
			),
			fauxAssistantMessage("New board"),
		]);
		await session.prompt("Reset the board and create new entries");
		expect(getState(sid).tasks[1]).toMatchObject({ id: 2, subject: "Work item" });
		expect(commitTodo(api!, sid, "delete", { id: 2 }, (board) => board.tasks[1] === prior)).toBeUndefined();
		expect(getState(sid).tasks[1].status).toBe("pending");
	} finally {
		await close();
		rmSync(root, { recursive: true, force: true });
	}
});
