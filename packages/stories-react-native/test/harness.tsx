import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { createMemoryStore } from "@customyai/stories-render";
import { createStoriesClient, type StoriesClient } from "@customyai/stories-render/client";
import { StoriesProvider, type StoriesProviderProps } from "../src/context";
import type { MediaCache } from "../src/media";

export const instantCache = (): MediaCache & { load: ReturnType<typeof vi.fn> } => ({ load: vi.fn(() => Promise.resolve()) });

export function renderWithProvider(ui: ReactElement, props: Partial<StoriesProviderProps> = {}) {
  const mediaCache = props.mediaCache ?? instantCache();
  const view = render(
    <StoriesProvider mediaCache={mediaCache} reducedMotion={false} locale="es" {...props}>
      {ui}
    </StoriesProvider>,
  );
  return { ...view, mediaCache };
}

export function makeClient(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}): StoriesClient {
  return createStoriesClient({ token: async () => "sst", fetch, platform: "ios", locale: "es", sleep: async () => undefined, store: createMemoryStore(), ...extra } as never);
}

export const attr = (el: Element | null, name: string): string | null => el?.getAttribute(name) ?? null;
export const styleOf = (el: Element | null): Record<string, unknown> => JSON.parse(el?.getAttribute("data-style") ?? "{}") as Record<string, unknown>;
