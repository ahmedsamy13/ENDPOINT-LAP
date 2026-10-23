import { useState } from "react";
import { Modal } from "./Modals";
import { useInteraction, type Interaction } from "../lib/interactions";
function Prompt({ item }: { item: Interaction }) {
  const [value, setValue] = useState(item.input ?? "");
  const finish = useInteraction((s) => s.finish);
  return (
    <Modal title={item.title} onClose={() => finish(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish(item.input === undefined ? "confirm" : value.trim());
        }}
      >
        <div className="modal-body">
          {item.description && (
            <p className="interaction-description">{item.description}</p>
          )}
          {item.input !== undefined && (
            <label className="form-field">
              <span>Name</span>
              <input
                autoFocus
                aria-label="Name"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={300}
              />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => finish(null)}
          >
            Cancel
          </button>
          <button
            className={`primary-button ${item.destructive ? "destructive-button" : ""}`}
            disabled={item.input !== undefined && !value.trim()}
            type="submit"
          >
            {item.submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function InteractionDialog() {
  const item = useInteraction((s) => s.current);
  return item ? (
    <Prompt key={item.title + item.description + item.input} item={item} />
  ) : null;
}
