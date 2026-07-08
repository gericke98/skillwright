import { redactUrl, scrubSecrets } from "./redact";
import type { CapturedRequest } from "./schema";

/** The subset of a CDP `Network.requestWillBeSent` event we consume. */
export interface CdpRequestEvent {
  request: { method: string; url: string; postData?: string };
  /** CDP resource type, e.g. "XHR", "Fetch", "Document". */
  type?: string;
}

/** Convert a CDP request event into a redacted CapturedRequest stamped with a
 * capture-time (wall-clock) timestamp for later correlation to a step. URL and
 * body are scrubbed of secrets before they land in the recording. */
export function cdpRequestToCaptured(ev: CdpRequestEvent, timestamp: number): CapturedRequest {
  const out: CapturedRequest = {
    method: ev.request.method,
    url: redactUrl(ev.request.url),
    timestamp,
  };
  if (ev.type) out.resourceType = ev.type;
  if (typeof ev.request.postData === "string" && ev.request.postData !== "") {
    out.body = scrubSecrets(ev.request.postData);
  }
  return out;
}

/** Minimal CDP session surface — satisfied by Playwright's CDPSession and by a
 * thin chrome.debugger adapter, so the same capturer works in tests, the CLI,
 * and the extension. */
export interface CdpLike {
  send(method: string, params?: unknown): Promise<unknown>;
  on(event: string, handler: (params: unknown) => void): void;
}

/**
 * Passive network observer (Capture v2): enables the CDP Network domain and
 * collects every request the session fires as a redacted CapturedRequest. It
 * only listens — it never drives the page. Attach it alongside the DOM recorder
 * to get network-level ground truth for effect tagging and parameterization.
 */
export class NetworkCapturer {
  private readonly requests: CapturedRequest[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  async attach(session: CdpLike): Promise<void> {
    await session.send("Network.enable");
    session.on("Network.requestWillBeSent", (params: unknown) => {
      this.requests.push(cdpRequestToCaptured(params as CdpRequestEvent, this.now()));
    });
  }

  /** A copy of the requests observed so far. */
  collected(): CapturedRequest[] {
    return [...this.requests];
  }
}
