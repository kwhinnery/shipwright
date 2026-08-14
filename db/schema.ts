import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shipDesigns = sqliteTable(
  "ship_designs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    designJson: text("design_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_ship_designs_owner_updated").on(table.ownerId, table.updatedAt)],
);
