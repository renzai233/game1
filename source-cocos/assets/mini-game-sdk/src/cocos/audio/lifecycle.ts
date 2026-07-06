import type { AudioLifecycleBridge } from "../../audio/service";
import type { Unsubscribe } from "../../core/event-bus";
import { loadDefaultCocosAudioRuntime } from "./runtime";

export function createCocosAudioLifecycleBridge(): AudioLifecycleBridge {
  return {
    install: async (handlers) => {
      const runtime = await loadDefaultCocosAudioRuntime();
      if (!runtime.ok) {
        return [];
      }

      const game = runtime.value.game;
      const hideEvent = game?.EVENT_HIDE;
      const showEvent = game?.EVENT_SHOW;
      if (
        game === undefined ||
        typeof game.on !== "function" ||
        typeof hideEvent !== "string" ||
        typeof showEvent !== "string"
      ) {
        return [];
      }

      const onHide = (): void => handlers.onHide();
      const onShow = (): void => handlers.onShow();
      game.on(hideEvent, onHide);
      game.on(showEvent, onShow);

      const unsubscribers: Unsubscribe[] = [
        () => game.off?.(hideEvent, onHide),
        () => game.off?.(showEvent, onShow),
      ];
      return unsubscribers;
    },
  };
}
