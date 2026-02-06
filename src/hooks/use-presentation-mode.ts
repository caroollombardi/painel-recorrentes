import { useState, useEffect, useCallback, useRef } from "react";

const SLIDE_COUNT = 3;
const SLIDE_DURATION_MS = 20_000; // 20 seconds per slide

export function usePresentationMode() {
  const [isActive, setIsActive] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  // Start/stop the auto-cycling interval
  useEffect(() => {
    if (isActive) {
      setCurrentSlide(0);
      intervalRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % SLIDE_COUNT);
      }, SLIDE_DURATION_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive]);

  // Keyboard shortcut: "F" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggle();
      }

      // ESC also exits presentation mode
      if (e.key === "Escape" && isActive) {
        setIsActive(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, isActive]);

  return {
    isActive,
    currentSlide,
    toggle,
    slideCount: SLIDE_COUNT,
  };
}
