import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle color theme"
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center
        text-ink/50 hover:text-ink hover:bg-black/5 active:scale-95
        dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10
        transition-all duration-200 ${className}`}
    >
      <span className="relative w-[17px] h-[17px]">
        <Sun
          size={17}
          className={`absolute inset-0 transition-all duration-300 ${
            isDark ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
          }`}
        />
        <Moon
          size={17}
          className={`absolute inset-0 transition-all duration-300 ${
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"
          }`}
        />
      </span>
    </button>
  );
}