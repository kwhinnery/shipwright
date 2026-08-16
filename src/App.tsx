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
import {
  ClipboardPaste,
  Copy,
  DraftingCompass,
  FileDown,
  FileUp,
  Palette,
  Trash2,
  Undo2,
} from "lucide-react";
import * as api from "./api";
import { ApiError } from "./api";
import {
  readCameraPreference,
  writeCameraPreference,
} from "./cameraPreferences";
import { IconButton } from "./components/IconButton";
import {
  MAX_SHIPWRIGHT_FILE_BYTES,
  createShipwrightDesignFile,
  parseShipwrightDesignFile,
  shipwrightDesignFileName,
} from "./designFormat";
import {
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_CAMERA,
  MATERIAL_TEXTURES,
  SHAPE_FEATURE_BY_TYPE,
  SHAPE_TYPES,
  createPart,
  createStarterParts,
  type CameraState,
  type DesignSummary,
  type SavedDesign,
  type SessionUser,
  type ShapeFeature,
  type ShapeType,
  type ShipPart,
  type ShipPartUpdate,
  type TransformMode,
  type Vector3Tuple,
  type ViewMode,
} from "./types";
import {
  useWebMcp,
  type EditorCommands,
  type WebMcpInvocation,
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
  ramp: "Ramp",
  trapezoid: "Trapezoid",
  "tapered-block": "Tapered block",
  cylinder: "Cylinder",
  sphere: "Sphere",
  cone: "Cone",
};

const TEXTURE_LABELS = {
  smooth: "Smooth",
  brushed: "Brushed metal",
  plated: "Hull plating",
  composite: "Composite weave",
} as const;

type SaveStatus = "dirty" | "saving" | "saved" | "error";
type InspectorTab = "inspector" | "webmcp";

interface EditorSnapshot {
  parts: ShipPart[];
  selectedPartId: string | null;
}

export default function App() {
  const [parts, setParts] = useState<ShipPart[]>(createStarterParts);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");
  const [viewMode, setViewMode] = useState<ViewMode>("solid");
  const [canvasBackground, setCanvasBackgroundState] = useState(
    DEFAULT_CANVAS_BACKGROUND,
  );
  const [camera, setCameraState] = useState<CameraState>(DEFAULT_CAMERA);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [designId, setDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState("Untitled Scout");
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("dirty");
  const [isDeletingDesign, setIsDeletingDesign] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTab>("inspector");
  const [webMcpInvocations, setWebMcpInvocations] = useState<
    WebMcpInvocation[]
  >([]);

  const partsRef = useRef(parts);
  const selectedPartIdRef = useRef(selectedPartId);
  const canvasBackgroundRef = useRef(canvasBackground);
  const cameraRef = useRef(camera);
  const activeCameraDesignIdRef = useRef<string | null>(null);
  const documentGenerationRef = useRef(0);
  const designLoadTokenRef = useRef(0);
  const designIdRef = useRef(designId);
  const designNameRef = useRef(designName);
  const saveStatusRef = useRef(saveStatus);
  const savePromiseRef = useRef<Promise<SavedDesign> | null>(null);
  const savePromiseGenerationRef = useRef<number | null>(null);
  const historyRef = useRef<EditorSnapshot[]>([]);
  const clipboardRef = useRef<ShipPart | null>(null);
  const pasteCountRef = useRef(0);
  const importFileRef = useRef<HTMLInputElement>(null);

  const markDirty = useCallback(() => {
    saveStatusRef.current = "dirty";
    setSaveStatus("dirty");
  }, []);

  const recordHistory = useCallback(() => {
    historyRef.current.push({
      parts: cloneParts(partsRef.current),
      selectedPartId: selectedPartIdRef.current,
    });
    if (historyRef.current.length > 100) historyRef.current.shift();
    setCanUndo(true);
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const replaceParts = useCallback(
    (next: ShipPart[]) => {
      recordHistory();
      partsRef.current = next;
      setParts(next);
      markDirty();
    },
    [markDirty, recordHistory],
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
    (id: string, patch: ShipPartUpdate) => {
      const current = partsRef.current.find((part) => part.id === id);
      if (!current) throw new Error(`Ship part ${id} was not found.`);
      if (patch.features) {
        const supportedFeature = SHAPE_FEATURE_BY_TYPE[current.type];
        const invalidFeature = Object.keys(patch.features).find(
          (feature) => feature !== supportedFeature,
        );
        if (invalidFeature) {
          throw new Error(
            `${current.type} parts do not support ${invalidFeature}.`,
          );
        }
      }
      const updated = {
        ...current,
        ...patch,
        ...(patch.features
          ? { features: { ...current.features, ...patch.features } }
          : {}),
      };
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

  const copySelectedPart = useCallback(() => {
    const id = selectedPartIdRef.current;
    const part = partsRef.current.find((candidate) => candidate.id === id);
    if (!part) throw new Error("Select a component before copying it.");
    clipboardRef.current = clonePart(part);
    pasteCountRef.current = 0;
    setCanPaste(true);
    setNotice(`Copied ${part.name}.`);
    return { copiedPartId: part.id };
  }, []);

  const pastePart = useCallback(() => {
    const source = clipboardRef.current;
    if (!source) throw new Error("Copy a component before pasting it.");
    if (partsRef.current.length >= 100) {
      throw new Error("A design can contain at most 100 parts.");
    }

    pasteCountRef.current += 1;
    const offset = 0.5 * pasteCountRef.current;
    const part: ShipPart = {
      ...clonePart(source),
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      position: [
        source.position[0] + offset,
        source.position[1] + offset,
        source.position[2] + offset,
      ],
    };
    replaceParts([...partsRef.current, part]);
    selectedPartIdRef.current = part.id;
    setSelectedPartId(part.id);
    setNotice(`Pasted ${part.name}.`);
    return { part, partCount: partsRef.current.length };
  }, [replaceParts]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return { undone: false };

    const restoredParts = cloneParts(snapshot.parts);
    partsRef.current = restoredParts;
    setParts(restoredParts);
    const restoredSelection = restoredParts.some(
      (part) => part.id === snapshot.selectedPartId,
    )
      ? snapshot.selectedPartId
      : null;
    selectedPartIdRef.current = restoredSelection;
    setSelectedPartId(restoredSelection);
    setCanUndo(historyRef.current.length > 0);
    markDirty();
    setNotice("Undid component change.");
    return { undone: true, partCount: restoredParts.length };
  }, [markDirty]);

  const setCamera = useCallback(
    (next: CameraState) => {
      cameraRef.current = next;
      setCameraState(next);
      setCameraRevision((value) => value + 1);
      writeCameraPreference(activeCameraDesignIdRef.current, next);
      markDirty();
      return { camera: next };
    },
    [markDirty],
  );

  const setCameraFromCanvas = useCallback(
    (next: CameraState) => {
      cameraRef.current = next;
      setCameraState(next);
      writeCameraPreference(activeCameraDesignIdRef.current, next);
      markDirty();
    },
    [markDirty],
  );

  const setCanvasBackground = useCallback(
    (color: string) => {
      const normalizedColor = color.toLowerCase();
      canvasBackgroundRef.current = normalizedColor;
      setCanvasBackgroundState(normalizedColor);
      markDirty();
      return { backgroundColor: normalizedColor };
    },
    [markDirty],
  );

  const applySavedDesign = useCallback(
    (saved: SavedDesign) => {
      documentGenerationRef.current += 1;
      activeCameraDesignIdRef.current = null;
      const nextCamera =
        readCameraPreference(saved.id) ?? cloneCamera(saved.data.camera);
      partsRef.current = saved.data.parts;
      setParts(saved.data.parts);
      cameraRef.current = nextCamera;
      setCameraState(nextCamera);
      setCameraRevision((value) => value + 1);
      const savedBackground =
        saved.data.backgroundColor ?? DEFAULT_CANVAS_BACKGROUND;
      canvasBackgroundRef.current = savedBackground;
      setCanvasBackgroundState(savedBackground);
      designIdRef.current = saved.id;
      setDesignId(saved.id);
      activeCameraDesignIdRef.current = saved.id;
      designNameRef.current = saved.name;
      setDesignName(saved.name);
      selectedPartIdRef.current = null;
      setSelectedPartId(null);
      saveStatusRef.current = "saved";
      setSaveStatus("saved");
      clearHistory();
    },
    [clearHistory],
  );

  const refreshDesigns = useCallback(async () => {
    const result = await api.listDesigns();
    setDesigns(result);
    return { designs: result };
  }, []);

  const loadDesign = useCallback(
    async (id: string) => {
      const loadToken = ++designLoadTokenRef.current;
      const saved = await api.getDesign(id);
      if (loadToken !== designLoadTokenRef.current) return saved;
      applySavedDesign(saved);
      setNotice(`Loaded ${saved.name}.`);
      return saved;
    },
    [applySavedDesign],
  );

  const newDesign = useCallback(
    (name = "Untitled Vessel") => {
      designLoadTokenRef.current += 1;
      documentGenerationRef.current += 1;
      activeCameraDesignIdRef.current = null;
      partsRef.current = [];
      setParts([]);
      selectedPartIdRef.current = null;
      setSelectedPartId(null);
      cameraRef.current = DEFAULT_CAMERA;
      setCameraState(DEFAULT_CAMERA);
      setCameraRevision((value) => value + 1);
      canvasBackgroundRef.current = DEFAULT_CANVAS_BACKGROUND;
      setCanvasBackgroundState(DEFAULT_CANVAS_BACKGROUND);
      designIdRef.current = null;
      setDesignId(null);
      designNameRef.current = name.trim() || "Untitled Vessel";
      setDesignName(designNameRef.current);
      saveStatusRef.current = "dirty";
      setSaveStatus("dirty");
      setNotice("New design frame ready.");
      clearHistory();
      return { name: designNameRef.current, parts: [] };
    },
    [clearHistory],
  );

  const saveDesign = useCallback(
    async (requestedName?: string): Promise<SavedDesign> => {
      if (savePromiseRef.current) {
        if (
          savePromiseGenerationRef.current === documentGenerationRef.current
        ) {
          return savePromiseRef.current;
        }
        throw new Error("Wait for the previous design save to finish.");
      }
      const documentGeneration = documentGenerationRef.current;
      const currentDesignId = designIdRef.current;
      const creatingDesign = currentDesignId === null;
      if (creatingDesign) designLoadTokenRef.current += 1;

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
          backgroundColor: canvasBackgroundRef.current,
        },
      };

      const request = currentDesignId
        ? api.updateDesign(currentDesignId, payload)
        : api.createDesign(payload);

      savePromiseRef.current = request;
      savePromiseGenerationRef.current = documentGeneration;
      try {
        const saved = await request;
        if (documentGeneration === documentGenerationRef.current) {
          designIdRef.current = saved.id;
          setDesignId(saved.id);
          activeCameraDesignIdRef.current = saved.id;
          if (creatingDesign) {
            writeCameraPreference(saved.id, cameraRef.current);
          }
          saveStatusRef.current = "saved";
          setSaveStatus("saved");
          setNotice(`Saved ${saved.name}.`);
        }
        await refreshDesigns();
        return saved;
      } catch (error) {
        if (documentGeneration === documentGenerationRef.current) {
          saveStatusRef.current = "error";
          setSaveStatus("error");
        }
        throw error;
      } finally {
        savePromiseRef.current = null;
        savePromiseGenerationRef.current = null;
      }
    },
    [refreshDesigns],
  );

  const deleteDesign = useCallback(async () => {
    const currentDesignId = designIdRef.current;
    if (!currentDesignId) return;
    if (savePromiseRef.current) {
      throw new Error("Wait for the current save to finish before deleting.");
    }

    const currentDesignName = designNameRef.current.trim() || "this design";
    const confirmed = window.confirm(
      `Delete "${currentDesignName}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeletingDesign(true);
    try {
      await api.deleteDesign(currentDesignId);
      setDesigns((current) =>
        current.filter((design) => design.id !== currentDesignId),
      );
      if (designIdRef.current === currentDesignId) {
        newDesign();
        setNotice(`Deleted ${currentDesignName}.`);
      }
    } finally {
      setIsDeletingDesign(false);
    }
  }, [newDesign]);

  const exportDesign = useCallback(
    () =>
      createShipwrightDesignFile(designNameRef.current, {
        version: 1,
        parts: cloneParts(partsRef.current),
        camera: cloneCamera(cameraRef.current),
        backgroundColor: canvasBackgroundRef.current,
      }),
    [],
  );

  const importDesign = useCallback(
    (value: unknown) => {
      if (savePromiseRef.current) {
        throw new Error(
          "Wait for the current save to finish before importing.",
        );
      }

      const imported = parseShipwrightDesignFile(value);
      if (!imported) {
        throw new Error("This is not a valid Shipwright design file.");
      }

      const nextParts = cloneParts(imported.data.parts);
      const nextCamera = cloneCamera(imported.data.camera);
      const nextBackground = (
        imported.data.backgroundColor ?? DEFAULT_CANVAS_BACKGROUND
      ).toLowerCase();

      designLoadTokenRef.current += 1;
      documentGenerationRef.current += 1;
      activeCameraDesignIdRef.current = null;
      partsRef.current = nextParts;
      setParts(nextParts);
      selectedPartIdRef.current = null;
      setSelectedPartId(null);
      cameraRef.current = nextCamera;
      setCameraState(nextCamera);
      setCameraRevision((value) => value + 1);
      canvasBackgroundRef.current = nextBackground;
      setCanvasBackgroundState(nextBackground);
      designIdRef.current = null;
      setDesignId(null);
      designNameRef.current = imported.name;
      setDesignName(imported.name);
      saveStatusRef.current = "dirty";
      setSaveStatus("dirty");
      clearHistory();
      setNotice(`Imported ${imported.name} as a new unsaved design.`);

      return {
        name: imported.name,
        partCount: nextParts.length,
        saveStatus: "dirty" as const,
      };
    },
    [clearHistory],
  );

  const downloadDesign = useCallback(() => {
    try {
      const exported = exportDesign();
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = shipwrightDesignFileName(exported.name);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`Exported ${exported.name}.`);
    } catch (error) {
      setNotice(`Export failed: ${errorMessage(error)}`);
    }
  }, [exportDesign]);

  const readImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      try {
        if (file.size > MAX_SHIPWRIGHT_FILE_BYTES) {
          throw new Error("The design file is larger than 512 KB.");
        }

        const source = await file.text();
        let value: unknown;
        try {
          value = JSON.parse(source) as unknown;
        } catch {
          throw new Error("The selected file does not contain valid JSON.");
        }
        importDesign(value);
      } catch (error) {
        setNotice(`Import failed: ${errorMessage(error)}`);
      }
    },
    [importDesign],
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
          backgroundColor: canvasBackgroundRef.current,
        }),
        addShape,
        updatePart,
        removePart,
        copySelectedPart,
        pastePart,
        undo,
        selectPart,
        setCamera,
        setCanvasBackground,
        newDesign,
        saveDesign,
        exportDesign,
        importDesign,
        listDesigns: refreshDesigns,
        loadDesign,
      } satisfies EditorCommands,
    }),
    [
      addShape,
      copySelectedPart,
      exportDesign,
      importDesign,
      loadDesign,
      newDesign,
      pastePart,
      refreshDesigns,
      removePart,
      saveDesign,
      selectPart,
      setCamera,
      setCanvasBackground,
      updatePart,
      undo,
    ],
  );

  const recordWebMcpInvocation = useCallback(
    (invocation: WebMcpInvocation) => {
      setWebMcpInvocations((current) => [invocation, ...current].slice(0, 100));
    },
    [],
  );

  const webMcpStatus = useWebMcp(commands, recordWebMcpInvocation);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const loadToken = ++designLoadTokenRef.current;
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
          if (active && loadToken === designLoadTokenRef.current) {
            applySavedDesign(saved);
          }
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
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (commandKey && key === "z" && !event.shiftKey) {
        if (historyRef.current.length > 0) {
          event.preventDefault();
          undo();
        }
        return;
      }

      const editingText = target?.matches(
        "input, textarea, select, [contenteditable='true']",
      );
      if (editingText) return;

      if (commandKey && key === "s") {
        event.preventDefault();
        void saveDesign().catch((error) => setNotice(errorMessage(error)));
        return;
      }
      if (commandKey && key === "c") {
        if (!selectedPartIdRef.current) return;
        event.preventDefault();
        copySelectedPart();
        return;
      }
      if (commandKey && key === "v") {
        if (!clipboardRef.current) return;
        event.preventDefault();
        pastePart();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedPartIdRef.current
      ) {
        event.preventDefault();
        removePart(selectedPartIdRef.current);
        return;
      }
      if (key === "g") setTransformMode("translate");
      if (key === "r") setTransformMode("rotate");
      if (key === "s" && !commandKey) {
        setTransformMode("scale");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelectedPart, pastePart, removePart, saveDesign, undo]);

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
          <span className="wordmark-mark" aria-hidden="true">
            <DraftingCompass />
          </span>
          <div>
            <strong>SHIPWRIGHT</strong>
          </div>
        </div>

        <div className="design-controls">
          <label className="design-name-field">
            <span className="sr-only">Design name</span>
            <input
              aria-label="Design name"
              value={designName}
              maxLength={80}
              disabled={isDeletingDesign}
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
            disabled={isDeletingDesign}
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
          <button
            className="button button-quiet"
            type="button"
            disabled={isDeletingDesign}
            onClick={() => newDesign()}
          >
            NEW
          </button>
          <button
            className="button button-danger design-delete-button"
            type="button"
            aria-label="Delete saved design"
            title="Delete saved design"
            disabled={!designId || saveStatus === "saving" || isDeletingDesign}
            onClick={() =>
              void deleteDesign().catch((error) =>
                setNotice(`Delete failed: ${errorMessage(error)}`),
              )
            }
          >
            <Trash2 aria-hidden="true" />
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={
              saveStatus === "saving" || isDeletingDesign || user === undefined
            }
            onClick={() =>
              void saveDesign().catch((error) => setNotice(errorMessage(error)))
            }
          >
            {saveStatus === "saving" ? "SAVING" : "SAVE SHIP"}
          </button>
        </div>

        <div className="header-status">
          <StatusLamp
            label={
              user?.isLocalDev
                ? "LOCAL CAPTAIN"
                : (user?.displayName ?? "AUTH CHECK")
            }
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
              aria-label={`Add ${SHAPE_LABELS[type]}`}
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
                  <small>{SHAPE_LABELS[part.type]}</small>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="viewport-panel" aria-label="Ship editor viewport">
        <div className={`viewport-frame view-${viewMode}`}>
          <div
            className="edit-actions"
            role="group"
            aria-label="Editor actions"
          >
            <IconButton
              icon={Undo2}
              label="Undo component change"
              disabled={!canUndo}
              title="Undo component change (Command/Ctrl+Z)"
              onClick={undo}
            />
            <IconButton
              icon={Copy}
              label="Copy selected component"
              disabled={!selectedPart}
              title="Copy selected component (Command/Ctrl+C)"
              onClick={copySelectedPart}
            />
            <IconButton
              icon={ClipboardPaste}
              label="Paste component"
              disabled={!canPaste || parts.length >= 100}
              title="Paste component (Command/Ctrl+V)"
              onClick={pastePart}
            />
            <IconButton
              icon={FileUp}
              label="Import ship design from JSON"
              disabled={saveStatus === "saving" || user === undefined}
              onClick={() => importFileRef.current?.click()}
            />
            <IconButton
              icon={FileDown}
              label="Export ship design as JSON"
              onClick={downloadDesign}
            />
            <input
              ref={importFileRef}
              className="sr-only"
              type="file"
              accept=".json,.shipwright.json,application/json"
              aria-label="Choose ship design JSON file"
              onChange={(event) => void readImportFile(event)}
            />
          </div>
          <div className="viewport-controls">
            <label
              className="canvas-color-control"
              title={`Canvas background ${canvasBackground.toUpperCase()}`}
            >
              <span aria-hidden="true">
                <Palette size={15} />
              </span>
              <input
                type="color"
                aria-label="Canvas background color"
                value={canvasBackground}
                onChange={(event) => setCanvasBackground(event.target.value)}
              />
            </label>
            <div
              className="view-modes"
              role="group"
              aria-label="Ship view mode"
            >
              {(["skeleton", "solid"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? "active" : ""}
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
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
              backgroundColor={canvasBackground}
              viewMode={viewMode}
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
          <div className="reticle" aria-hidden="true">
            <i />
          </div>
          <div className="viewport-label">
            <span>LMB ORBIT · RMB PAN · WHEEL ZOOM</span>
            <span>{saveStatusLabel(saveStatus)}</span>
          </div>
          <div className="scanlines" aria-hidden="true" />
        </div>
      </section>

      <aside className="inspector" aria-label="Inspector pane">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
          <button
            id="inspector-tab"
            type="button"
            role="tab"
            aria-selected={inspectorTab === "inspector"}
            aria-controls="inspector-panel"
            className={inspectorTab === "inspector" ? "active" : ""}
            onClick={() => setInspectorTab("inspector")}
          >
            INSPECTOR
          </button>
          <button
            id="webmcp-tab"
            type="button"
            role="tab"
            aria-selected={inspectorTab === "webmcp"}
            aria-controls="webmcp-panel"
            className={inspectorTab === "webmcp" ? "active" : ""}
            onClick={() => setInspectorTab("webmcp")}
          >
            WEBMCP LOG
            <b>{webMcpInvocations.length}</b>
          </button>
        </div>

        {inspectorTab === "inspector" ? (
          <div
            id="inspector-panel"
            className="inspector-panel"
            role="tabpanel"
            aria-labelledby="inspector-tab"
          >
            <div
              className="transform-modes"
              role="group"
              aria-label="Transform mode"
            >
              {(["translate", "rotate", "scale"] as TransformMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={transformMode === mode ? "active" : ""}
                    aria-pressed={transformMode === mode}
                    onClick={() => setTransformMode(mode)}
                  >
                    <span>
                      {mode === "translate"
                        ? "G"
                        : mode === "rotate"
                          ? "R"
                          : "S"}
                    </span>
                    {mode}
                  </button>
                ),
              )}
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
                <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)}>
                  RESET
                </button>
              </div>
              <code>
                X {formatNumber(camera.position[0])} Y{" "}
                {formatNumber(camera.position[1])} Z{" "}
                {formatNumber(camera.position[2])}
              </code>
              <small>TARGET {camera.target.map(formatNumber).join(" / ")}</small>
            </div>
          </div>
        ) : (
          <div
            id="webmcp-panel"
            className="inspector-panel webmcp-log"
            role="tabpanel"
            aria-labelledby="webmcp-tab"
          >
            <div className="webmcp-log-heading">
              <span>TOOL INVOCATIONS</span>
              {webMcpInvocations.length > 0 && (
                <button type="button" onClick={() => setWebMcpInvocations([])}>
                  CLEAR
                </button>
              )}
            </div>
            {webMcpInvocations.length === 0 ? (
              <div className="webmcp-log-empty">
                <strong>NO TOOL CALLS</strong>
                <p>WebMCP tool calls will appear here.</p>
              </div>
            ) : (
              <ol>
                {webMcpInvocations.map((invocation) => (
                  <li key={invocation.id}>
                    <div>
                      <code>{invocation.toolName}</code>
                      <time dateTime={new Date(invocation.invokedAt).toISOString()}>
                        {formatInvocationTime(invocation.invokedAt)}
                      </time>
                    </div>
                    <pre>{JSON.stringify(invocation.input, null, 2)}</pre>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </aside>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}

function PartInspector({
  part,
  onUpdate,
  onDelete,
}: {
  part: ShipPart;
  onUpdate: (patch: ShipPartUpdate) => void;
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
        value={
          part.rotation.map((value) => (value * 180) / Math.PI) as Vector3Tuple
        }
        step={15}
        suffix="°"
        onChange={(degrees) =>
          onUpdate({
            rotation: degrees.map(
              (value) => (value * Math.PI) / 180,
            ) as Vector3Tuple,
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

      <ShapeFeatureToggle part={part} onUpdate={onUpdate} />

      <label className="color-field">
        <span>SURFACE COLOR</span>
        <div>
          <input
            type="color"
            value={part.color}
            onChange={(event) => onUpdate({ color: event.target.value })}
          />
          <code>{part.color.toUpperCase()}</code>
        </div>
      </label>
      <label className="texture-field">
        <span>SURFACE TEXTURE</span>
        <select
          value={part.texture ?? "smooth"}
          onChange={(event) =>
            onUpdate({ texture: event.target.value as ShipPart["texture"] })
          }
        >
          {MATERIAL_TEXTURES.map((texture) => (
            <option key={texture} value={texture}>
              {TEXTURE_LABELS[texture]}
            </option>
          ))}
        </select>
      </label>
      <button className="delete-part" type="button" onClick={onDelete}>
        REMOVE PART
      </button>
    </div>
  );
}

const FEATURE_LABELS: Record<ShapeFeature, string> = {
  chamfered: "Chamfered block",
  hollow: "Hollow cylinder",
  truncated: "Conical frustum",
};

function ShapeFeatureToggle({
  part,
  onUpdate,
}: {
  part: ShipPart;
  onUpdate: (patch: ShipPartUpdate) => void;
}) {
  const feature = SHAPE_FEATURE_BY_TYPE[part.type];
  if (!feature) return null;

  return (
    <fieldset className="shape-features">
      <legend>SHAPE FEATURES</legend>
      <label>
        <span>{FEATURE_LABELS[feature]}</span>
        <input
          type="checkbox"
          checked={part.features?.[feature] ?? false}
          onChange={(event) =>
            onUpdate({ features: { [feature]: event.target.checked } })
          }
        />
        <i aria-hidden="true" />
      </label>
    </fieldset>
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
                next[index] =
                  minimum === undefined ? numeric : Math.max(minimum, numeric);
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
        <span className="auth-mark" aria-hidden="true">
          <DraftingCompass />
        </span>
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
    dirty: "UNSAVED CHANGES",
    saving: "WRITING TO D1",
    saved: "DESIGN SECURED",
    error: "SAVE FAULT",
  };
  return labels[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected fault occurred.";
}

function clonePart(part: ShipPart): ShipPart {
  return {
    ...part,
    features: part.features ? { ...part.features } : undefined,
    position: [...part.position],
    rotation: [...part.rotation],
    scale: [...part.scale],
  };
}

function cloneParts(parts: ShipPart[]): ShipPart[] {
  return parts.map(clonePart);
}

function cloneCamera(camera: CameraState): CameraState {
  return {
    position: [...camera.position],
    target: [...camera.target],
  };
}

function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "0";
  return `${sign}${Math.abs(value).toFixed(2).padStart(5, "0")}`;
}

function formatInvocationTime(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function roundForInput(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
