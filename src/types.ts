export const SHAPE_TYPES = [
  "box",
  "wedge",
  "ramp",
  "trapezoid",
  "tapered-block",
  "cylinder",
  "sphere",
  "cone",
] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];
export const SHAPE_FEATURES = ["chamfered", "hollow", "truncated"] as const;
export type ShapeFeature = (typeof SHAPE_FEATURES)[number];
export type ShapeFeatures = Partial<Record<ShapeFeature, boolean>>;

export const SHAPE_FEATURE_BY_TYPE: Partial<Record<ShapeType, ShapeFeature>> = {
  box: "chamfered",
  cylinder: "hollow",
  cone: "truncated",
};

export type Vector3Tuple = [number, number, number];
export type TransformMode = "translate" | "rotate" | "scale";
export type ViewMode = "skeleton" | "solid";

export const MATERIAL_TEXTURES = [
  "smooth",
  "brushed",
  "plated",
  "composite",
] as const;

export type MaterialTexture = (typeof MATERIAL_TEXTURES)[number];

export interface ShipPart {
  id: string;
  name: string;
  type: ShapeType;
  color: string;
  texture?: MaterialTexture;
  features?: ShapeFeatures;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
}

export type ShipPartUpdate = Partial<
  Pick<
    ShipPart,
    | "name"
    | "color"
    | "texture"
    | "features"
    | "position"
    | "rotation"
    | "scale"
  >
>;

export interface CameraState {
  position: Vector3Tuple;
  target: Vector3Tuple;
}

export interface ShipDesignData {
  version: 1;
  parts: ShipPart[];
  camera: CameraState;
  backgroundColor?: string;
}

export interface DesignSummary {
  id: string;
  name: string;
  partCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedDesign extends DesignSummary {
  data: ShipDesignData;
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  isLocalDev: boolean;
}

export const DEFAULT_CAMERA: CameraState = {
  position: [10, 7, 12],
  target: [0, 0, 0],
};

export const DEFAULT_CANVAS_BACKGROUND = "#020907";

const defaultHullColor = "#74f7d2";

export function createStarterParts(): ShipPart[] {
  return [
    {
      id: crypto.randomUUID(),
      name: "Main hull",
      type: "wedge",
      color: defaultHullColor,
      texture: "plated",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2.2, 0.85, 4.8],
    },
    {
      id: crypto.randomUUID(),
      name: "Port wing",
      type: "box",
      color: "#47cdb6",
      texture: "composite",
      position: [-2.7, -0.05, 0.7],
      rotation: [0, 0, -0.08],
      scale: [3.4, 0.18, 2.5],
    },
    {
      id: crypto.randomUUID(),
      name: "Starboard wing",
      type: "box",
      color: "#47cdb6",
      texture: "composite",
      position: [2.7, -0.05, 0.7],
      rotation: [0, 0, 0.08],
      scale: [3.4, 0.18, 2.5],
    },
    {
      id: crypto.randomUUID(),
      name: "Engine core",
      type: "cylinder",
      color: "#f2b84b",
      texture: "brushed",
      position: [0, 0, 2.8],
      rotation: [Math.PI / 2, 0, 0],
      scale: [0.65, 1.3, 0.65],
    },
  ];
}

export function createPart(type: ShapeType, index: number): ShipPart {
  const labels: Record<ShapeType, string> = {
    box: "Armor block",
    wedge: "Hull wedge",
    ramp: "Hull ramp",
    trapezoid: "Trapezoidal prism",
    "tapered-block": "Tapered block",
    cylinder: "Engine cylinder",
    sphere: "Sensor sphere",
    cone: "Nose cone",
  };

  return {
    id: crypto.randomUUID(),
    name: `${labels[type]} ${index}`,
    type,
    color: type === "cone" ? "#f2b84b" : defaultHullColor,
    texture: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}
