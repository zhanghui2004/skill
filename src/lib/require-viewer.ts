import { requireIdentity } from "../../cursor/identity";

/**
 * Gate paid / mutating API routes for private/team published apps.
 * Locally uses the simulated viewer from cursor/identity.dev.ts.
 */
export async function requireViewer(
  request: Request
): Promise<Response | { sub: string }> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return { sub: identity.sub };
}
