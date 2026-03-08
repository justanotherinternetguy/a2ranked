import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SealCard({ seal, overlay = false }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: seal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    cursor: overlay ? "grabbing" : "grab",
    zIndex: overlay ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`seal-card${overlay ? " seal-card--overlay" : ""}`}
      title={seal.name}
      {...attributes}
      {...listeners}
    >
      <img
        src={`/seals/${seal.file.replace(/ /g, '%20')}`}
        alt={seal.name}
        loading="lazy"
        draggable={false}
      />
      <span className="seal-tooltip">{seal.name}</span>
    </div>
  );
}
