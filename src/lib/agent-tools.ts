import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getProjectRoot, safeJoinWorkspace } from "./paths";

const execFileAsync = promisify(execFile);

const ALLOWED_BINARIES = new Set(["python3", "python", "node"]);

export const OPENAI_AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file relative to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path under workspace" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write a UTF-8 text file relative to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_terminal",
      description:
        "Run python3/python/node with argv (no shell). Script paths must stay under the workspace. Prefer python scripts under .cursor/skills.",
      parameters: {
        type: "object",
        properties: {
          argv: {
            type: "array",
            items: { type: "string" },
            description: "e.g. [\"python3\", \".cursor/skills/.../scripts/fetch_blog.py\", \"https://...\"]",
          },
          command: {
            type: "string",
            description:
              "Legacy simple argv string (no shell metacharacters); split on whitespace. Prefer argv.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "glob_file_search",
      description: "List files matching a glob under the workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
];

function redact(s: string): string {
  return s
    .replace(/sk-[a-zA-Z0-9]{10,}/g, "[redacted]")
    .replace(/crsr_[a-zA-Z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
}

/** Split a simple argv string; reject shell metacharacters. */
function parseArgvFromCommand(command: string): string[] | null {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (/[|;&`$<>(){}]|\\|\n|\r/.test(trimmed)) return null;
  // Allow simple quoted tokens
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed))) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens.length ? tokens : null;
}

function resolveArgv(args: Record<string, unknown>): string[] | { error: string } {
  if (Array.isArray(args.argv)) {
    const argv = args.argv.map((x) => String(x));
    if (!argv.length) return { error: "空 argv" };
    return argv;
  }
  const command = String(args.command || "").trim();
  if (!command) return { error: "空命令：请传 argv 或简单 command" };
  const parsed = parseArgvFromCommand(command);
  if (!parsed) {
    return {
      error:
        "拒绝：run_terminal 不走 shell。请传 argv（python3/python/node），或无元字符的简单 command。",
    };
  }
  return parsed;
}

function assertWorkspacePathArgs(argv: string[]): void {
  // First arg is binary; remaining file-like args that look like paths must be under workspace
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a || a.startsWith("-")) continue;
    if (/^https?:\/\//i.test(a)) continue;
    if (!/[./]/.test(a) && !a.endsWith(".py") && !a.endsWith(".js") && !a.endsWith(".mjs")) {
      // likely a non-path flag value or URL-less token
      continue;
    }
    // Resolve relative to workspace; throws if outside
    safeJoinWorkspace(a);
  }
}

export async function executeLabTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const root = getProjectRoot();
  try {
    switch (name) {
      case "read_file": {
        const p = String(args.path || "");
        const abs = safeJoinWorkspace(p);
        const content = await fs.readFile(abs, "utf8");
        return content.length > 80000
          ? content.slice(0, 80000) + "\n…[truncated]"
          : content;
      }
      case "write_file": {
        const p = String(args.path || "");
        const content = String(args.content ?? "");
        const abs = safeJoinWorkspace(p);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, "utf8");
        return `已写入 ${p}（${content.length} 字符）`;
      }
      case "run_terminal": {
        const resolved = resolveArgv(args);
        if ("error" in resolved) return resolved.error;
        const argv = resolved;
        const bin = path.basename(argv[0] || "");
        if (!ALLOWED_BINARIES.has(bin)) {
          return `拒绝：仅允许 ${[...ALLOWED_BINARIES].join("/")}，收到「${bin || "(空)"}」`;
        }
        try {
          assertWorkspacePathArgs(argv);
        } catch (e) {
          return `拒绝路径：${e instanceof Error ? e.message : String(e)}`;
        }
        const { stdout, stderr } = await execFileAsync(bin, argv.slice(1), {
          cwd: root,
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env },
        });
        return redact(
          [`$ ${argv.join(" ")}`, stdout || "", stderr ? `STDERR:\n${stderr}` : ""]
            .filter(Boolean)
            .join("\n")
            .slice(0, 60000)
        );
      }
      case "glob_file_search": {
        const pattern = String(args.pattern || "**/*");
        void pattern;
        const hits = await walkMatch(root, 200);
        return (hits.length ? hits.join("\n") : "(无匹配)").slice(0, 20000);
      }
      default:
        return `未知工具：${name}`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `工具错误：${redact(msg)}`;
  }
}

async function walkMatch(root: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    if (out.length >= limit) return;
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= limit) break;
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) await walk(abs);
      else out.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return out;
}
