import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const [sourceArg, outputArg, ...rest] = process.argv.slice(2);
if (!sourceArg || !outputArg || rest.length)
	throw new Error("Usage: project-pi-audit-todo.mjs SOURCE_ROOT EMPTY_OUTPUT_ROOT");
const source = realpathSync(sourceArg);
const intended = resolve(outputArg);
const output = existsSync(intended)
	? realpathSync(intended)
	: join(realpathSync(dirname(intended)), basename(intended));
const inside = (parent, target) => {
	const rel = relative(parent, target);
	return !rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
};
if (inside(source, output) || inside(output, source))
	throw new Error("Source and output must be separate, non-nested directories");
if (existsSync(output) && readdirSync(output).length) throw new Error("Output is not empty");
const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=no"))
	throw new Error("Commit tracked source changes before projecting");
const packagePath = "packages/rpiv-todo";
const packageSource = join(source, packagePath);
const all = git("ls-files", "-z", "--", packagePath)
	.split("\0")
	.filter(Boolean)
	.map((p) => p.slice(packagePath.length + 1));
const manifest = JSON.parse(readFileSync(join(packageSource, "package.json"), "utf8"));
const ship = (p) =>
	manifest.files.some((entry) => entry === p || (entry.endsWith("/") && p.startsWith(entry))) &&
	!/^docs\/.*\.(png|jpg|svg)$/.test(p);
for (const file of all.filter(ship)) {
	const target = join(output, file);
	mkdirSync(dirname(target), { recursive: true });
	cpSync(join(packageSource, file), target);
}
cpSync(fileURLToPath(new URL("../MAINTAIN.md", import.meta.url)), join(output, "MAINTAIN.md"));
const release = {
	...manifest,
	name: "pi-audit-todo",
	version: "0.1.0",
	description: "A persistent TODO board for Pi with private background reviews and verified writeback.",
	author: "Xiangzhe",
	keywords: ["pi-package", "pi-extension", "todo", "audit", "coding-agent"],
	repository: { type: "git", url: "git+https://github.com/xz-dev/pi-audit-todo.git" },
	homepage: "https://github.com/xz-dev/pi-audit-todo#readme",
	bugs: { url: "https://github.com/xz-dev/pi-audit-todo/issues" },
	engines: { node: ">=22.19.0" },
	files: [...manifest.files, "MAINTAIN.md", ".downstream-source"],
};
delete release.scripts;
writeFileSync(join(output, "package.json"), `${JSON.stringify(release, null, "\t")}\n`);
const normalized = (ref) => git("rev-parse", "--verify", ref);
writeFileSync(
	join(output, ".downstream-source"),
	[
		"upstream_repository=https://github.com/juicesharp/rpiv-mono",
		`upstream_commit=${git("merge-base", "HEAD", "upstream/main")}`,
		...["rpiv-todo-focus-window", "rpiv-todo-completed-fade", "rpiv-todo-active-strip", "pi-audit-todo"].map(
			(p) => `patch_${p.replaceAll("-", "_")}=${normalized(`patch/${p}`)}`,
		),
		`source_commit=${normalized("HEAD")}`,
		`projection_commit=${execFileSync("git", ["-C", dirname(fileURLToPath(import.meta.url)), "rev-parse", "HEAD"], { encoding: "utf8" }).trim()}`,
		`source_path=${packagePath}`,
		"",
	].join("\n"),
);
