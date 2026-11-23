import Link from "next/link";

const links = [
  { href: "/", label: "首页" },
  { href: "/skills", label: "Skill 目录" },
  { href: "/lab", label: "运行实验室" },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-zinc-900"
        >
          Skill Lab · 教师版
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
