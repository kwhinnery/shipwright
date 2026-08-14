# Shipwright

Shipwright is a browser-based 3D spaceship editor. A person and an AI model can
edit the same ship with the same commands. The visual style uses simple lines,
polygonal shapes, and the colors of an early 1990s holographic display.

The project is a React single-page application. Vite builds the client and a
small Hono API for the Cloudflare Workers runtime. ChatGPT Sites supplies user
identity and a Cloudflare D1 database after deployment.

## Features

- Add boxes, wedges, cylinders, spheres, and cones.
- Select, move, rotate, and scale each part in three dimensions.
- Orbit, pan, and zoom the camera.
- Save private ship designs for the signed-in ChatGPT user.
- Load saved designs.
- Use WebMCP tools to do the same editor actions from a model.
- Use a local test user and a local persistent D1 database during development.

## Local development

Install Node.js 22.13 or a later version. Then run:

```bash
npm install
npm run dev
```

Open the local URL that Vite prints. The local server creates a test user named
`Local Captain`. It also creates a local D1 database in `.wrangler/state`. This
data does not affect a deployed database.

Use these controls in the editor:

- Drag with the left mouse button to orbit the camera.
- Drag with the right mouse button to pan the camera.
- Use the mouse wheel to zoom.
- Select a part to show its transform gizmo.
- Press `G`, `R`, or `S` to select move, rotate, or scale mode.
- Press `Delete` to remove the selected part.
- Press `Control+S` or `Command+S` to save.

Run the production checks with:

```bash
npm test
```

## WebMCP development

Shipwright registers ten tools through `document.modelContext`. The tools can
inspect the editor, add and update parts, control the camera, and manage saved
designs. Tool input uses JSON Schema and the callbacks also validate all input.

WebMCP is available as an origin trial in supported Chrome versions. For local
tests, enable `chrome://flags/#enable-webmcp-testing` and restart Chrome. Enable
`chrome://flags/#devtools-webmcp-support` to inspect the tools in Chrome
DevTools. A deployed origin must have a valid WebMCP origin trial token while
the feature remains in the trial.

WebMCP support is progressive. The editor continues to work when a browser does
not provide the API.

## Data and authentication

ChatGPT Sites sends these headers for a signed-in user:

- `oai-authenticated-user-id`
- `oai-authenticated-user-email`
- `oai-authenticated-user-full-name`, when available

The Hono API checks identity on the server. Every D1 query includes the stable
user ID. One user cannot read or change another user's designs.

The D1 schema is in `db/schema.ts`. Generated migrations are in `drizzle/`.
The API also creates the schema when an empty local database receives its first
request.

## Deploy to ChatGPT Sites

The `.openai/hosting.json` file declares the logical `DB` binding. ChatGPT Sites
creates and connects the real D1 database during deployment. The build packages
the server, static client, hosting metadata, and database migrations together.

Build the deployment files with:

```bash
npm run build
```

You can then publish the repository through ChatGPT Sites. Keep the site private
if ship designs must only be visible to signed-in members. Do not add separate
OAuth routes. The Sites dispatcher owns the ChatGPT sign-in and callback paths.

If you fork this repository, remove `project_id` from `.openai/hosting.json`
before you create your own Site. Sites will write the ID for your new project.

## License

MIT
