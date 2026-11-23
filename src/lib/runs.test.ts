import { describe, expect, it } from "vitest";
import { createRunId, resolveRunRecordPath } from "./runs";

describe("resolveRunRecordPath", () => {
  it("accepts createRunId shape", () => {
    const id = createRunId();
    const file = resolveRunRecordPath(id);
    expect(file.endsWith(`${id}.json`)).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(() => resolveRunRecordPath("../etc/passwd")).toThrow();
    expect(() => resolveRunRecordPath("..\\secrets")).toThrow();
    expect(() => resolveRunRecordPath("run_1_abc/../x")).toThrow();
    expect(() => resolveRunRecordPath("run_1_abc.json")).toThrow();
  });
});
