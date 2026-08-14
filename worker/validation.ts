import {
  SHAPE_TYPES,
  type ShipDesignData,
  type ShipPart,
  type Vector3Tuple,
} from "../src/types";

const MAX_PARTS = 100;
const MAX_NAME_LENGTH = 80;
const MAX_ABSOLUTE_POSITION = 1_000;
const MAX_SCALE = 100;

export interface DesignInput {
  name: string;
  data: ShipDesignData;
}

export function parseDesignInput(value: unknown): DesignInput | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH || !isDesignData(value.data)) {
    return null;
  }
  return { name, data: value.data };
}

function isDesignData(value: unknown): value is ShipDesignData {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!Array.isArray(value.parts) || value.parts.length > MAX_PARTS) return false;
  if (!isRecord(value.camera)) return false;
  if (!isVector(value.camera.position, MAX_ABSOLUTE_POSITION)) return false;
  if (!isVector(value.camera.target, MAX_ABSOLUTE_POSITION)) return false;
  return value.parts.every(isPart);
}

function isPart(value: unknown): value is ShipPart {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length > 100) return false;
  if (typeof value.name !== "string" || value.name.length > MAX_NAME_LENGTH) {
    return false;
  }
  if (!SHAPE_TYPES.includes(value.type as (typeof SHAPE_TYPES)[number])) {
    return false;
  }
  if (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)) {
    return false;
  }
  return (
    isVector(value.position, MAX_ABSOLUTE_POSITION) &&
    isVector(value.rotation, Math.PI * 100) &&
    isVector(value.scale, MAX_SCALE, 0.01)
  );
}

function isVector(
  value: unknown,
  maximum: number,
  minimum = -maximum,
): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        entry >= minimum &&
        entry <= maximum,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
