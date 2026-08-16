import {
  MATERIAL_TEXTURES,
  SHAPE_FEATURE_BY_TYPE,
  SHAPE_TYPES,
  type CameraState,
  type MaterialTexture,
  type ShapeFeatures,
  type ShapeType,
  type ShipDesignData,
  type ShipPart,
  type Vector3Tuple,
} from "./types";

export const SHIPWRIGHT_DESIGN_FORMAT = "shipwright-design";
export const SHIPWRIGHT_DESIGN_FILE_VERSION = 1;
export const MAX_SHIPWRIGHT_FILE_BYTES = 512 * 1_024;

const MAX_PARTS = 100;
const MAX_NAME_LENGTH = 80;
const MAX_ID_LENGTH = 100;
const MAX_ABSOLUTE_POSITION = 1_000;
const MAX_SCALE = 100;

export interface DesignInput {
  name: string;
  data: ShipDesignData;
}

export interface ShipwrightDesignFile {
  format: typeof SHIPWRIGHT_DESIGN_FORMAT;
  formatVersion: typeof SHIPWRIGHT_DESIGN_FILE_VERSION;
  name: string;
  data: ShipDesignData;
}

export function createShipwrightDesignFile(
  name: string,
  data: ShipDesignData,
): ShipwrightDesignFile {
  const file = parseShipwrightDesignFile({
    format: SHIPWRIGHT_DESIGN_FORMAT,
    formatVersion: SHIPWRIGHT_DESIGN_FILE_VERSION,
    name,
    data,
  });
  if (!file) throw new Error("The current design cannot be exported.");
  return file;
}

export function parseShipwrightDesignFile(
  value: unknown,
): ShipwrightDesignFile | null {
  if (!isRecord(value)) return null;
  if (value.format !== SHIPWRIGHT_DESIGN_FORMAT) return null;
  if (value.formatVersion !== SHIPWRIGHT_DESIGN_FILE_VERSION) return null;
  const input = parseDesignInput(value);
  if (!input) return null;
  return {
    format: SHIPWRIGHT_DESIGN_FORMAT,
    formatVersion: SHIPWRIGHT_DESIGN_FILE_VERSION,
    ...input,
  };
}

export function parseDesignInput(value: unknown): DesignInput | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  const data = parseShipDesignData(value.data);
  return data ? { name, data } : null;
}

export function parseShipDesignData(value: unknown): ShipDesignData | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!Array.isArray(value.parts) || value.parts.length > MAX_PARTS)
    return null;

  const camera = parseCamera(value.camera);
  if (!camera) return null;

  const backgroundColor = value.backgroundColor;
  if (
    backgroundColor !== undefined &&
    (typeof backgroundColor !== "string" || !isColor(backgroundColor))
  ) {
    return null;
  }

  const parts: ShipPart[] = [];
  const partIds = new Set<string>();
  for (const candidate of value.parts) {
    const part = parsePart(candidate);
    if (!part || partIds.has(part.id)) return null;
    partIds.add(part.id);
    parts.push(part);
  }

  return {
    version: 1,
    parts,
    camera,
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
  };
}

export function shipwrightDesignFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "ship-design"}.shipwright.json`;
}

function parseCamera(value: unknown): CameraState | null {
  if (!isRecord(value)) return null;
  const position = parseVector(value.position, MAX_ABSOLUTE_POSITION);
  const target = parseVector(value.target, MAX_ABSOLUTE_POSITION);
  return position && target ? { position, target } : null;
}

function parsePart(value: unknown): ShipPart | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > MAX_ID_LENGTH
  ) {
    return null;
  }
  if (typeof value.name !== "string" || value.name.length > MAX_NAME_LENGTH) {
    return null;
  }
  if (
    typeof value.type !== "string" ||
    !SHAPE_TYPES.includes(value.type as ShapeType)
  ) {
    return null;
  }
  if (typeof value.color !== "string" || !isColor(value.color)) return null;
  if (
    value.texture !== undefined &&
    (typeof value.texture !== "string" ||
      !MATERIAL_TEXTURES.includes(value.texture as MaterialTexture))
  ) {
    return null;
  }

  const type = value.type as ShapeType;
  const features = parseFeatures(type, value.features);
  if (features === null) return null;
  const position = parseVector(value.position, MAX_ABSOLUTE_POSITION);
  const rotation = parseVector(value.rotation, Math.PI * 100);
  const scale = parseVector(value.scale, MAX_SCALE, 0.01);
  if (!position || !rotation || !scale) return null;

  return {
    id: value.id,
    name: value.name,
    type,
    color: value.color,
    ...(value.texture === undefined
      ? {}
      : { texture: value.texture as MaterialTexture }),
    ...(Object.keys(features).length === 0 ? {} : { features }),
    position,
    rotation,
    scale,
  };
}

function parseFeatures(type: ShapeType, value: unknown): ShapeFeatures | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const supportedFeature = SHAPE_FEATURE_BY_TYPE[type];
  const entries = Object.entries(value);
  if (
    entries.some(
      ([feature, enabled]) =>
        feature !== supportedFeature || typeof enabled !== "boolean",
    )
  ) {
    return null;
  }
  return Object.fromEntries(entries) as ShapeFeatures;
}

function parseVector(
  value: unknown,
  maximum: number,
  minimum = -maximum,
): Vector3Tuple | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        entry >= minimum &&
        entry <= maximum,
    )
  ) {
    return null;
  }
  return [...value] as Vector3Tuple;
}

function isColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
