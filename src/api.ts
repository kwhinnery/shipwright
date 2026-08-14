import type {
  DesignSummary,
  SavedDesign,
  SessionUser,
  ShipDesignData,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface DesignPayload {
  name: string;
  data: ShipDesignData;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(body?.error ?? "The request failed.", response.status);
  }

  return response.json() as Promise<T>;
}

export async function getSession(): Promise<SessionUser> {
  const response = await request<{ user: SessionUser }>("/api/session");
  return response.user;
}

export async function listDesigns(): Promise<DesignSummary[]> {
  const response = await request<{ designs: DesignSummary[] }>("/api/designs");
  return response.designs;
}

export function getDesign(id: string): Promise<SavedDesign> {
  return request<SavedDesign>(`/api/designs/${encodeURIComponent(id)}`);
}

export function createDesign(payload: DesignPayload): Promise<SavedDesign> {
  return request<SavedDesign>("/api/designs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDesign(
  id: string,
  payload: DesignPayload,
): Promise<SavedDesign> {
  return request<SavedDesign>(`/api/designs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
