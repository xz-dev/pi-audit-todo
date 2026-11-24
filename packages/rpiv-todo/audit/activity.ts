import { ENV_NAMES, openProcessDomain, type ProcessDomainNode } from "pi-extension-utils/process-domain";

export const ACTIVITY_ENV = "PI_AUDIT_TODO_ACTIVITY_DOMAIN";
const CHANNEL = "pi-audit-todo.activity.v1";

/** Use a different declaration and node from Continue/Reflect, even in the same process. */
export function createActivityDomain(env: NodeJS.ProcessEnv = process.env) {
	const wireEnv: NodeJS.ProcessEnv = new Proxy(
		{},
		{
			get: (_, key) => (key === ENV_NAMES.DECLARATION ? env[ACTIVITY_ENV] : undefined),
			set: (_, key, value) => {
				if (key === ENV_NAMES.DECLARATION) env[ACTIVITY_ENV] = value;
				return true;
			},
			deleteProperty: (_, key) => {
				if (key === ENV_NAMES.DECLARATION) delete env[ACTIVITY_ENV];
				return true;
			},
		},
	);
	const local = new Set<object>();
	const remote = new Set<string>();
	const listeners = new Set<(busy: boolean) => void>();
	let node: ProcessDomainNode | undefined;
	let opening: Promise<void> | undefined;
	let tail = Promise.resolve();
	let stop = () => {};
	const busy = () => local.size + remote.size > 0;
	const notify = () => {
		for (const listen of listeners) listen(busy());
	};
	function report(active = local.size > 0) {
		if (node?.role !== "client") return;
		const client = node;
		tail = tail.then(() => client.send(client.declaration.hostNodeId, CHANNEL, active)).catch(() => {});
	}
	return {
		open(): Promise<void> {
			opening ??= openProcessDomain({ env: wireEnv, metadata: { role: "pi-audit-todo" } }).then(
				(opened) => {
					node = opened;
					const offMessage = opened.subscribe(CHANNEL, (message) => {
						if (opened.role !== "host" || typeof message.value !== "boolean") return;
						if (!opened.peers().some((peer) => peer.nodeId === message.senderId && peer.status === "online"))
							return;
						if (message.value) remote.add(message.senderId);
						else remote.delete(message.senderId);
						notify();
					});
					const offPeer = opened.subscribeEvents((event) => {
						if (event.type !== "peer") return;
						if (opened.role === "host" && event.peer.status === "offline" && remote.delete(event.peer.nodeId))
							notify();
						if (
							opened.role === "client" &&
							event.peer.nodeId === opened.declaration.hostNodeId &&
							event.peer.status === "online"
						)
							report();
					});
					stop = () => {
						offMessage();
						offPeer();
					};
					report();
				},
				(error: unknown) => {
					opening = undefined;
					throw error;
				},
			);
			return opening;
		},
		get isClient() {
			return node?.role === "client" || (!node && !!env[ACTIVITY_ENV]);
		},
		get busy() {
			return busy();
		},
		observe(token: object, working: boolean) {
			if (working === local.has(token)) return;
			if (working) local.add(token);
			else local.delete(token);
			notify();
			report();
		},
		subscribe(listener: (working: boolean) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		async close() {
			await opening?.catch(() => {});
			stop();
			await node?.close();
			node = undefined;
			opening = undefined;
			remote.clear();
		},
	};
}

/** A monotonic clock for the union of observed work intervals, not wall time. */
export class WorkClock {
	private activeSince: number | undefined;
	constructor(
		private elapsed: number,
		private readonly now = () => performance.now(),
	) {}
	at(): number {
		return Math.floor(
			this.elapsed + (this.activeSince === undefined ? 0 : Math.max(0, this.now() - this.activeSince)),
		);
	}
	setBusy(busy: boolean) {
		if (busy && this.activeSince === undefined) this.activeSince = this.now();
		else if (!busy && this.activeSince !== undefined) {
			this.elapsed += Math.max(0, this.now() - this.activeSince);
			this.activeSince = undefined;
		}
	}
	get busy() {
		return this.activeSince !== undefined;
	}
}
