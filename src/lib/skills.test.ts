import { describe, expect, it } from "vitest";
import {
  listSkillMetadata,
  loadSkillDetail,
  scanScopeSummary,
  toMatchPayload,
} from "./skills";

describe("listSkillMetadata", () => {
  it("scans multi-scope sample skills including english-blog-translate", async () => {
    const skills = await listSkillMetadata();
    const names = skills.map((s) => s.name).sort();
    expect(names).toContain("english-blog-translate");
    expect(names).toContain("translate");
    expect(names).toContain("summarize");
    expect(names).toContain("meeting-notes");

    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(0);
      expect(["project", "agents", "user"]).toContain(s.scope);
      expect(typeof s.lines).toBe("number");
      expect(s).not.toHaveProperty("body");
    }
  });

  it("scope summary does not abort on missing dirs", async () => {
    const summary = await scanScopeSummary();
    expect(summary.length).toBe(3);
    const project = summary.find((s) => s.scope === "project");
    expect(project?.count).toBeGreaterThanOrEqual(4);
    for (const s of summary) {
      expect(typeof s.count).toBe("number");
    }
  });

  it("toMatchPayload keeps routing fields", async () => {
    const skills = await listSkillMetadata();
    const payload = toMatchPayload(skills);
    expect(payload[0]).toHaveProperty("disableModelInvocation");
    expect(payload[0]).toHaveProperty("scope");
  });
});

describe("loadSkillDetail", () => {
  it("loads english-blog-translate with file tree", async () => {
    const detail = await loadSkillDetail("english-blog-translate");
    expect(detail).not.toBeNull();
    expect(detail!.files.some((f) => f.name === "SKILL.md")).toBe(true);
    expect(detail!.raw).toContain("fetch_blog.py");
  });
});
