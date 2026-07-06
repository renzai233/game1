import type { BackendRequest, BackendRequestInput, BackendResponse } from "./config";
import { SdkError, type SdkErrorCode } from "./errors";

export interface FetchBackendRequestOptions {
  readonly unavailableCode: SdkErrorCode;
  readonly unavailableMessage: string;
  readonly moduleName: string;
}

export function createFetchBackendRequest(options: FetchBackendRequestOptions): BackendRequest {
  return async (input: BackendRequestInput): Promise<BackendResponse> => {
    if (typeof globalThis.fetch !== "function") {
      throw new SdkError(options.unavailableCode, options.unavailableMessage, {
        moduleName: options.moduleName,
      });
    }

    const controller =
      input.timeoutMs === undefined || input.timeoutMs <= 0 ? undefined : new AbortController();
    const timeout =
      controller === undefined
        ? undefined
        : setTimeout(() => {
            controller.abort();
          }, input.timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: input.method,
        ...(input.headers === undefined ? {} : { headers: input.headers }),
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        ...(controller === undefined ? {} : { signal: controller.signal }),
      };
      const response = await globalThis.fetch(input.url, requestInit);
      const text = await response.text();
      const body = parseJson(text);
      return {
        status: response.status,
        ...(body === undefined ? {} : { body }),
        ...(text.length === 0 ? {} : { text }),
      };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  };
}

export function resolveBackendUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/u, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
