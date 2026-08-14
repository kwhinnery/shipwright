import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("the Sites build contains the client, server, and D1 metadata", async () => {
  const migrationFile = (await readdir("dist/.openai/drizzle")).find((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrationFile);

  const [clientHtml, serverBundle, hostingConfig, migration] = await Promise.all([
    readFile("dist/client/index.html", "utf8"),
    readFile("dist/server/index.js", "utf8"),
    readFile("dist/.openai/hosting.json", "utf8"),
    readFile(`dist/.openai/drizzle/${migrationFile}`, "utf8"),
  ]);

  assert.match(clientHtml, /<title>Shipwright<\/title>/);
  assert.ok(serverBundle.length > 1_000);
  const hosting = JSON.parse(hostingConfig);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, null);
  assert.match(hosting.project_id, /^appgprj_/);
  assert.match(migration, /CREATE TABLE `ship_designs`/);
  assert.match(migration, /idx_ship_designs_owner_updated/);
});
