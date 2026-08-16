import {
  Edges,
  Environment,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import type {
  CameraState,
  MaterialTexture,
  ShipPart,
  TransformMode,
  Vector3Tuple,
  ViewMode,
} from "../types";

interface ShipCanvasProps {
  parts: ShipPart[];
  selectedPartId: string | null;
  transformMode: TransformMode;
  camera: CameraState;
  cameraRevision: number;
  backgroundColor: string;
  viewMode: ViewMode;
  onSelectPart: (id: string | null) => void;
  onTransformPart: (
    id: string,
    transform: Pick<ShipPart, "position" | "rotation" | "scale">,
  ) => void;
  onCameraChange: (camera: CameraState) => void;
}

export function ShipCanvas({
  parts,
  selectedPartId,
  transformMode,
  camera,
  cameraRevision,
  backgroundColor,
  viewMode,
  onSelectPart,
  onTransformPart,
  onCameraChange,
}: ShipCanvasProps) {
  const transformControls = useRef<TransformControlsImpl>(null!);
  const selectAfterControls = (id: string | null) => {
    queueMicrotask(() => {
      if (isTransformHandleActive(transformControls.current)) return;
      onSelectPart(id);
    });
  };

  return (
    <Canvas
      aria-label="3D spaceship editing canvas"
      role="img"
      camera={{ position: camera.position, fov: 42, near: 0.1, far: 240 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => selectAfterControls(null)}
    >
      <color attach="background" args={[backgroundColor]} />
      <fog attach="fog" args={[backgroundColor, 24, 72]} />
      <StudioEnvironment />
      <hemisphereLight
        color="#d8fff5"
        groundColor="#17382f"
        intensity={viewMode === "solid" ? 0.75 : 0.5}
      />
      <directionalLight
        position={[7, 10, -9]}
        intensity={viewMode === "solid" ? 2.3 : 1.5}
        color="#d8fff5"
      />
      <directionalLight
        position={[-9, 4, -3]}
        intensity={viewMode === "solid" ? 1.35 : 0.85}
        color="#86d9c6"
      />
      <directionalLight
        position={[4, 7, 10]}
        intensity={viewMode === "solid" ? 1.6 : 1}
        color="#a7ffe8"
      />
      <pointLight
        position={[-7, -4, 6]}
        intensity={20}
        color="#f2a93b"
        distance={28}
      />
      <CameraFillLight intensity={viewMode === "solid" ? 0.28 : 0.12} />

      <FixedStars />
      <Grid
        position={[0, -2.1, 0]}
        args={[64, 64]}
        cellSize={1}
        cellThickness={0.45}
        cellColor="#16483d"
        sectionSize={4}
        sectionThickness={0.8}
        sectionColor="#2a8a73"
        fadeDistance={52}
        fadeStrength={1.6}
        infiniteGrid
      />

      <group name="ship-parts">
        {parts.map((part) => (
          <EditablePart
            key={part.id}
            part={part}
            selected={part.id === selectedPartId}
            viewMode={viewMode}
            transformMode={transformMode}
            transformControls={transformControls}
            onSelect={selectAfterControls}
            onTransform={onTransformPart}
          />
        ))}
      </group>

      <CameraRig
        state={camera}
        revision={cameraRevision}
        onChange={onCameraChange}
      />
    </Canvas>
  );
}

interface EditablePartProps {
  part: ShipPart;
  selected: boolean;
  viewMode: ViewMode;
  transformMode: TransformMode;
  transformControls: RefObject<TransformControlsImpl>;
  onSelect: (id: string) => void;
  onTransform: ShipCanvasProps["onTransformPart"];
}

function EditablePart({
  part,
  selected,
  viewMode,
  transformMode,
  transformControls,
  onSelect,
  onTransform,
}: EditablePartProps) {
  const group = useRef<THREE.Group>(null!);
  const texture = useMaterialTexture(part.texture ?? "smooth");
  const solid = viewMode === "solid";

  const handleSelect = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect(part.id);
  };

  const commitTransform = () => {
    if (!group.current) return;
    onTransform(part.id, {
      position: roundVector(group.current.position.toArray()),
      rotation: roundVector([
        group.current.rotation.x,
        group.current.rotation.y,
        group.current.rotation.z,
      ]),
      scale: roundVector(group.current.scale.toArray(), 0.01),
    });
  };

  const object = (
    <group
      ref={group}
      name={part.id}
      position={part.position}
      rotation={part.rotation}
      scale={part.scale}
      onPointerDown={handleSelect}
    >
      <mesh castShadow receiveShadow>
        <ShapeGeometry part={part} />
        <meshStandardMaterial
          color={part.color}
          emissive={selected ? "#d89d2a" : solid ? "#000000" : "#0b7863"}
          emissiveIntensity={
            selected ? (solid ? 0.18 : 0.75) : solid ? 0 : 0.38
          }
          metalness={solid ? materialFinish(part.texture).metalness : 0.35}
          roughness={solid ? materialFinish(part.texture).roughness : 0.48}
          bumpMap={solid ? texture : null}
          bumpScale={solid ? materialFinish(part.texture).bumpScale : 0}
          flatShading
          transparent={!solid}
          opacity={solid ? 1 : selected ? 0.86 : 0.72}
        />
        {(!solid || selected) && (
          <Edges
            threshold={12}
            color={selected ? "#ffd56a" : "#9affdf"}
            lineWidth={selected ? 2.2 : 1.25}
          />
        )}
      </mesh>
    </group>
  );

  return (
    <>
      {object}
      {selected && (
        <TransformControls
          ref={transformControls}
          object={group}
          mode={transformMode}
          space={transformMode === "translate" ? "world" : "local"}
          translationSnap={0.25}
          rotationSnap={Math.PI / 12}
          scaleSnap={0.1}
          size={0.82}
          onMouseUp={commitTransform}
        />
      )}
    </>
  );
}

function useMaterialTexture(type: MaterialTexture): THREE.CanvasTexture | null {
  const texture = useMemo(() => {
    if (type === "smooth") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = "#808080";
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#b8b8b8";

    if (type === "brushed") {
      context.globalAlpha = 0.35;
      for (let y = 2; y < 128; y += 4) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(128, y + (y % 3));
        context.stroke();
      }
    } else if (type === "plated") {
      context.lineWidth = 3;
      for (let offset = 0; offset <= 128; offset += 32) {
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset, 128);
        context.moveTo(0, offset);
        context.lineTo(128, offset);
        context.stroke();
      }
      context.fillStyle = "#505050";
      for (let x = 4; x < 128; x += 32) {
        for (let y = 4; y < 128; y += 32) context.fillRect(x, y, 3, 3);
      }
    } else {
      context.lineWidth = 2;
      for (let offset = -128; offset < 256; offset += 8) {
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset + 128, 128);
        context.stroke();
        context.beginPath();
        context.moveTo(offset + 128, 0);
        context.lineTo(offset, 128);
        context.stroke();
      }
    }

    const result = new THREE.CanvasTexture(canvas);
    result.wrapS = THREE.RepeatWrapping;
    result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(2, 2);
    return result;
  }, [type]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function materialFinish(type: MaterialTexture | undefined) {
  switch (type) {
    case "brushed":
      return { metalness: 0.72, roughness: 0.34, bumpScale: 0.018 };
    case "plated":
      return { metalness: 0.58, roughness: 0.42, bumpScale: 0.045 };
    case "composite":
      return { metalness: 0.16, roughness: 0.56, bumpScale: 0.025 };
    default:
      return { metalness: 0.46, roughness: 0.32, bumpScale: 0 };
  }
}

function isTransformHandleActive(
  controls: TransformControlsImpl | null,
): boolean {
  if (!controls) return false;
  const state = controls as unknown as {
    axis: string | null;
    dragging: boolean;
  };
  return state.axis !== null || state.dragging;
}

function ShapeGeometry({ part }: { part: ShipPart }) {
  const chamfered = part.features?.chamfered ?? false;
  const hollow = part.features?.hollow ?? false;
  const customGeometry = useMemo(() => {
    switch (part.type) {
      case "box":
        return chamfered ? new RoundedBoxGeometry(1, 1, 1, 1, 0.12) : null;
      case "wedge":
        return createWedgeGeometry();
      case "ramp":
        return createRampGeometry();
      case "trapezoid":
        return createTrapezoidGeometry();
      case "tapered-block":
        return createTaperedBlockGeometry();
      case "cylinder":
        return hollow ? createHollowCylinderGeometry() : null;
      default:
        return null;
    }
  }, [chamfered, hollow, part.type]);
  useEffect(() => () => customGeometry?.dispose(), [customGeometry]);

  if (customGeometry) {
    return <primitive object={customGeometry} attach="geometry" />;
  }

  switch (part.type) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 10, 1, false]} />;
    case "sphere":
      return <sphereGeometry args={[0.62, 12, 8]} />;
    case "cone":
      if (part.features?.truncated) {
        return <cylinderGeometry args={[0.28, 0.65, 1.4, 8, 1, false]} />;
      }
      return <coneGeometry args={[0.65, 1.4, 8, 1, false]} />;
    case "wedge":
    case "ramp":
    case "trapezoid":
    case "tapered-block":
      return null;
  }
}

function CameraRig({
  state,
  revision,
  onChange,
}: {
  state: CameraState;
  revision: number;
  onChange: (state: CameraState) => void;
}) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    camera.position.set(...state.position);
    controls.current?.target.set(...state.target);
    controls.current?.update();
  }, [camera, revision, state.position, state.target]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableRotate
      enableZoom
      enableDamping={false}
      minDistance={4}
      maxDistance={46}
      maxPolarAngle={Math.PI * 0.9}
      onEnd={() => {
        if (!controls.current) return;
        onChange({
          position: roundVector(camera.position.toArray()),
          target: roundVector(controls.current.target.toArray()),
        });
      }}
    />
  );
}

function CameraFillLight({ intensity }: { intensity: number }) {
  const light = useRef<THREE.PointLight>(null);

  useFrame(({ camera }) => {
    light.current?.position.copy(camera.position);
  });

  return (
    <pointLight
      ref={light}
      name="camera-fill"
      color="#d8fff5"
      intensity={intensity}
      distance={0}
      decay={0}
    />
  );
}

function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const environment = useMemo(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    return target;
  }, [gl]);

  useEffect(() => () => environment.dispose(), [environment]);

  return <Environment map={environment.texture} environmentIntensity={0.6} />;
}

function FixedStars() {
  const positions = useMemo(() => {
    const values: number[] = [];
    for (let index = 0; index < 180; index += 1) {
      const longitude = index * 2.399963229728653;
      const latitude = Math.acos(1 - (2 * (index + 0.5)) / 180);
      const radius = 58 + (index % 7) * 1.4;
      values.push(
        radius * Math.sin(latitude) * Math.cos(longitude),
        radius * Math.cos(latitude),
        radius * Math.sin(latitude) * Math.sin(longitude),
      );
    }
    return new Float32Array(values);
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#95ffe1"
        size={0.16}
        sizeAttenuation
        transparent
        opacity={0.72}
      />
    </points>
  );
}

function createWedgeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0,
        -0.28, -0.5, 0, 0.28, -0.5,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 4, 1, 2, 3, 5, 0, 1, 3, 0, 3, 2, 0, 2, 5, 0, 5, 4, 1, 4, 5, 1, 5, 3,
  ]);
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 1, 1, 0.5, 0, 0.5, 1],
      2,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function createRampGeometry(): THREE.BufferGeometry {
  return createTriangleGeometry(
    [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
    ],
    [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 0, 4, 5, 0, 5, 1, 0, 2, 4, 1, 5, 3],
  );
}

function createTrapezoidGeometry(): THREE.BufferGeometry {
  return createTaperedBoxGeometry(false);
}

function createTaperedBlockGeometry(): THREE.BufferGeometry {
  return createTaperedBoxGeometry(true);
}

function createTaperedBoxGeometry(taperHeight: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;

  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index);
    const taper = THREE.MathUtils.lerp(0.52, 1, z + 0.5);
    positions.setX(index, positions.getX(index) * taper);
    if (taperHeight) positions.setY(index, positions.getY(index) * taper);
  }

  positions.needsUpdate = true;
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  return geometry;
}

function createHollowCylinderGeometry(): THREE.BufferGeometry {
  const segments = 10;
  const outerRadius = 0.5;
  const innerRadius = 0.32;
  const bottom = -0.5;
  const top = 0.5;
  const positions: number[] = [];
  const uvs: number[] = [];

  const addTriangle = (
    first: Vector3Tuple,
    second: Vector3Tuple,
    third: Vector3Tuple,
  ) => {
    positions.push(...first, ...second, ...third);
    uvs.push(0, 0, 1, 0, 0.5, 1);
  };

  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    const outerBottomStart: Vector3Tuple = [
      Math.cos(start) * outerRadius,
      bottom,
      Math.sin(start) * outerRadius,
    ];
    const outerTopStart: Vector3Tuple = [
      outerBottomStart[0],
      top,
      outerBottomStart[2],
    ];
    const outerBottomEnd: Vector3Tuple = [
      Math.cos(end) * outerRadius,
      bottom,
      Math.sin(end) * outerRadius,
    ];
    const outerTopEnd: Vector3Tuple = [
      outerBottomEnd[0],
      top,
      outerBottomEnd[2],
    ];
    const innerBottomStart: Vector3Tuple = [
      Math.cos(start) * innerRadius,
      bottom,
      Math.sin(start) * innerRadius,
    ];
    const innerTopStart: Vector3Tuple = [
      innerBottomStart[0],
      top,
      innerBottomStart[2],
    ];
    const innerBottomEnd: Vector3Tuple = [
      Math.cos(end) * innerRadius,
      bottom,
      Math.sin(end) * innerRadius,
    ];
    const innerTopEnd: Vector3Tuple = [
      innerBottomEnd[0],
      top,
      innerBottomEnd[2],
    ];

    addTriangle(outerBottomStart, outerTopStart, outerTopEnd);
    addTriangle(outerBottomStart, outerTopEnd, outerBottomEnd);
    addTriangle(innerBottomStart, innerBottomEnd, innerTopEnd);
    addTriangle(innerBottomStart, innerTopEnd, innerTopStart);
    addTriangle(outerTopStart, innerTopStart, innerTopEnd);
    addTriangle(outerTopStart, innerTopEnd, outerTopEnd);
    addTriangle(outerBottomStart, outerBottomEnd, innerBottomEnd);
    addTriangle(outerBottomStart, innerBottomEnd, innerBottomStart);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createTriangleGeometry(
  vertices: Vector3Tuple[],
  indices: number[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  indices.forEach((index, triangleIndex) => {
    positions.push(...vertices[index]);
    const uvIndex = triangleIndex % 3;
    uvs.push(
      uvIndex === 1 ? 1 : uvIndex === 2 ? 0.5 : 0,
      uvIndex === 2 ? 1 : 0,
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function roundVector(values: number[], minimumMagnitude = 0): Vector3Tuple {
  return values.map((value) => {
    const rounded = Math.round(value * 1_000) / 1_000;
    if (minimumMagnitude > 0 && Math.abs(rounded) < minimumMagnitude) {
      return minimumMagnitude;
    }
    return rounded;
  }) as Vector3Tuple;
}
