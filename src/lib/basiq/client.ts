import {
  basiqConnectionApiSchema,
  basiqInstitutionSchema,
  basiqJobSchema,
  basiqTransactionPayloadSchema,
  type BasiqConnectionApi,
  type BasiqInstitution,
  type BasiqJob,
  type BasiqTransactionPayload,
} from "@/lib/validations/basiq";

// ============================================================================
// BasiqApiClient — seam around every outbound Basiq HTTP call
// ----------------------------------------------------------------------------
// The interface captures the 8 operations the app actually performs. The
// real implementation (RealBasiqApiClient) handles OAuth Basic-auth token
// exchange, 60-minute token caching, 15s request timeout, single-retry
// on 5xx, and the `basiq-version: 3.0` header required by v3.0.
//
// Verification scripts call __setBasiqApiClientForVerification to inject a
// stub client that returns canned responses — no live HTTP during the 15
// automated scenarios. The --live scenario resets to the real client.
//
// PRE_LAUNCH_CLEANUP: grep __setBasiqApiClientForVerification must only
// hit client.ts and *.verification.ts files.
// ============================================================================

export interface BasiqApiClient {
  createUser(args: { email: string; mobile?: string }): Promise<{ id: string }>;
  generateClientToken(args: {
    basiqUserId: string;
  }): Promise<{ access_token: string; expires_in: number }>;
  listInstitutions(): Promise<BasiqInstitution[]>;
  getConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<BasiqConnectionApi>;
  getUserConnections(args: {
    basiqUserId: string;
  }): Promise<BasiqConnectionApi[]>;
  deleteConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<{ ok: true }>;
  getTransactions(args: {
    basiqUserId: string;
    sinceIso?: string;
    limit?: number;
  }): Promise<BasiqTransactionPayload[]>;
  getJob(args: { jobId: string }): Promise<BasiqJob>;
}

// ─── Structured error ──────────────────────────────────────────

export type BasiqApiErrorCategory =
  | "auth_failed"
  | "consent_required"
  | "not_found"
  | "timeout"
  | "rate_limited"
  | "other";

export class BasiqApiError extends Error {
  category: BasiqApiErrorCategory;
  status: number | null;
  basiqCode: string | null;

  constructor(opts: {
    message: string;
    category: BasiqApiErrorCategory;
    status?: number | null;
    basiqCode?: string | null;
  }) {
    super(opts.message);
    this.name = "BasiqApiError";
    this.category = opts.category;
    this.status = opts.status ?? null;
    this.basiqCode = opts.basiqCode ?? null;
  }
}

// ─── Injection seam ────────────────────────────────────────────

let _verificationClient: BasiqApiClient | null = null;

/** Injection seam for verification scripts only. Never call from application code. */
export function __setBasiqApiClientForVerification(
  client: BasiqApiClient | null,
): void {
  _verificationClient = client;
}

/** Read-only probe so a verification script can assert the stub is active. */
export function __getBasiqApiClientForVerification(): BasiqApiClient | null {
  return _verificationClient;
}

let _realClient: RealBasiqApiClient | null = null;

export function getBasiqApiClient(): BasiqApiClient {
  if (_verificationClient) return _verificationClient;
  if (!_realClient) _realClient = new RealBasiqApiClient();
  return _realClient;
}

// ─── Real HTTP client ──────────────────────────────────────────

const BASIQ_VERSION = "3.0";
const TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

class RealBasiqApiClient implements BasiqApiClient {
  private baseUrl: string;
  private apiKey: string;
  private serverToken: { value: string; expiresAt: number } | null = null;

  constructor() {
    const baseUrl =
      process.env.BASIQ_API_BASE_URL ?? "https://au-api.basiq.io";
    const apiKey = process.env.BASIQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RealBasiqApiClient: BASIQ_API_KEY is required in process.env",
      );
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async createUser(args: {
    email: string;
    mobile?: string;
  }): Promise<{ id: string }> {
    const body: Record<string, string> = { email: args.email };
    if (args.mobile) body.mobile = args.mobile;
    const res = await this.call<{ id: string }>("POST", "/users", {
      body: JSON.stringify(body),
      server: true,
    });
    return res;
  }

  async generateClientToken(args: {
    basiqUserId: string;
  }): Promise<{ access_token: string; expires_in: number }> {
    // CLIENT_ACCESS scope bound to a specific userId — the token powers the
    // Consent UI redirect and must not be reused across users.
    const params = new URLSearchParams({
      scope: "CLIENT_ACCESS",
      userId: args.basiqUserId,
    });
    return await this.callTokenEndpoint(params);
  }

  async listInstitutions(): Promise<BasiqInstitution[]> {
    const res = await this.call<{ data: unknown[] }>(
      "GET",
      "/institutions",
      { server: true },
    );
    return (res.data ?? [])
      .map((raw) => basiqInstitutionSchema.safeParse(raw))
      .filter((r): r is { success: true; data: BasiqInstitution } => r.success)
      .map((r) => r.data);
  }

  async getConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<BasiqConnectionApi> {
    const res = await this.call<unknown>(
      "GET",
      `/users/${encodeURIComponent(args.basiqUserId)}/connections/${encodeURIComponent(args.connectionId)}`,
      { server: true },
    );
    return basiqConnectionApiSchema.parse(res);
  }

  async getUserConnections(args: {
    basiqUserId: string;
  }): Promise<BasiqConnectionApi[]> {
    const res = await this.call<{ data: unknown[] }>(
      "GET",
      `/users/${encodeURIComponent(args.basiqUserId)}/connections`,
      { server: true },
    );
    return (res.data ?? [])
      .map((raw) => basiqConnectionApiSchema.safeParse(raw))
      .filter((r): r is { success: true; data: BasiqConnectionApi } =>
        r.success,
      )
      .map((r) => r.data);
  }

  async deleteConnection(args: {
    basiqUserId: string;
    connectionId: string;
  }): Promise<{ ok: true }> {
    await this.call<unknown>(
      "DELETE",
      `/users/${encodeURIComponent(args.basiqUserId)}/connections/${encodeURIComponent(args.connectionId)}`,
      { server: true },
    );
    return { ok: true };
  }

  async getTransactions(args: {
    basiqUserId: string;
    sinceIso?: string;
    limit?: number;
  }): Promise<BasiqTransactionPayload[]> {
    const qs = new URLSearchParams();
    if (args.sinceIso) {
      // Basiq v3 filter syntax: filter=transaction.postDate.gt('YYYY-MM-DD')
      const date = args.sinceIso.slice(0, 10);
      qs.set("filter", `transaction.postDate.gt('${date}')`);
    }
    if (args.limit) qs.set("limit", String(args.limit));
    const path = `/users/${encodeURIComponent(args.basiqUserId)}/transactions${
      qs.toString() ? `?${qs.toString()}` : ""
    }`;
    const res = await this.call<{ data: unknown[] }>("GET", path, {
      server: true,
    });
    return (res.data ?? [])
      .map((raw) => basiqTransactionPayloadSchema.safeParse(raw))
      .filter((r): r is { success: true; data: BasiqTransactionPayload } =>
        r.success,
      )
      .map((r) => r.data);
  }

  async getJob(args: { jobId: string }): Promise<BasiqJob> {
    const res = await this.call<unknown>(
      "GET",
      `/jobs/${encodeURIComponent(args.jobId)}`,
      { server: true },
    );
    return basiqJobSchema.parse(res);
  }

  // ─── Internals ───────────────────────────────────────────────

  private async getServerToken(): Promise<string> {
    if (
      this.serverToken &&
      this.serverToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS
    ) {
      return this.serverToken.value;
    }
    const params = new URLSearchParams({ scope: "SERVER_ACCESS" });
    const tok = await this.callTokenEndpoint(params);
    this.serverToken = {
      value: tok.access_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    };
    return tok.access_token;
  }

  private async callTokenEndpoint(
    params: URLSearchParams,
  ): Promise<{ access_token: string; expires_in: number }> {
    const url = `${this.baseUrl}/token`;
    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(this.apiKey).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "basiq-version": BASIQ_VERSION,
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new BasiqApiError({
        message: `Basiq /token returned ${res.status}`,
        category: res.status === 401 ? "auth_failed" : "other",
        status: res.status,
      });
    }
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token || !json.expires_in) {
      throw new BasiqApiError({
        message: "Basiq /token response missing access_token or expires_in",
        category: "other",
      });
    }
    return {
      access_token: json.access_token,
      expires_in: json.expires_in,
    };
  }

  private async call<T>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    opts: { body?: string; server: boolean },
  ): Promise<T> {
    const token = opts.server ? await this.getServerToken() : "";
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

    const attempt = async (): Promise<T> => {
      const res = await this.fetchWithTimeout(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "basiq-version": BASIQ_VERSION,
        },
        body: opts.body,
      });
      if (res.status === 204) return undefined as unknown as T;
      const text = await res.text();
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
      }
      if (!res.ok) {
        const category = classify(res.status, parsed);
        const basiqCode =
          typeof parsed === "object" && parsed !== null && "code" in parsed
            ? String((parsed as { code?: unknown }).code ?? "")
            : null;
        throw new BasiqApiError({
          message: `Basiq ${method} ${path} → ${res.status}`,
          category,
          status: res.status,
          basiqCode,
        });
      }
      return (parsed ?? undefined) as T;
    };

    try {
      return await attempt();
    } catch (e) {
      if (
        e instanceof BasiqApiError &&
        (e.category === "other" || e.category === "timeout") &&
        (e.status === null || e.status >= 500)
      ) {
        await new Promise((r) => setTimeout(r, 750));
        return await attempt();
      }
      throw e;
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw new BasiqApiError({
          message: `Basiq request timed out after ${TIMEOUT_MS}ms: ${url}`,
          category: "timeout",
        });
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

function classify(
  status: number,
  payload: unknown,
): BasiqApiErrorCategory {
  if (status === 401) return "auth_failed";
  if (status === 403) {
    const code =
      typeof payload === "object" && payload !== null && "code" in payload
        ? String((payload as { code?: unknown }).code ?? "")
        : "";
    if (code.toLowerCase().includes("consent")) return "consent_required";
    return "auth_failed";
  }
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "other";
}
