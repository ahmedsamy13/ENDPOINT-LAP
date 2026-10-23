import { Plus, Trash2, LockKeyhole } from "lucide-react";
import { pair, type Pair } from "../lib/types";
export default function Fields({
  rows,
  onChange,
  keys = "Key",
  values = "Value",
  secrets = false,
}: {
  rows: Pair[];
  onChange: (v: Pair[]) => void;
  keys?: string;
  values?: string;
  secrets?: boolean;
}) {
  const update = (i: number, patch: Partial<Pair>) =>
    onChange(rows.map((p, n) => (i === n ? { ...p, ...patch } : p)));
  return (
    <div className="fields">
      <div className="field-heading">
        <span />
        <span>{keys}</span>
        <span>{values}</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div className="field-row" key={i}>
          <input
            aria-label={`Enable ${keys} ${i + 1}`}
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
          />
          <input
            aria-label={`${keys} ${i + 1}`}
            placeholder={keys === "Key" ? "Enter key" : keys}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <div className="field-value">
            <input
              aria-label={`${values} ${i + 1}`}
              type={secrets && row.secret ? "password" : "text"}
              placeholder={
                values === "Value" ? "Enter value or {{variable}}" : values
              }
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            {secrets && (
              <button
                title={row.secret ? "Secret variable" : "Make secret"}
                aria-label={`Toggle secret ${i + 1}`}
                className={row.secret ? "accent" : ""}
                onClick={() => update(i, { secret: !row.secret })}
              >
                <LockKeyhole size={13} />
              </button>
            )}
          </div>
          <button
            className="icon-button"
            aria-label={`Remove ${keys} ${i + 1}`}
            onClick={() => onChange(rows.filter((_, n) => i !== n))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        className="text-button add-row"
        onClick={() => onChange([...rows, pair()])}
      >
        <Plus size={13} /> Add {keys === "Key" ? "row" : keys.toLowerCase()}
      </button>
    </div>
  );
}
