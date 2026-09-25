import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import registerTodo from "./index.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	strikethrough: (text: string) => text,
};

function mount(ui: ExtensionUIContext) {
	const setWidget = ui.setWidget as ReturnType<typeof vi.fn>;
	const factory = setWidget.mock.calls[0][1] as (
		tui: { requestRender: () => void },
		factoryTheme: typeof theme,
	) => { render: (width: number) => string[] };
	return factory({ requestRender: vi.fn() }, theme);
}

async function completedParent() {
	const { pi, captured } = createMockPi();
	registerTodo(pi);
	const parent = createMockCtx({ hasUI: true, sessionId: "parent" });
	const emit = async (name: string, ctx = parent) => {
		for (const handler of captured.events.get(name) ?? []) {
			await handler({} as never, ctx as never);
		}
	};
	await emit("session_start");
	const tool = captured.tools.get("todo")!;
	for (const params of [
		{ action: "create", subject: "finished parent task" },
		{ action: "update", id: 1, status: "completed" },
	]) {
		await tool.execute?.("tc", params as never, undefined as never, undefined as never, parent);
	}
	for (const handler of captured.events.get("tool_execution_end") ?? []) {
		await handler({ toolName: "todo", isError: false } as never, parent as never);
	}
	const widget = mount(parent.ui);
	expect(widget.render(100).join("\n")).toContain("finished parent task");
	return { emit, parent, widget };
}

describe("completed todo visibility", () => {
	it("keeps a recent completion when either a child or the foreground starts a run", async () => {
		const { emit, widget } = await completedParent();
		const child = createMockCtx({ hasUI: true, sessionId: "child" });
		await emit("agent_start", child);
		expect(widget.render(100).join("\n")).toContain("finished parent task");
		await emit("agent_start");
		expect(widget.render(100).join("\n")).toContain("finished parent task");
	});
});
