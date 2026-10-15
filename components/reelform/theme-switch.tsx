"use client";

import { Moon, Sun } from "lucide-react";

/** System appearance is the default; an explicit choice lasts for this visit. */
export default function ThemeSwitch() {
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label="Toggle light and dark appearance"
      title="Toggle light and dark appearance"
      onClick={() => {
        const root = document.documentElement;
        root.dataset.theme = getComputedStyle(root).colorScheme === "dark" ? "light" : "dark";
      }}
    >
      <Sun size={17} className="theme-sun" aria-hidden="true" />
      <Moon size={17} className="theme-moon" aria-hidden="true" />
    </button>
  );
}
