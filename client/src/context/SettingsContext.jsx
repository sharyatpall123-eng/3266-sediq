import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SettingsContext = createContext(null);

const initialSettings = {
  theme: localStorage.getItem("wms_theme") || "light",
  language: localStorage.getItem("wms_language") || "ps",
  currency: localStorage.getItem("wms_currency") || "AFN",
  dateFormat: localStorage.getItem("wms_date_format") || "yyyy-MM-dd",
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    document.documentElement.dir = ["ps", "fa"].includes(settings.language) ? "rtl" : "ltr";
    document.documentElement.lang = settings.language;
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    localStorage.setItem("wms_theme", settings.theme);
    localStorage.setItem("wms_language", settings.language);
    localStorage.setItem("wms_currency", settings.currency);
    localStorage.setItem("wms_date_format", settings.dateFormat);
  }, [settings]);

  const updateSettings = (patch) => setSettings((current) => ({ ...current, ...patch }));

  const value = useMemo(() => ({ settings, updateSettings }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider.");
  return context;
}
