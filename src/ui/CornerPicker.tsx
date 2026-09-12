import { CORNERS, CORNER_IDS } from "../track/cornerData";
import { useSim } from "../state/store";

/** Two-button segmented control that switches the selected Spa corner. */
export default function CornerPicker() {
  const cornerId = useSim((s) => s.cornerId);
  const setCorner = useSim((s) => s.setCorner);

  return (
    <div className="segmented" role="tablist" aria-label="Corner">
      {CORNER_IDS.map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={id === cornerId}
          className={id === cornerId ? "active" : ""}
          onClick={() => setCorner(id)}
        >
          {CORNERS[id].shortName}
        </button>
      ))}
    </div>
  );
}
