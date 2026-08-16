import { useEffect, useState, type RefObject } from "react";
import {
  parseShipwrightDesignFile,
  SHIPWRIGHT_DESIGN_FILE_VERSION,
  SHIPWRIGHT_DESIGN_FORMAT,
} from "./designFormat";
import {
  MATERIAL_TEXTURES,
  SHAPE_FEATURE_BY_TYPE,
  SHAPE_FEATURES,
  SHAPE_TYPES,
  type CameraState,
  type ShapeFeatures,
  type ShapeType,
  type ShipPartUpdate,
  type Vector3Tuple,
} from "./types";

export interface EditorCommands {
  getState: () => unknown;
  addShape: (type: ShapeType, position?: Vector3Tuple) => unknown;
  updatePart: (id: string, patch: ShipPartUpdate) => unknown;
  removePart: (id: string) => unknown;
  copySelectedPart: () => unknown;
  pastePart: () => unknown;
  undo: () => unknown;
  selectPart: (id: string | null) => unknown;
  setCamera: (camera: CameraState) => unknown;
  setCanvasBackground: (color: string) => unknown;
  newDesign: (name?: string) => unknown;
  saveDesign: (name?: string) => Promise<unknown>;
  listDesigns: () => Promise<unknown>;
  loadDesign: (id: string) => Promise<unknown>;
  exportDesign: () => unknown;
  importDesign: (value: unknown) => unknown;
}

export type WebMcpStatus = "ready" | "unavailable" | "error";

export interface WebMcpInvocation {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  invokedAt: number;
}

const vectorSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 3,
  maxItems: 3,
} as const;

const colorSchema = {
  type: "string",
  pattern: "^#[0-9a-fA-F]{6}$",
} as const;

const shipwrightDesignFileSchema = {
  type: "object",
  properties: {
    format: {
      type: "string",
      enum: [SHIPWRIGHT_DESIGN_FORMAT],
    },
    formatVersion: {
      type: "number",
      enum: [SHIPWRIGHT_DESIGN_FILE_VERSION],
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    data: {
      type: "object",
      properties: {
        version: { type: "number", enum: [1] },
        parts: {
          type: "array",
          items: {
            oneOf: SHAPE_TYPES.map(shipPartSchema),
          },
          maxItems: 100,
        },
        camera: {
          type: "object",
          properties: {
            position: boundedVectorSchema(-1_000, 1_000),
            target: boundedVectorSchema(-1_000, 1_000),
          },
          required: ["position", "target"],
          additionalProperties: false,
        },
        backgroundColor: colorSchema,
      },
      required: ["version", "parts", "camera"],
      additionalProperties: false,
    },
  },
  required: ["format", "formatVersion", "name", "data"],
  additionalProperties: false,
} as const;

export function useWebMcp(
  commands: RefObject<EditorCommands>,
  onInvocation: (invocation: WebMcpInvocation) => void,
): WebMcpStatus {
  const [status, setStatus] = useState<WebMcpStatus>("unavailable");

  useEffect(() => {
    const context = document.modelContext;
    if (!window.isSecureContext || !context?.registerTool) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const command = () => commands.current;
    const tools: WebMCP.ModelContextTool[] = [
      {
        name: "get_editor_state",
        title: "Inspect Shipwright",
        description:
          "Get the current ship design, selected part, camera, and save state in the Shipwright editor.",
        inputSchema: emptyObjectSchema(),
        annotations: { readOnlyHint: true },
        execute: () => command().getState(),
      },
      {
        name: "add_ship_part",
        title: "Add ship part",
        description:
          "Add one polygonal part to the visible ship design and select it.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...SHAPE_TYPES] },
            position: vectorSchema,
          },
          required: ["type"],
          additionalProperties: false,
        },
        execute: (input: Record<string, unknown>) => {
          const type = requireShapeType(input.type);
          const position = optionalVector(input.position, "position");
          return command().addShape(type, position);
        },
      },
      {
        name: "update_ship_part",
        title: "Update ship part",
        description:
          "Move, rotate, scale, recolor, texture, rename, or change supported shape features on an existing ship part. Transform values are absolute.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", minLength: 1, maxLength: 80 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
            texture: { type: "string", enum: [...MATERIAL_TEXTURES] },
            features: {
              type: "object",
              description:
                "Shape-specific toggles. Use chamfered for boxes, hollow for cylinders, and truncated for cones.",
              properties: {
                chamfered: {
                  type: "boolean",
                  description: "Chamfer the edges of a box.",
                },
                hollow: {
                  type: "boolean",
                  description: "Turn a cylinder into a hollow tube.",
                },
                truncated: {
                  type: "boolean",
                  description: "Turn a cone into a conical frustum.",
                },
              },
              additionalProperties: false,
            },
            position: vectorSchema,
            rotation: vectorSchema,
            scale: vectorSchema,
          },
          required: ["id"],
          additionalProperties: false,
        },
        execute: (input: Record<string, unknown>) => {
          const id = requireString(input.id, "id");
          const patch: ShipPartUpdate = {};
          if (input.name !== undefined)
            patch.name = requireString(input.name, "name");
          if (input.color !== undefined)
            patch.color = requireColor(input.color);
          if (input.texture !== undefined) {
            if (
              typeof input.texture !== "string" ||
              !MATERIAL_TEXTURES.includes(
                input.texture as (typeof MATERIAL_TEXTURES)[number],
              )
            ) {
              throw new TypeError(
                `texture must be one of: ${MATERIAL_TEXTURES.join(", ")}`,
              );
            }
            patch.texture = input.texture as ShipPartUpdate["texture"];
          }
          if (input.features !== undefined)
            patch.features = requireShapeFeatures(input.features);
          if (input.position !== undefined)
            patch.position = requireVector(input.position, "position");
          if (input.rotation !== undefined)
            patch.rotation = requireVector(input.rotation, "rotation");
          if (input.scale !== undefined) {
            const scale = requireVector(input.scale, "scale");
            if (scale.some((value) => value <= 0))
              throw new TypeError("scale values must be greater than zero");
            patch.scale = scale;
          }
          if (Object.keys(patch).length === 0)
            throw new TypeError("Provide at least one field to update.");
          return command().updatePart(id, patch);
        },
      },
      {
        name: "remove_ship_part",
        title: "Remove ship part",
        description: "Remove one part from the visible ship design by its ID.",
        inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
        execute: (input: Record<string, unknown>) =>
          command().removePart(requireString(input.id, "id")),
      },
      {
        name: "copy_selected_ship_part",
        title: "Copy selected ship part",
        description: "Copy the selected ship part to the editor clipboard.",
        inputSchema: emptyObjectSchema(),
        execute: () => command().copySelectedPart(),
      },
      {
        name: "paste_ship_part",
        title: "Paste ship part",
        description:
          "Paste the copied ship part with a new ID and a small position offset.",
        inputSchema: emptyObjectSchema(),
        execute: () => command().pastePart(),
      },
      {
        name: "undo_ship_edit",
        title: "Undo ship edit",
        description: "Undo the most recent component change.",
        inputSchema: emptyObjectSchema(),
        execute: () => command().undo(),
      },
      {
        name: "select_ship_part",
        title: "Select ship part",
        description:
          "Select a ship part by ID so its transform controls and inspector are visible. Use null to clear selection.",
        inputSchema: objectSchema({ id: { type: ["string", "null"] } }, ["id"]),
        execute: (input: Record<string, unknown>) => {
          if (input.id === null) return command().selectPart(null);
          return command().selectPart(requireString(input.id, "id"));
        },
      },
      {
        name: "set_editor_camera",
        title: "Set editor camera",
        description:
          "Set the 3D camera position and orbit target for the visible editing canvas.",
        inputSchema: objectSchema(
          { position: vectorSchema, target: vectorSchema },
          ["position", "target"],
        ),
        execute: (input: Record<string, unknown>) =>
          command().setCamera({
            position: requireVector(input.position, "position"),
            target: requireVector(input.target, "target"),
          }),
      },
      {
        name: "set_canvas_background",
        title: "Set canvas background",
        description:
          "Set the background and fog color of the visible editing canvas.",
        inputSchema: objectSchema(
          { color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } },
          ["color"],
        ),
        execute: (input: Record<string, unknown>) =>
          command().setCanvasBackground(requireColor(input.color)),
      },
      {
        name: "new_ship_design",
        title: "New ship design",
        description: "Start a new empty ship design in the visible editor.",
        inputSchema: objectSchema({ name: { type: "string", maxLength: 80 } }),
        execute: (input: Record<string, unknown>) =>
          command().newDesign(
            input.name === undefined
              ? undefined
              : requireString(input.name, "name"),
          ),
      },
      {
        name: "save_ship_design",
        title: "Save ship design",
        description:
          "Save the current ship design to the authenticated user's D1-backed collection.",
        inputSchema: objectSchema({ name: { type: "string", maxLength: 80 } }),
        execute: (input: Record<string, unknown>) =>
          command().saveDesign(
            input.name === undefined
              ? undefined
              : requireString(input.name, "name"),
          ),
      },
      {
        name: "list_ship_designs",
        title: "List ship designs",
        description: "List saved ship designs owned by the authenticated user.",
        inputSchema: emptyObjectSchema(),
        annotations: { readOnlyHint: true },
        execute: () => command().listDesigns(),
      },
      {
        name: "load_ship_design",
        title: "Load ship design",
        description:
          "Load one saved ship design into the visible editor by its ID.",
        inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
        execute: (input: Record<string, unknown>) =>
          command().loadDesign(requireString(input.id, "id")),
      },
      {
        name: "export_ship_design",
        title: "Export ship design",
        description:
          "Export the visible ship as a portable, versioned Shipwright design object for sharing.",
        inputSchema: emptyObjectSchema(),
        annotations: { readOnlyHint: true },
        execute: () => command().exportDesign(),
      },
      {
        name: "import_ship_design",
        title: "Import ship design",
        description:
          "Replace the visible editor contents with a portable Shipwright design. The imported design remains unsaved until it is saved explicitly.",
        inputSchema: shipwrightDesignFileSchema,
        execute: (input: Record<string, unknown>) =>
          command().importDesign(requireShipwrightDesignFile(input)),
      },
    ];

    const loggedTools = tools.map((tool) => {
      const execute = tool.execute;
      return {
        ...tool,
        execute: (input: Record<string, unknown>) => {
          onInvocation({
            id: crypto.randomUUID(),
            toolName: tool.name,
            input: structuredClone(input),
            invokedAt: Date.now(),
          });
          return execute(input);
        },
      };
    });

    void Promise.all(
      loggedTools.map((tool) =>
        context.registerTool(tool, { signal: controller.signal }),
      ),
    )
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        console.warn("WebMCP registration failed", error);
        setStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [commands, onInvocation]);

  return status;
}

function requireShapeType(value: unknown): ShapeType {
  if (typeof value !== "string" || !SHAPE_TYPES.includes(value as ShapeType)) {
    throw new TypeError(`type must be one of: ${SHAPE_TYPES.join(", ")}`);
  }
  return value as ShapeType;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError("color must be a six-digit hex color");
  }
  return value;
}

function requireShapeFeatures(value: unknown): ShapeFeatures {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("features must be an object");
  }

  const features = value as Record<string, unknown>;
  if (
    Object.entries(features).some(
      ([feature, enabled]) =>
        !SHAPE_FEATURES.includes(feature as (typeof SHAPE_FEATURES)[number]) ||
        typeof enabled !== "boolean",
    )
  ) {
    throw new TypeError(
      "features can contain only chamfered, hollow, or truncated booleans",
    );
  }
  return features as ShapeFeatures;
}

function optionalVector(
  value: unknown,
  field: string,
): Vector3Tuple | undefined {
  return value === undefined ? undefined : requireVector(value, field);
}

function requireVector(value: unknown, field: string): Vector3Tuple {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    throw new TypeError(`${field} must contain three finite numbers`);
  }
  return value as Vector3Tuple;
}

function requireShipwrightDesignFile(value: unknown) {
  const file = parseShipwrightDesignFile(value);
  if (!file) {
    throw new TypeError(
      "The design must use the supported Shipwright design file format.",
    );
  }
  return file;
}

function boundedVectorSchema(minimum: number, maximum: number) {
  return {
    type: "array",
    items: { type: "number", minimum, maximum },
    minItems: 3,
    maxItems: 3,
  } as const;
}

function shipPartSchema(type: ShapeType) {
  const feature = SHAPE_FEATURE_BY_TYPE[type];
  return {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1, maxLength: 100 },
      name: { type: "string", maxLength: 80 },
      type: { type: "string", enum: [type] },
      color: colorSchema,
      texture: { type: "string", enum: [...MATERIAL_TEXTURES] },
      ...(feature
        ? {
            features: {
              type: "object",
              properties: { [feature]: { type: "boolean" } },
              additionalProperties: false,
            },
          }
        : {}),
      position: boundedVectorSchema(-1_000, 1_000),
      rotation: boundedVectorSchema(-Math.PI * 100, Math.PI * 100),
      scale: boundedVectorSchema(0.01, 100),
    },
    required: ["id", "name", "type", "color", "position", "rotation", "scale"],
    additionalProperties: false,
  } as const;
}

function emptyObjectSchema() {
  return { type: "object", properties: {}, additionalProperties: false };
}

function objectSchema(properties: Record<string, object>, required?: string[]) {
  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
