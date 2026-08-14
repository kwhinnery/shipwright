import { useEffect, useState, type RefObject } from "react";
import {
  SHAPE_TYPES,
  type CameraState,
  type ShapeType,
  type ShipPart,
  type Vector3Tuple,
} from "./types";

export interface EditorCommands {
  getState: () => unknown;
  addShape: (type: ShapeType, position?: Vector3Tuple) => unknown;
  updatePart: (
    id: string,
    patch: Partial<Pick<ShipPart, "name" | "color" | "position" | "rotation" | "scale">>,
  ) => unknown;
  removePart: (id: string) => unknown;
  selectPart: (id: string | null) => unknown;
  setCamera: (camera: CameraState) => unknown;
  newDesign: (name?: string) => unknown;
  saveDesign: (name?: string) => Promise<unknown>;
  listDesigns: () => Promise<unknown>;
  loadDesign: (id: string) => Promise<unknown>;
}

export type WebMcpStatus = "ready" | "unavailable" | "error";

const vectorSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 3,
  maxItems: 3,
} as const;

export function useWebMcp(
  commands: RefObject<EditorCommands>,
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
          "Move, rotate, scale, recolor, or rename an existing ship part. Transform values are absolute.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", minLength: 1, maxLength: 80 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
            position: vectorSchema,
            rotation: vectorSchema,
            scale: vectorSchema,
          },
          required: ["id"],
          additionalProperties: false,
        },
        execute: (input: Record<string, unknown>) => {
          const id = requireString(input.id, "id");
          const patch: Partial<
            Pick<ShipPart, "name" | "color" | "position" | "rotation" | "scale">
          > = {};
          if (input.name !== undefined) patch.name = requireString(input.name, "name");
          if (input.color !== undefined) patch.color = requireColor(input.color);
          if (input.position !== undefined) patch.position = requireVector(input.position, "position");
          if (input.rotation !== undefined) patch.rotation = requireVector(input.rotation, "rotation");
          if (input.scale !== undefined) {
            const scale = requireVector(input.scale, "scale");
            if (scale.some((value) => value <= 0)) throw new TypeError("scale values must be greater than zero");
            patch.scale = scale;
          }
          if (Object.keys(patch).length === 0) throw new TypeError("Provide at least one field to update.");
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
        name: "select_ship_part",
        title: "Select ship part",
        description:
          "Select a ship part by ID so its transform controls and inspector are visible. Use null to clear selection.",
        inputSchema: objectSchema(
          { id: { type: ["string", "null"] } },
          ["id"],
        ),
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
        name: "new_ship_design",
        title: "New ship design",
        description: "Start a new empty ship design in the visible editor.",
        inputSchema: objectSchema({ name: { type: "string", maxLength: 80 } }),
        execute: (input: Record<string, unknown>) =>
          command().newDesign(
            input.name === undefined ? undefined : requireString(input.name, "name"),
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
            input.name === undefined ? undefined : requireString(input.name, "name"),
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
        description: "Load one saved ship design into the visible editor by its ID.",
        inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
        execute: (input: Record<string, unknown>) =>
          command().loadDesign(requireString(input.id, "id")),
      },
    ];

    void Promise.all(
      tools.map((tool) => context.registerTool(tool, { signal: controller.signal })),
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
  }, [commands]);

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

function optionalVector(value: unknown, field: string): Vector3Tuple | undefined {
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

function emptyObjectSchema() {
  return { type: "object", properties: {}, additionalProperties: false };
}

function objectSchema(
  properties: Record<string, object>,
  required?: string[],
) {
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
