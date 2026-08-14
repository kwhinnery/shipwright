import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { SavedDesign, ShipDesignData } from "../src/types";
import { getAuthenticatedUser, type AuthUser } from "./auth";
import {
  deserializeDesign,
  ensureSchema,
  serializeDesign,
  type DesignRow,
} from "./database";
import { parseDesignInput } from "./validation";

interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
}

type Variables = {
  user: AuthUser;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("/api/*", secureHeaders());
app.use("/api/*", csrf());
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (context) => context.json({ error: "Request is too large." }, 413),
  }),
);
app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  const user = getAuthenticatedUser(context.req.raw);
  if (!user) {
    return context.json(
      {
        error: "Authentication is required.",
        signInPath: "/signin-with-chatgpt?return_to=%2F",
      },
      401,
    );
  }
  context.set("user", user);
  await next();
});

app.get("/api/session", (context) => {
  return context.json({ user: context.get("user") });
});

app.get("/api/designs", async (context) => {
  await ensureSchema(context.env.DB);
  const ownerId = context.get("user").userId;
  const result = await context.env.DB.prepare(
    `SELECT id, name, design_json, created_at, updated_at
     FROM ship_designs
     WHERE owner_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(ownerId)
    .all<DesignRow>();

  return context.json({
    designs: result.results.map((row) => toSummary(row)),
  });
});

app.post("/api/designs", async (context) => {
  const input = parseDesignInput(await context.req.json().catch(() => null));
  if (!input) return context.json({ error: "Invalid ship design." }, 400);

  await ensureSchema(context.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ownerId = context.get("user").userId;

  await context.env.DB.prepare(
    `INSERT INTO ship_designs
      (id, owner_id, name, design_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ownerId, input.name, serializeDesign(input.data), now, now)
    .run();

  return context.json(
    toSavedDesign({
      id,
      name: input.name,
      design_json: serializeDesign(input.data),
      created_at: now,
      updated_at: now,
    }),
    201,
  );
});

app.get("/api/designs/:id", async (context) => {
  await ensureSchema(context.env.DB);
  const result = await context.env.DB.prepare(
    `SELECT id, name, design_json, created_at, updated_at
     FROM ship_designs
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(context.req.param("id"), context.get("user").userId)
    .first<DesignRow>();

  if (!result) return context.json({ error: "Ship design was not found." }, 404);
  return context.json(toSavedDesign(result));
});

app.put("/api/designs/:id", async (context) => {
  const input = parseDesignInput(await context.req.json().catch(() => null));
  if (!input) return context.json({ error: "Invalid ship design." }, 400);

  await ensureSchema(context.env.DB);
  const now = new Date().toISOString();
  const result = await context.env.DB.prepare(
    `UPDATE ship_designs
     SET name = ?, design_json = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(
      input.name,
      serializeDesign(input.data),
      now,
      context.req.param("id"),
      context.get("user").userId,
    )
    .run();

  if (!result.meta.changes) {
    return context.json({ error: "Ship design was not found." }, 404);
  }

  const saved = await context.env.DB.prepare(
    `SELECT id, name, design_json, created_at, updated_at
     FROM ship_designs
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(context.req.param("id"), context.get("user").userId)
    .first<DesignRow>();

  if (!saved) return context.json({ error: "Ship design was not found." }, 404);
  return context.json(toSavedDesign(saved));
});

app.notFound(async (context) => {
  const requestUrl = new URL(context.req.url);
  if (requestUrl.pathname !== "/api" && !requestUrl.pathname.startsWith("/api/")) {
    const asset = await context.env.ASSETS.fetch(context.req.raw);
    if (asset.headers.get("Content-Type")?.includes("text/html")) {
      const headers = new Headers(asset.headers);
      headers.delete("Content-Length");
      const html = (await asset.text()).replaceAll(
        "__SHIPWRIGHT_ORIGIN__",
        requestUrl.origin,
      );
      return new Response(html, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      });
    }
    return asset;
  }
  return context.json({ error: "API route was not found." }, 404);
});

app.onError((error, context) => {
  console.error("Shipwright API error", error);
  return context.json({ error: "Shipwright could not complete the request." }, 500);
});

function toSummary(row: DesignRow) {
  const data = deserializeDesign(row.design_json);
  return {
    id: row.id,
    name: row.name,
    partCount: data.parts.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSavedDesign(row: DesignRow): SavedDesign {
  const data: ShipDesignData = deserializeDesign(row.design_json);
  return { ...toSummary(row), data };
}

export default app;
