import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import SealCard from "./SealCard";
import { TIER_COLORS } from "../data/seals";

export default function TierRow({ tier, items, seals, isPool = false }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });

  const tierSeals = items
    .map((id) => seals.find((s) => s.id === id))
    .filter(Boolean);

  const bgColor = isPool ? undefined : TIER_COLORS[tier];

  return (
    <div className={`tier-row${isPool ? " tier-row--pool" : ""}`}>
      {!isPool && (
        <div className="tier-label" style={{ backgroundColor: bgColor }}>
          {tier}
        </div>
      )}
      {isPool && <div className="pool-header">Unranked ({items.length})</div>}
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`tier-items${isOver ? " tier-items--over" : ""}${tierSeals.length === 0 ? " tier-items--empty" : ""}`}
        >
          {tierSeals.map((seal) => (
            <SealCard key={seal.id} seal={seal} />
          ))}
          {tierSeals.length === 0 && !isPool && (
            <span className="tier-empty-hint">Drop seals here</span>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
