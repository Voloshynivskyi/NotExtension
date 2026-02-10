import React from "react";
import "./StatusComponent.css";

/**
 * state:
 * "loading" | "ready" | "unsaved" | "saving" | "deleting" | "deleted" | "error"
 */
export function StatusComponent({ state, label }) {
  const text =
    label ??
    ({
      loading: "Loading",
      ready: "Ready",
      unsaved: "Unsaved",
      saving: "Saving",
      deleting: "Deleting",
      deleted: "Deleted",
      error: "Error",
    }[state] ||
      "");

  return (
    <div className={`neMiniStatus neMiniStatus--${state}`} title={text}>
      <span className="neMiniIcon" aria-hidden="true">
        {state === "loading" && <Spinner />}
        {state === "ready" && <Dot />}
        {state === "unsaved" && <Dot />}
        {state === "error" && <Dot />}
        {state === "saving" && <SavingPulse />}
        {state === "deleting" && <TrashLid />}
        {state === "deleted" && <Check />}
      </span>

      <span className="neMiniText">{text}</span>
    </div>
  );
}

function Dot() {
  return <span className="neMiniDot" />;
}

function Spinner() {
  return <span className="neMiniSpinner" />;
}

// Saving: маленький “пульс/хвиля”, виглядає краще ніж велика іконка
function SavingPulse() {
  return <span className="neMiniPulse" />;
}

// Deleting: мінімальна анімація “кришки”
function TrashLid() {
  return <span className="neMiniTrash" />;
}

// Deleted: маленька галочка
function Check() {
  return <span className="neMiniCheck" />;
}
