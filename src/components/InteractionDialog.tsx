import { useState } from "react";
import { Modal } from "./Modals";
import { useInteraction, type Interaction } from "../lib/interactions";
function Prompt({ item }: { item: Interaction }) {
  const [value, setValue] = useState(item.input ?? "");
  const finish = useInteraction((s) => s.finish);
  const submit = useInteraction((s) => s.submit);
  const busy = useInteraction((s) => s.busy);
  const error = useInteraction((s) => s.error);
  return (
    <Modal title={item.title} busy={busy} onClose={() => finish(null)}>
      <form
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.nativeEvent.isComposing)
            e.preventDefault();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(item.input === undefined ? "confirm" : value.trim());
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
                onFocus={(e) => e.currentTarget.select()}
                disabled={busy}
                aria-label="Name"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={300}
              />
            </label>
          )}
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => finish(null)}
          >
            Cancel
          </button>
          <button
            className={`primary-button ${item.destructive ? "destructive-button" : ""}`}
            disabled={busy || (item.input !== undefined && !value.trim())}
            type="submit"
          >
            {busy ? "Saving…" : item.submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function InteractionDialog() {
  const item = useInteraction((s) => s.current);
  return item ? <Prompt key={item.id} item={item} /> : null;
}
