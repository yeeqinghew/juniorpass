import { useEffect } from "react";

const REPEAT_CLICK_WINDOW_MS = 750;
const BUTTON_SELECTOR =
  'button, input[type="button"], input[type="submit"], [role="button"]';

const getButtonTarget = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>(BUTTON_SELECTOR) : null;

/**
 * Prevents an accidental second activation from reaching React handlers.
 * Async controls remain responsible for their own longer loading/disabled state.
 */
const ButtonClickGuard = () => {
  useEffect(() => {
    const lastActivation = new WeakMap<HTMLElement, number>();

    const preventRapidRepeat = (event: MouseEvent) => {
      const button = getButtonTarget(event.target);
      if (!button || button.matches(":disabled, [aria-disabled='true']")) return;

      const now = Date.now();
      const previousActivation = lastActivation.get(button);
      if (
        previousActivation !== undefined &&
        now - previousActivation < REPEAT_CLICK_WINDOW_MS
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      lastActivation.set(button, now);
    };

    document.addEventListener("click", preventRapidRepeat, true);
    return () => document.removeEventListener("click", preventRapidRepeat, true);
  }, []);

  return null;
};

export default ButtonClickGuard;
