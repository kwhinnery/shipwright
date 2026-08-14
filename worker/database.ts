import type { ShipDesignData } from "../src/types";

export interface DesignRow {
  id: string;
  name: string;
  design_json: string;
  created_at: string;
  updated_at: string;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(database: D1Database): Promise<void> {
  schemaReady ??= initializeSchema(database).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function initializeSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS ship_designs (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        design_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    database.prepare(`
      CREATE INDEX IF NOT EXISTS idx_ship_designs_owner_updated
      ON ship_designs (owner_id, updated_at)
    `),
  ]);
  await database.prepare("PRAGMA optimize").run();
}

export function serializeDesign(data: ShipDesignData): string {
  return JSON.stringify(data);
}

export function deserializeDesign(value: string): ShipDesignData {
  return JSON.parse(value) as ShipDesignData;
}
