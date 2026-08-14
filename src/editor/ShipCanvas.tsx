import { Edges, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  CameraState,
  ShipPart,
  TransformMode,
  Vector3Tuple,
} from "../types";

interface ShipCanvasProps {
  parts: ShipPart[];
  selectedPartId: string | null;
  transformMode: TransformMode;
  camera: CameraState;
  cameraRevision: number;
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
  onSelectPart,
  onTransformPart,
  onCameraChange,
}: ShipCanvasProps) {
  return (
    <Canvas
      aria-label="3D spaceship editing canvas"
      role="img"
      camera={{ position: camera.position, fov: 42, near: 0.1, far: 240 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelectPart(null)}
    >
      <color attach="background" args={["#020907"]} />
      <fog attach="fog" args={["#020907", 24, 72]} />
      <ambientLight intensity={0.75} color="#7fffe1" />
      <directionalLight position={[8, 12, 6]} intensity={2.1} color="#b3ffe9" />
      <pointLight position={[-8, -2, 4]} intensity={28} color="#f2a93b" distance={22} />

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
            transformMode={transformMode}
            onSelect={onSelectPart}
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
  transformMode: TransformMode;
  onSelect: (id: string) => void;
  onTransform: ShipCanvasProps["onTransformPart"];
}

function EditablePart({
  part,
  selected,
  transformMode,
  onSelect,
  onTransform,
}: EditablePartProps) {
  const group = useRef<THREE.Group>(null!);

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
        <ShapeGeometry type={part.type} />
        <meshStandardMaterial
          color={part.color}
          emissive={selected ? "#d89d2a" : "#0b7863"}
          emissiveIntensity={selected ? 0.75 : 0.38}
          metalness={0.35}
          roughness={0.48}
          flatShading
          transparent
          opacity={selected ? 0.86 : 0.72}
        />
        <Edges
          threshold={12}
          color={selected ? "#ffd56a" : "#9affdf"}
          lineWidth={selected ? 2.2 : 1.25}
        />
      </mesh>
    </group>
  );

  return (
    <>
      {object}
      {selected && (
        <TransformControls
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

function ShapeGeometry({ type }: { type: ShipPart["type"] }) {
  const wedge = useMemo(() => createWedgeGeometry(), []);
  useEffect(() => () => wedge.dispose(), [wedge]);

  switch (type) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "wedge":
      return <primitive object={wedge} attach="geometry" />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 10, 1, false]} />;
    case "sphere":
      return <sphereGeometry args={[0.62, 12, 8]} />;
    case "cone":
      return <coneGeometry args={[0.65, 1.4, 8, 1, false]} />;
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
      <pointsMaterial color="#95ffe1" size={0.16} sizeAttenuation transparent opacity={0.72} />
    </points>
  );
}

function createWedgeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.5, -0.5, 0.5,
        0.5, -0.5, 0.5,
        -0.5, 0.5, 0.5,
        0.5, 0.5, 0.5,
        0, -0.28, -0.5,
        0, 0.28, -0.5,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 4, 1,
    2, 3, 5,
    0, 1, 3,
    0, 3, 2,
    0, 2, 5,
    0, 5, 4,
    1, 4, 5,
    1, 5, 3,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function roundVector(
  values: number[],
  minimumMagnitude = 0,
): Vector3Tuple {
  return values.map((value) => {
    const rounded = Math.round(value * 1_000) / 1_000;
    if (minimumMagnitude > 0 && Math.abs(rounded) < minimumMagnitude) {
      return minimumMagnitude;
    }
    return rounded;
  }) as Vector3Tuple;
}
