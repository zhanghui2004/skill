/** Browser helper: never JSON.parse HTML error pages. */

export async function readResponseJson<T>(
  res: Response
): Promise<
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; error: string; httpStatus: number }
> {
  const ctype = res.headers.get("content-type") || "";
  const text = await res.text();
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 280);

  if (!ctype.includes("application/json")) {
    return {
      ok: false,
      httpStatus: res.status,
      error: `接口返回非 JSON（HTTP ${res.status}${ctype ? `, ${ctype}` : ""}）：${snippet || "(空响应)"}`,
    };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data, httpStatus: res.status };
  } catch {
    return {
      ok: false,
      httpStatus: res.status,
      error: `无法解析 JSON（HTTP ${res.status}）：${snippet || "(空响应)"}`,
    };
  }
}
