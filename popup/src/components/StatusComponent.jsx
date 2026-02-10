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

// Saving: a small pulse looks better than a large icon.
function SavingPulse() {
  return <span className="neMiniPulse" />;
}

// Deleting: minimal "lid" animation.
function TrashLid() {
  return <span className="neMiniTrash" />;
}

// Deleted: small checkmark.
function Check() {
  return <span className="neMiniCheck" />;
}
