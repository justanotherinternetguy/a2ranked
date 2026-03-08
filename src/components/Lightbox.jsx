import { useEffect } from "react";

export default function Lightbox({ seal, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!seal) return null;

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
        <button
          className="lightbox__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className="lightbox__frame">
          <img
            src={`/seals/${seal.file.replace(/ /g, "%20")}`}
            alt={seal.name}
          />
        </div>
        <div className="lightbox__caption">{seal.name}</div>
      </div>
    </div>
  );
}
