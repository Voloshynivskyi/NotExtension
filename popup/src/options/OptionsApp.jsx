import React from "react";
import { useSettings } from "../hooks/useSettings";

import { SettingsLayout } from "./components/SettingsLayout";

import { GeneralPage } from "./pages/GeneralPage";
import { BadgePage } from "./pages/BadgePage";
import { HighlightsPage } from "./pages/HighlightsPage";
import { PinsPage } from "./pages/PinsPage";
import { ShortcutsPage } from "./pages/ShortcutsPage";
import { DataPage } from "./pages/DataPage";
import { AboutPage } from "./pages/AboutPage";

import { useHashRoute } from "./utils/route";

const NAV = [
  { key: "general", label: "General" },
  { key: "badge", label: "Badge & UI" },
  { key: "highlights", label: "Highlights" },
  { key: "pins", label: "Pins" },
  { key: "shortcuts", label: "Shortcuts" },
  { key: "data", label: "Data & Privacy" },
  { key: "about", label: "About" },
];

export default function OptionsApp() {
  const settings = useSettings();
  const route = useHashRoute({
    defaultKey: "general",
    allowedKeys: NAV.map((n) => n.key),
  });

  React.useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const common = { settings, routeKey: route.key };

  return (
    <SettingsLayout
      title="NotExtension"
      subtitle="Settings"
      nav={NAV}
      activeKey={route.key}
      onNavigate={route.setKey}
      loading={!settings.loaded}
    >
      {route.key === "general" && <GeneralPage {...common} />}
      {route.key === "badge" && <BadgePage {...common} />}
      {route.key === "highlights" && <HighlightsPage {...common} />}
      {route.key === "pins" && <PinsPage {...common} />}
      {route.key === "shortcuts" && <ShortcutsPage {...common} />}
      {route.key === "data" && <DataPage {...common} />}
      {route.key === "about" && <AboutPage {...common} />}
    </SettingsLayout>
  );
}
