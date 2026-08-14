import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import * as api from "./api";
import { ApiError } from "./api";
import {
  DEFAULT_CAMERA,
  SHAPE_TYPES,
  createPart,
  createStarterParts,
  type CameraState,
  type DesignSummary,
  type SavedDesign,
  type SessionUser,
  type ShapeType,
  type ShipPart,
  type TransformMode,
  type Vector3Tuple,
} from "./types";
import {
  useWebMcp,
  type EditorCommands,
  type WebMcpStatus,
} from "./useWebMcp";

const ShipCanvas = lazy(() =>
  import("./editor/ShipCanvas").then((module) => ({
    default: module.ShipCanvas,
  })),
);

const SHAPE_LABELS: Record<ShapeType, string> = {
  box: "Block",
  wedge: "Wedge",
  cylinder: "Cylinder",
  sphere: "Sphere",
  cone: "Cone",
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export default function App() {
  const [parts, setParts] = useState<ShipPart[]>(createStarterParts);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [camera, setCameraState] = useState<CameraState>(DEFAULT_CAMERA);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [designId, setDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState("Untitled Scout");
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("dirty");
  const [notice, setNotice] = useState<string | null>(null);

  const partsRef = useRef(parts);
  const selectedPartIdRef = useRef(selectedPartId);
  const cameraRef = useRef(camera);
  const designIdRef = useRef(designId);
  const designNameRef = useRef(designName);
  const saveStatusRef = useRef(saveStatus);
  const savePromiseRef = useRef<Promise<SavedDesign> | null>(null);

  const markDirty = useCallback(() => {
    saveStatusRef.current = "dirty";
    setSaveStatus("dirty");
  }, []);

  const replaceParts = useCallback(
    (next: ShipPart[]) => {
      partsRef.current = next;
      setParts(next);
      markDirty();
    },
    [markDirty],
  );

  const selectPart = useCallback((id: string | null) => {
    if (id !== null && !partsRef.current.some((part) => part.id === id)) {
      throw new Error(`Ship part ${id} was not found.`);
    }
    selectedPartIdRef.current = id;
    setSelectedPartId(id);
    return { selectedPartId: id };
  }, []);

  const addShape = useCallback(
    (type: ShapeType, position?: Vector3Tuple) => {
      if (partsRef.current.length >= 100) {
        throw new Error("A design can contain at most 100 parts.");
      }
      const part = createPart(type, partsRef.current.length + 1);
      if (position) part.position = position;
      replaceParts([...partsRef.current, part]);
      selectedPartIdRef.current = part.id;
      setSelectedPartId(part.id);
      return { part, partCount: partsRef.current.length };
    },
    [replaceParts],
  );

  const updatePart = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<ShipPart, "name" | "color" | "position" | "rotation" | "scale">
      >,
    ) => {
      const current = partsRef.current.find((part) => part.id === id);
      if (!current) throw new Error(`Ship part ${id} was not found.`);
      const updated = { ...current, ...patch };
      replaceParts(
        partsRef.current.map((part) => (part.id === id ? updated : part)),
      );
      return { part: updated };
    },
    [replaceParts],
  );

  const removePart = useCallback(
    (id: string) => {
      const current = partsRef.current.find((part) => part.id === id);
      if (!current) throw new Error(`Ship part ${id} was not found.`);
      replaceParts(partsRef.current.filter((part) => part.id !== id));
      if (selectedPartIdRef.current === id) {
        selectedPartIdRef.current = null;
        setSelectedPartId(null);
      }
      return { removedPartId: id, partCount: partsRef.current.length };
    },
    [replaceParts],
  );

  const setCamera = useCallback((next: CameraState) => {
    cameraRef.current = next;
    setCameraState(next);
    setCameraRevision((value) => value + 1);
    markDirty();
    return { camera: next };
  }, [markDirty]);

  const setCameraFromCanvas = useCallback((next: CameraState) => {
    cameraRef.current = next;
    setCameraState(next);
    markDirty();
  }, [markDirty]);

  const applySavedDesign = useCallback((saved: SavedDesign) => {
    partsRef.current = saved.data.parts;
    setParts(saved.data.parts);
    cameraRef.current = saved.data.camera;
    setCameraState(saved.data.camera);
    setCameraRevision((value) => value + 1);
    designIdRef.current = saved.id;
    setDesignId(saved.id);
    designNameRef.current = saved.name;
    setDesignName(saved.name);
    selectedPartIdRef.current = null;
    setSelectedPartId(null);
    saveStatusRef.current = "saved";
    setSaveStatus("saved");
  }, []);

  const refreshDesigns = useCallback(async () => {
    const result = await api.listDesigns();
    setDesigns(result);
    return { designs: result };
  }, []);

  const loadDesign = useCallback(
    async (id: string) => {
      const saved = await api.getDesign(id);
      applySavedDesign(saved);
      setNotice(`Loaded ${saved.name}.`);
      return saved;
    },
    [applySavedDesign],
  );

  const newDesign = useCallback((name = "Untitled Vessel") => {
    partsRef.current = [];
    setParts([]);
    selectedPartIdRef.current = null;
    setSelectedPartId(null);
    cameraRef.current = DEFAULT_CAMERA;
    setCameraState(DEFAULT_CAMERA);
    setCameraRevision((value) => value + 1);
    designIdRef.current = null;
    setDesignId(null);
    designNameRef.current = name.trim() || "Untitled Vessel";
    setDesignName(designNameRef.current);
    saveStatusRef.current = "dirty";
    setSaveStatus("dirty");
    setNotice("New design frame ready.");
    return { name: designNameRef.current, parts: [] };
  }, []);

  const saveDesign = useCallback(
    async (requestedName?: string): Promise<SavedDesign> => {
      if (savePromiseRef.current) return savePromiseRef.current;

      const cleanName = (requestedName ?? designNameRef.current).trim();
      if (!cleanName) throw new Error("Enter a design name before saving.");

      designNameRef.current = cleanName;
      setDesignName(cleanName);
      saveStatusRef.current = "saving";
      setSaveStatus("saving");

      const payload = {
        name: cleanName,
        data: {
          version: 1 as const,
          parts: partsRef.current,
          camera: cameraRef.current,
        },
      };

      const request = designIdRef.current
        ? api.updateDesign(designIdRef.current, payload)
        : api.createDesign(payload);

      savePromiseRef.current = request;
      try {
        const saved = await request;
        designIdRef.current = saved.id;
        setDesignId(saved.id);
        saveStatusRef.current = "saved";
        setSaveStatus("saved");
        setNotice(`Saved ${saved.name}.`);
        await refreshDesigns();
        return saved;
      } catch (error) {
        saveStatusRef.current = "error";
        setSaveStatus("error");
        throw error;
      } finally {
        savePromiseRef.current = null;
      }
    },
    [refreshDesigns],
  );

  const commands = useMemo(
    () => ({
      current: {
        getState: () => ({
          designId: designIdRef.current,
          name: designNameRef.current,
          saveStatus: saveStatusRef.current,
          selectedPartId: selectedPartIdRef.current,
          parts: partsRef.current,
          camera: cameraRef.current,
        }),
        addShape,
        updatePart,
        removePart,
        selectPart,
        setCamera,
        newDesign,
        saveDesign,
        listDesigns: refreshDesigns,
        loadDesign,
      } satisfies EditorCommands,
    }),
    [
      addShape,
      loadDesign,
      newDesign,
      refreshDesigns,
      removePart,
      saveDesign,
      selectPart,
      setCamera,
      updatePart,
    ],
  );

  const webMcpStatus = useWebMcp(commands);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const [session, savedDesigns] = await Promise.all([
          api.getSession(),
          api.listDesigns(),
        ]);
        if (!active) return;
        setUser(session);
        setDesigns(savedDesigns);

        const latestDesign = savedDesigns[0];
        if (!latestDesign) return;
        try {
          const saved = await api.getDesign(latestDesign.id);
          if (active) applySavedDesign(saved);
        } catch (error) {
          if (active) setNotice(errorMessage(error));
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else {
          setUser(null);
          setNotice(errorMessage(error));
        }
      }
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [applySavedDesign]);

  useEffect(() => {
    if (!user) return;
    let refreshing = false;

    const refreshWhenActive = () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      void refreshDesigns()
        .catch((error: unknown) => setNotice(errorMessage(error)))
        .finally(() => {
          refreshing = false;
        });
    };

    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refreshDesigns, user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDesign().catch((error) => setNotice(errorMessage(error)));
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedPartIdRef.current) {
        event.preventDefault();
        removePart(selectedPartIdRef.current);
        return;
      }
      if (event.key.toLowerCase() === "g") setTransformMode("translate");
      if (event.key.toLowerCase() === "r") setTransformMode("rotate");
      if (event.key.toLowerCase() === "s" && !event.metaKey && !event.ctrlKey) {
        setTransformMode("scale");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removePart, saveDesign]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3_200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedPart = useMemo(
    () => parts.find((part) => part.id === selectedPartId) ?? null,
    [parts, selectedPartId],
  );

  if (user === null) {
    return <AuthenticationScreen notice={notice} />;
  }

  return (
    <main className="app-shell">
      <header className="command-header">
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">SW</span>
          <div>
            <strong>SHIPWRIGHT</strong>
            <small>HOLOGRAPHIC ASSEMBLY FRAME</small>
          </div>
        </div>

        <div className="design-controls">
          <label className="design-name-field">
            <span className="sr-only">Design name</span>
            <input
              aria-label="Design name"
              value={designName}
              maxLength={80}
              onChange={(event) => {
                designNameRef.current = event.target.value;
                setDesignName(event.target.value);
                markDirty();
              }}
            />
          </label>
          <select
            aria-label="Open saved design"
            title="Open saved design"
            value={designId ?? ""}
            onChange={(event) => {
              if (!event.target.value) return;
              void loadDesign(event.target.value).catch((error) =>
                setNotice(errorMessage(error)),
              );
            }}
          >
            <option value="">OPEN SAVED...</option>
            {designs.map((design) => (
              <option key={design.id} value={design.id}>
                {design.name} · {design.partCount} PARTS
              </option>
            ))}
          </select>
          <button className="button button-quiet" type="button" onClick={() => newDesign()}>
            NEW
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={saveStatus === "saving" || user === undefined}
            onClick={() =>
              void saveDesign().catch((error) => setNotice(errorMessage(error)))
            }
          >
            {saveStatus === "saving" ? "SAVING" : "SAVE SHIP"}
          </button>
        </div>

        <div className="header-status">
          <StatusLamp
            label={user?.isLocalDev ? "LOCAL CAPTAIN" : user?.displayName ?? "AUTH CHECK"}
            tone={user ? "green" : "amber"}
          />
          <StatusLamp
            label={webMcpLabel(webMcpStatus)}
            tone={webMcpStatus === "ready" ? "green" : "amber"}
          />
        </div>
      </header>

      <aside className="tool-rail" aria-label="Part tools">
        <div className="panel-heading">
          <span>PART BAY</span>
          <b>{String(parts.length).padStart(2, "0")}</b>
        </div>
        <p className="rail-label">ADD GEOMETRY</p>
        <div className="shape-tools">
          {SHAPE_TYPES.map((type, index) => (
            <button
              key={type}
              className="shape-button"
              type="button"
              data-shape={type}
              aria-label={`Add ${type}`}
              onClick={() => addShape(type)}
            >
              <span className="shape-glyph" aria-hidden="true">
                <i />
              </span>
              <span>{SHAPE_LABELS[type]}</span>
              <small>0{index + 1}</small>
            </button>
          ))}
        </div>

        <div className="component-list-heading">
          <span>ASSEMBLY</span>
          <button
            type="button"
            aria-label="Delete selected part"
            disabled={!selectedPart}
            onClick={() => selectedPart && removePart(selectedPart.id)}
          >
            DEL
          </button>
        </div>
        <div className="component-list" role="group" aria-label="Ship parts">
          {parts.length === 0 ? (
            <p>NO PARTS IN FRAME</p>
          ) : (
            parts.map((part, index) => (
              <button
                type="button"
                key={part.id}
                className={part.id === selectedPartId ? "active" : ""}
                onClick={() => selectPart(part.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{part.name}</strong>
                  <small>{part.type}</small>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="viewport-panel" aria-label="Ship editor viewport">
        <div className="viewport-frame">
          <Suspense
            fallback={
              <div className="canvas-loading" role="status">
                CALIBRATING PROJECTION
              </div>
            }
          >
            <ShipCanvas
              parts={parts}
              selectedPartId={selectedPartId}
              transformMode={transformMode}
              camera={camera}
              cameraRevision={cameraRevision}
              onSelectPart={selectPart}
              onTransformPart={updatePart}
              onCameraChange={setCameraFromCanvas}
            />
          </Suspense>
          {parts.length === 0 && (
            <div className="empty-frame">
              <span>FRAME EMPTY</span>
              <p>Add a polygonal part from the part bay.</p>
            </div>
          )}
          <div className="reticle" aria-hidden="true"><i /></div>
          <div className="viewport-label viewport-label-bottom">
            <span>LMB ORBIT · RMB PAN · WHEEL ZOOM</span>
            <span>{saveStatusLabel(saveStatus)}</span>
          </div>
          <div className="scanlines" aria-hidden="true" />
        </div>
      </section>

      <aside className="inspector" aria-label="Part inspector">
        <div className="panel-heading">
          <span>INSPECTOR</span>
          <b>{selectedPart ? "LIVE" : "IDLE"}</b>
        </div>

        <div className="transform-modes" role="group" aria-label="Transform mode">
          {(["translate", "rotate", "scale"] as TransformMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={transformMode === mode ? "active" : ""}
              aria-pressed={transformMode === mode}
              onClick={() => setTransformMode(mode)}
            >
              <span>{mode === "translate" ? "G" : mode === "rotate" ? "R" : "S"}</span>
              {mode}
            </button>
          ))}
        </div>

        {selectedPart ? (
          <PartInspector
            part={selectedPart}
            onUpdate={(patch) => updatePart(selectedPart.id, patch)}
            onDelete={() => removePart(selectedPart.id)}
          />
        ) : (
          <div className="inspector-empty">
            <span className="selection-box" aria-hidden="true" />
            <strong>NO PART SELECTED</strong>
            <p>Select a part in the viewport or assembly list.</p>
          </div>
        )}

        <div className="camera-readout">
          <div className="readout-heading">
            <span>CAMERA VECTOR</span>
            <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>RESET</button>
          </div>
          <code>
            X {formatNumber(camera.position[0])} Y {formatNumber(camera.position[1])} Z{" "}
            {formatNumber(camera.position[2])}
          </code>
          <small>TARGET {camera.target.map(formatNumber).join(" / ")}</small>
        </div>

      </aside>

      {notice && <div className="notice" role="status">{notice}</div>}
    </main>
  );
}

function PartInspector({
  part,
  onUpdate,
  onDelete,
}: {
  part: ShipPart;
  onUpdate: (
    patch: Partial<Pick<ShipPart, "name" | "color" | "position" | "rotation" | "scale">>,
  ) => void;
  onDelete: () => void;
}) {
  return (
    <div className="part-inspector">
      <label className="part-name-input">
        <span>PART NAME</span>
        <input
          value={part.name}
          maxLength={80}
          onChange={(event) => onUpdate({ name: event.target.value })}
        />
      </label>
      <div className="part-id">ID {part.id.slice(0, 13).toUpperCase()}</div>

      <VectorField
        label="POSITION"
        value={part.position}
        step={0.25}
        onChange={(position) => onUpdate({ position })}
      />
      <VectorField
        label="ROTATION"
        value={part.rotation.map((value) => (value * 180) / Math.PI) as Vector3Tuple}
        step={15}
        suffix="°"
        onChange={(degrees) =>
          onUpdate({
            rotation: degrees.map((value) => (value * Math.PI) / 180) as Vector3Tuple,
          })
        }
      />
      <VectorField
        label="SCALE"
        value={part.scale}
        step={0.1}
        minimum={0.01}
        onChange={(scale) => onUpdate({ scale })}
      />

      <label className="color-field">
        <span>MATERIAL GLOW</span>
        <div>
          <input
            type="color"
            value={part.color}
            onChange={(event) => onUpdate({ color: event.target.value })}
          />
          <code>{part.color.toUpperCase()}</code>
        </div>
      </label>
      <button className="delete-part" type="button" onClick={onDelete}>
        REMOVE PART
      </button>
    </div>
  );
}

function VectorField({
  label,
  value,
  step,
  minimum,
  suffix = "",
  onChange,
}: {
  label: string;
  value: Vector3Tuple;
  step: number;
  minimum?: number;
  suffix?: string;
  onChange: (value: Vector3Tuple) => void;
}) {
  const axes = ["X", "Y", "Z"] as const;
  return (
    <fieldset className="vector-field">
      <legend>{label}</legend>
      <div>
        {axes.map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              aria-label={`${label.toLowerCase()} ${axis.toLowerCase()}`}
              type="number"
              value={roundForInput(value[index])}
              min={minimum}
              step={step}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const next = [...value] as Vector3Tuple;
                const numeric = event.target.valueAsNumber;
                if (!Number.isFinite(numeric)) return;
                next[index] = minimum === undefined ? numeric : Math.max(minimum, numeric);
                onChange(next);
              }}
            />
            {suffix && <i>{suffix}</i>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StatusLamp({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber";
}) {
  return (
    <span className={`status-lamp ${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function AuthenticationScreen({ notice }: { notice: string | null }) {
  return (
    <main className="auth-screen">
      <div className="auth-grid" aria-hidden="true" />
      <section>
        <span className="auth-mark">SW</span>
        <h1>SHIPWRIGHT</h1>
        <p>Your shipyard is linked to your ChatGPT identity.</p>
        <a href="/signin-with-chatgpt?return_to=%2F">SIGN IN WITH CHATGPT</a>
        {notice && <small>{notice}</small>}
      </section>
    </main>
  );
}

function webMcpLabel(status: WebMcpStatus): string {
  if (status === "ready") return "WEBMCP LINKED";
  if (status === "error") return "WEBMCP ERROR";
  return "WEBMCP STANDBY";
}

function saveStatusLabel(status: SaveStatus): string {
  const labels: Record<SaveStatus, string> = {
    idle: "FRAME READY",
    dirty: "UNSAVED CHANGES",
    saving: "WRITING TO D1",
    saved: "DESIGN SECURED",
    error: "SAVE FAULT",
  };
  return labels[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected fault occurred.";
}

function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "0";
  return `${sign}${Math.abs(value).toFixed(2).padStart(5, "0")}`;
}

function roundForInput(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
