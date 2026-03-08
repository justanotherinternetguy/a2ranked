import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SEALS, TIERS } from "../data/seals";
import TierRow from "./TierRow";
import SealCard from "./SealCard";

function findContainer(items, id) {
  if (id in items) return id;
  return Object.keys(items).find((key) => items[key].includes(id));
}

const STORAGE_KEY = "university-tierlist-v1";

// --- URL hash encoding ---
// Format: #S=0,5,12&A=3,7&B=&C=1,2&D=&F=4  (seal indices per tier)
const SEAL_BY_INDEX = SEALS; // array, indexed 0..n
const SEAL_TO_INDEX = Object.fromEntries(SEALS.map((s, i) => [s.id, i]));

function stateToHash(items) {
  const parts = TIERS.map((tier) => {
    const indices = items[tier]
      .map((id) => SEAL_TO_INDEX[id])
      .filter((i) => i !== undefined);
    return `${tier}=${indices.join(",")}`;
  });
  return "#" + parts.join("&");
}

function hashToState(hash) {
  if (!hash || hash.length < 2) return null;
  try {
    const params = new URLSearchParams(hash.slice(1));
    const state = { pool: [], S: [], A: [], B: [], C: [], D: [], F: [] };
    const ranked = new Set();
    for (const tier of TIERS) {
      const val = params.get(tier);
      if (val) {
        const indices = val
          .split(",")
          .map(Number)
          .filter((n) => !isNaN(n) && n >= 0 && n < SEAL_BY_INDEX.length);
        state[tier] = indices.map((i) => SEAL_BY_INDEX[i].id);
        indices.forEach((i) => ranked.add(i));
      }
    }
    state.pool = SEALS.filter((_, i) => !ranked.has(i)).map((s) => s.id);
    return state;
  } catch {
    return null;
  }
}

// --- localStorage ---
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const allIds = new Set(SEALS.map((s) => s.id));
      const savedIds = new Set(Object.values(parsed).flat());
      const missing = [...allIds].filter((id) => !savedIds.has(id));
      if (missing.length > 0) parsed.pool = [...parsed.pool, ...missing];
      return parsed;
    }
  } catch {}
  return null;
}

function buildInitialState() {
  return {
    pool: SEALS.map((s) => s.id),
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
    F: [],
  };
}

export default function TierList() {
  const [items, setItems] = useState(() => {
    // URL hash takes priority (shared link), then localStorage, then default
    const hashState = hashToState(window.location.hash);
    if (hashState) return hashState;
    return loadState() ?? buildInitialState();
  });
  const [activeId, setActiveId] = useState(null);
  const [copyLabel, setCopyLabel] = useState("Copy Link");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.history.replaceState(null, "", stateToHash(state));
    } catch {}
  }

  function handleDragStart({ active }) {
    setActiveId(active.id);
  }

  function handleDragOver({ active, over }) {
    if (!over) return;

    const activeContainer = findContainer(items, active.id);
    const overContainer = findContainer(items, over.id) ?? over.id;

    if (!activeContainer || !overContainer || activeContainer === overContainer)
      return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const overIndex = overItems.indexOf(over.id);

      const newIndex =
        over.id in prev ? overItems.length : Math.max(0, overIndex);

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== active.id),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          active.id,
          ...overItems.slice(newIndex),
        ],
      };
    });
  }

  function handleDragEnd({ active, over }) {
    const activeContainer = findContainer(items, active.id);

    if (!activeContainer) {
      setActiveId(null);
      return;
    }

    if (over) {
      const overContainer = findContainer(items, over.id) ?? over.id;

      if (activeContainer === overContainer) {
        const activeIndex = items[activeContainer].indexOf(active.id);
        const overIndex = items[activeContainer].indexOf(over.id);

        if (activeIndex !== overIndex) {
          setItems((prev) => {
            const next = {
              ...prev,
              [activeContainer]: arrayMove(
                prev[activeContainer],
                activeIndex,
                overIndex,
              ),
            };
            saveState(next);
            return next;
          });
          setActiveId(null);
          return;
        }
      }
    }

    saveState(items);
    setActiveId(null);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleReset() {
    const fresh = buildInitialState();
    setItems(fresh);
    localStorage.removeItem(STORAGE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
  }

  function handleCopyLink() {
    const hash = stateToHash(items);
    const url = window.location.origin + window.location.pathname + hash;
    navigator.clipboard.writeText(url).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy Link"), 2000);
    });
  }

  const activeSeal = activeId ? SEALS.find((s) => s.id === activeId) : null;
  const ranked = TIERS.reduce((n, t) => n + items[t].length, 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const pointer = pointerWithin(args);
        return pointer.length > 0 ? pointer : rectIntersection(args);
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="tierlist">
        <header className="tierlist-header">
          <div className="header-left">
            <h1>University Seal Tier List</h1>
            <span className="ranked-count">
              {ranked} / {SEALS.length} ranked
            </span>
          </div>
          <div className="header-actions">
            <button className="copy-btn" onClick={handleCopyLink}>
              {copyLabel}
            </button>
            <button className="reset-btn" onClick={handleReset}>
              Reset
            </button>
          </div>
        </header>

        <div className="tiers-container">
          {TIERS.map((tier) => (
            <TierRow key={tier} tier={tier} items={items[tier]} seals={SEALS} />
          ))}
        </div>

        <TierRow tier="pool" items={items.pool} seals={SEALS} isPool />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeSeal ? <SealCard seal={activeSeal} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
