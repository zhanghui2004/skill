import { describe, expect, it } from "vitest";
import { readResponseJson } from "./api-client";

describe("readResponseJson", () => {
  it("rejects HTML bodies without throwing parse errors", async () => {
    const res = new Response("<!doctype html><html><body>Gateway Timeout</body></html>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });
    const parsed = await readResponseJson(res);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/非 JSON/);
      expect(parsed.error).toMatch(/504/);
      expect(parsed.error).not.toMatch(/Unexpected token/);
    }
  });

  it("parses JSON even when HTTP status is error", async () => {
    const res = new Response(JSON.stringify({ runId: "run_1", error: "timeout" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const parsed = await readResponseJson<{ runId: string; error: string }>(res);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.httpStatus).toBe(500);
      expect(parsed.data.error).toBe("timeout");
    }
  });
});
