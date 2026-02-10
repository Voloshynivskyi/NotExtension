// popup/src/options/utils/route.js
import React from "react";

function getHashKey() {
  const h = (window.location.hash || "").replace("#", "").trim();
  return h || "";
}

export function useHashRoute({ defaultKey, allowedKeys }) {
  const [key, setKeyState] = React.useState(() => {
    const k = getHashKey();
    return allowedKeys.includes(k) ? k : defaultKey;
  });

  React.useEffect(() => {
    const onHash = () => {
      const k = getHashKey();
      setKeyState(allowedKeys.includes(k) ? k : defaultKey);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [allowedKeys, defaultKey]);

  function setKey(next) {
    const safe = allowedKeys.includes(next) ? next : defaultKey;
    window.location.hash = `#${safe}`;
    setKeyState(safe);
  }

  return { key, setKey };
}
