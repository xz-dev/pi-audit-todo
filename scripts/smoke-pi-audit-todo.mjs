import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliDecompressSync, gunzipSync, inflateSync, zstdDecompressSync } from "node:zlib";

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
const fixtures = pathToFileURL(`${process.env.TEST_REFLECT_DIR || local("../../pi-reflect-watchdog")}/scripts/e2e/`);
const { createIsolatedEnvironment, RpcPi, writeJson } = await import(new URL("harness.mjs", fixtures));
const { modelConfig, startFakeProvider, reflectionResponse, isPrivateReflectionRequest, requestText } = await import(
	new URL("fake-provider.mjs", fixtures)
);
const root = await mkdtemp("/var/tmp/pi-audit-native-");
const mainPath = process.env.TEST_PACKAGE
	? undefined
	: process.env.TEST_EXTENSION || local("../packages/rpiv-todo/index.ts");
const pi = process.env.TEST_PI || local("../node_modules/.bin/pi");
const watchPath = process.env.TEST_CONTINUE_ENTRY || local("../../pi-continue-watchdog/src/extension.ts");
const variant = process.env.AUDIT_CASE || "positive";

// Some Pi builds compress provider requests. Reflect's fixture consumes plain JSON.
async function decodeRequests(destination) {
	const codecs = { gzip: gunzipSync, br: brotliDecompressSync, deflate: inflateSync, zstd: zstdDecompressSync };
	const proxy = createServer(async (request, response) => {
		try {
			const chunks = [];
			for await (const chunk of request) chunks.push(chunk);
			const encoding = request.headers["content-encoding"];
			const buffer = Buffer.concat(chunks);
			const body = encoding && encoding !== "identity" ? codecs[encoding](buffer) : buffer;
			const target = new URL(request.url, destination);
			const outgoing = httpRequest(
				target,
				{ method: request.method, headers: { "content-type": "application/json", "content-length": body.length } },
				(upstream) => {
					response.writeHead(upstream.statusCode, upstream.headers);
					upstream.pipe(response);
				},
			);
			response.once("close", () => outgoing.destroy());
			outgoing.once("error", () => {
				if (!response.headersSent) response.writeHead(502);
				response.end();
			});
			outgoing.end(body);
		} catch {
			response.writeHead(400).end("Invalid compressed fixture request");
		}
	});
	await new Promise((done) => proxy.listen(0, "127.0.0.1", done));
	return {
		baseUrl: `http://127.0.0.1:${proxy.address().port}/v1`,
		close: () => {
			proxy.closeAllConnections();
			return new Promise((done) => proxy.close(done));
		},
	};
}
function tool(callId, value) {
	return {
		chunks: [
			{
				tool_calls: [
					{
						index: 0,
						id: `call-${callId}`,
						type: "function",
						function: { name: "todo", arguments: JSON.stringify(value) },
					},
				],
			},
		],
		finishReason: "tool_calls",
	};
}
for (const [index, entries] of [[mainPath], [mainPath, watchPath], [watchPath, mainPath]].entries()) {
	const base = join(root, String(index));
	await mkdir(base);
	const isolated = await createIsolatedEnvironment(base);
	let ordinary = 0;
	let privateAnswers = 0;
	const resultPaths = [];
	let rpc;
	try {
		const provider = await startFakeProvider({
			responsePlan: ({ request }) => {
				if (isPrivateReflectionRequest(request)) {
					++privateAnswers;
					if (variant === "retry") {
						const path = requestText(request).match(
							/<private_inquiry_result_file>(.*?)<\/private_inquiry_result_file>/,
						)?.[1];
						if (path) resultPaths.push(path);
						if (privateAnswers <= 3) return { chunks: [{ content: "Audit complete without using write." }] };
					}
					const source = requestText(request).match(
						/\["([a-z0-9]+)",\{"role":"user","text":"First the second item.*?"\}\]/,
					)?.[1];
					if (variant === "unauthorized" || variant === "completion") {
						const operation =
							variant === "completion" ? { kind: "update", patch: { status: "completed" } } : { kind: "delete" };
						return reflectionResponse(
							{
								items: [
									{ id: 1, kind: "keep", reason: "The prerequisite is running.", sources: [] },
									{
										id: 2,
										...operation,
										reason: "Unsupported terminal transition",
										sources: source ? [source] : [],
									},
								],
							},
							request,
						);
					}
					const reply = reflectionResponse(
						{
							items: [
								{
									id: 1,
									kind: "keep",
									reason: "The user explicitly has the prerequisite running.",
									sources: [],
								},
								{
									id: 2,
									kind: "update",
									reason: "The user says this item waits on #1.",
									sources: source ? [source] : [],
									patch: { status: "pending", addBlockedBy: [1] },
								},
							],
						},
						request,
					);
					if (variant.endsWith("cancel")) reply.delay = 1800;
					return reply;
				}
				switch (++ordinary) {
					case 1:
						return tool(1, { action: "create", tasks: [{ subject: "Prerequisite" }, { subject: "Work item" }] });
					case 2:
						return tool(2, { action: "update", id: 1, status: "in_progress" });
					case 3:
						return tool(3, { action: "update", id: 2, status: "in_progress" });
					case 5:
						return tool(5, { action: "list" });
					default:
						return { chunks: [{ content: "Scripted ordinary report." }] };
				}
			},
		});
		const decoder = await decodeRequests(provider.baseUrl);
		try {
			await writeJson(join(isolated.agentDir, "models.json"), modelConfig(decoder.baseUrl));
			if (process.env.TEST_PACKAGE)
				await writeJson(join(isolated.agentDir, "settings.json"), { packages: [process.env.TEST_PACKAGE] });
			const launch = (args = []) =>
				new RpcPi({
					cwd: isolated.workspace,
					env: isolated.env,
					executable: pi,
					launcherArgs: [
						"--mode",
						"rpc",
						"--provider",
						"watchdog-fixture",
						"--model",
						"watchdog-fixture",
						...entries.flatMap((path) => (path ? ["-e", path] : [])),
						...args,
					],
				});
			rpc = launch();
			const commands = await rpc.request({ type: "get_commands" }, 30_000);
			const names = commands.data.commands.map((c) => c.name);
			for (const name of ["todos", "todo-audit", "cancel-todo-audit"])
				assert.equal(names.filter((n) => n === name).length, 1, names.join(" "));
			assert(!names.includes("jev-audit"));
			assert(!names.includes("jev-audit-service"));
			assert.equal(names.includes("lock-continue-watchdog"), index !== 0, names.join(" "));
			assert.equal(
				(
					await rpc.request(
						{
							type: "prompt",
							message:
								"First the second item waits for #1. The prerequisite is running. Keep the plan accurate.",
						},
						30_000,
					)
				).success,
				true,
			);
			await rpc.waitFor((m) => m.type === "agent_end", 15_000);
			if (variant.endsWith("cancel")) {
				const deadline = Date.now() + 5000;
				while (!provider.requests.some(isPrivateReflectionRequest) && Date.now() < deadline)
					await new Promise((r) => setTimeout(r, 15));
				assert(provider.requests.some(isPrivateReflectionRequest));
				if (variant === "continue-cancel" && index !== 0) {
					assert.equal(
						(await rpc.request({ type: "prompt", message: "/unlock-continue-watchdog independent-fixture" }))
							.success,
						true,
					);
				}
				if (variant === "audit-cancel") {
					assert.equal((await rpc.request({ type: "prompt", message: "/cancel-todo-audit" })).success, true);
					await rpc.waitFor(
						(m) => m.type === "extension_ui_request" && /Cancelled this session/.test(m.message || ""),
					);
				}
			}
			let branch;
			const negative = ["unauthorized", "completion", "audit-cancel"].includes(variant);
			const deadline = performance.now() + (negative ? 4500 : 6000);
			do {
				const sessionDir = isolated.env.PI_CODING_AGENT_SESSION_DIR;
				const files = (await readdir(sessionDir)).filter((v) => v.endsWith(".jsonl"));
				if (files.length) {
					branch = {
						path: join(sessionDir, files[0]),
						data: (await readFile(join(sessionDir, files[0]), "utf8")).trim().split("\n").map(JSON.parse),
					};
					if (branch.data.some((e) => e.customType === "pi-audit-todo" && e.content?.includes("dependencies: #1")))
						break;
				}
				await new Promise((r) => setTimeout(r, 40));
			} while (performance.now() < deadline);
			const receipt = branch?.data.find(
				(e) => e.customType === "pi-audit-todo" && e.content?.includes("dependencies: #1"),
			);
			if (negative) {
				assert(!receipt);
				assert(
					!branch.data.some((e) => e.customType === "pi-audit-todo:review" || e.customType === "pi-audit-todo"),
				);
				assert.equal(
					branch.data.filter((e) => e.customType === "rpiv-todo-state").at(-1).data.tasks[1].status,
					"in_progress",
				);
				assert.equal(ordinary, 4);
				if (variant === "audit-cancel") {
					assert(provider.requests.filter(isPrivateReflectionRequest).some((r) => r.abortedAt));
					assert(
						!branch.data.some(
							(e) =>
								e.customType?.startsWith("pi-continue-watchdog:") &&
								/unlocked|continued/i.test(JSON.stringify(e.data)),
						),
					);
				}
				console.log(
					JSON.stringify({
						loadOrder: index,
						variant,
						board: "unchanged",
						ordinary,
						private: provider.requests.filter(isPrivateReflectionRequest).length,
					}),
				);
				continue;
			}
			assert(
				receipt,
				JSON.stringify({
					rpc: rpc.stderr,
					events: rpc.events.slice(-8),
					requests: provider.requests.map((r) => ({
						private: isPrivateReflectionRequest(r),
						keys: Object.keys(r.body),
					})),
				}).slice(-12000),
			);
			assert.equal(ordinary, 4);
			assert.equal(provider.requests.filter(isPrivateReflectionRequest).length, variant === "retry" ? 4 : 1);
			if (variant === "retry") {
				assert.equal(resultPaths.length, 4);
				assert.deepEqual(resultPaths.slice(1, 3), [resultPaths[0], resultPaths[0]]);
				assert.notEqual(resultPaths[3], resultPaths[0], "whole retry writes to a fresh file");
				assert.equal(branch.data.filter((e) => e.customType === "pi-audit-todo").length, 1);
			}
			assert(!branch.data.some((e) => e.customType?.includes("watchdog") && /continued|outcome/.test(e.customType)));
			const lastBoard = branch.data.filter((e) => e.customType === "rpiv-todo-state").at(-1).data.tasks;
			assert.equal(lastBoard.find((t) => t.id === 2).status, "pending");
			assert.deepEqual(lastBoard.find((t) => t.id === 2).blockedBy, [1]);
			await rpc.close();
			rpc = launch(["--session", branch.path]);
			assert.equal((await rpc.request({ type: "prompt", message: "/todos" }, 30_000)).success, true);
			await rpc.waitFor((m) => m.type === "extension_ui_request" && /#2 Work item.*#1/.test(m.message || ""));
			assert.equal(
				(await rpc.request({ type: "prompt", message: "Read the persisted board." }, 30_000)).success,
				true,
			);
			await rpc.waitFor((m) => m.type === "agent_end");
			assert(
				provider.requests
					.filter((r) => !isPrivateReflectionRequest(r))
					.slice(-1)
					.some((r) => requestText(r).includes("dependencies: #1")),
			);
			console.log(
				JSON.stringify({
					loadOrder: index,
					compared: `${privateAnswers} actual private request(s); no audit wake; board and original model context persist`,
					receipt: receipt.content,
				}),
			);
		} finally {
			await rpc?.close();
			await decoder.close();
			await provider.close();
		}
	} catch (error) {
		console.error(`load order ${index}:`, error);
		process.exitCode = 1;
		break;
	}
}
await rm(root, { recursive: true, force: true });
