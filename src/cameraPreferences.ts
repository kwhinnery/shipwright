import type { CameraState, Vector3Tuple } from "./types";

const CAMERA_PREFERENCE_VERSION = 1;
const CAMERA_PREFERENCE_PREFIX = "shipwright:canvas-view:v1:";
const MAX_ABSOLUTE_CAMERA_VALUE = 1_000;

interface StoredCameraPreference {
  version: typeof CAMERA_PREFERENCE_VERSION;
  camera: CameraState;
}

export function readCameraPreference(designId: string): CameraState | null {
  if (typeof window === "undefined") return null;

  try {
    const source = window.localStorage.getItem(preferenceKey(designId));
    if (!source) return null;

    const value = JSON.parse(source) as unknown;
    if (!isRecord(value) || value.version !== CAMERA_PREFERENCE_VERSION) {
      return null;
    }
    return parseCamera(value.camera);
  } catch {
    return null;
  }
}

export function writeCameraPreference(
  designId: string | null,
  camera: CameraState,
): void {
  if (!designId || typeof window === "undefined") return;

  const validCamera = parseCamera(camera);
  if (!validCamera) return;

  const preference: StoredCameraPreference = {
    version: CAMERA_PREFERENCE_VERSION,
    camera: validCamera,
  };

  try {
    window.localStorage.setItem(
      preferenceKey(designId),
      JSON.stringify(preference),
    );
  } catch {
    return;
  }
}

function preferenceKey(designId: string): string {
  return `${CAMERA_PREFERENCE_PREFIX}${encodeURIComponent(designId)}`;
}

function parseCamera(value: unknown): CameraState | null {
  if (!isRecord(value)) return null;
  const position = parseVector(value.position);
  const target = parseVector(value.target);
  return position && target ? { position, target } : null;
}

function parseVector(value: unknown): Vector3Tuple | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value;
  if (!isCameraNumber(x) || !isCameraNumber(y) || !isCameraNumber(z)) {
    return null;
  }
  return [x, y, z];
}

function isCameraNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABSOLUTE_CAMERA_VALUE
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
