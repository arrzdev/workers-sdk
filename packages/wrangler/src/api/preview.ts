import cfetch from "../fetchwithauthandloginifrequired";
import { fetchJson } from "../util/fetch";
import { toFormData } from "./form_data";
import type { CfAccount, CfWorkerInit } from "./worker";

/**
 * A preview mode.
 *
 * * If true, then using a `workers.dev` subdomain.
 * * Otherwise, a list of routes under a single zone.
 */
export type CfPreviewMode = { workers_dev: boolean } | { routes: string[] };

/**
 * A preview token.
 */
export interface CfPreviewToken {
  /**
   * The header value required to trigger a preview.
   *
   * @example
   * const headers = { 'cf-workers-preview-token': value }
   * const response = await fetch('https://' + host, { headers })
   */
  value: string;
  /**
   * The host where the preview is available.
   */
  host: string;
  /**
   * A websocket url to a DevTools inspector.
   *
   * Workers does not have a fully-featured implementation
   * of the Chrome DevTools protocol, but supports the following:
   *  * `console.log()` output.
   *  * `Error` stack traces.
   *  * `fetch()` events.
   *
   * There is no support for breakpoints, but we want to implement
   * this eventually.
   *
   * @link https://chromedevtools.github.io/devtools-protocol/
   */
  inspectorUrl: URL;
  /**
   * A url to prewarm the preview session.
   *
   * @example
   * fetch(prewarmUrl, { method: 'POST' })
   */
  prewarmUrl: URL;
}

/**
 * Generates a preview session token.
 */
async function sessionToken(account: CfAccount): Promise<CfPreviewToken> {
  const { accountId, zoneId } = account;
  const initUrl = zoneId
    ? `/zones/${zoneId}/workers/edge-preview`
    : `/accounts/${accountId}/workers/subdomain/edge-preview`;

  // @ts-expect-error TODO: fix this
  const { exchange_url: tokenUrl } = await cfetch(initUrl);
  const { inspector_websocket: url, token } = await fetchJson()(tokenUrl);
  const { host } = new URL(url);
  const query = `cf_workers_preview_token=${token}`;

  return {
    value: token,
    host,
    inspectorUrl: new URL(`${url}?${query}`),
    prewarmUrl: new URL(
      `https://${host}/cdn-cgi/workers/preview/prewarm?${query}`
    ),
  };
}

// Credit: https://stackoverflow.com/a/2117523
function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a preview token.
 */
export async function previewToken(
  account: CfAccount,
  worker: CfWorkerInit
): Promise<CfPreviewToken> {
  const { value, host, inspectorUrl, prewarmUrl } = await sessionToken(account);

  const { accountId, zoneId } = account;
  const scriptId = zoneId ? randomId() : host.split(".")[0];
  const url = `/accounts/${accountId}/workers/scripts/${scriptId}/edge-preview`;

  const mode = zoneId ? { routes: ["*/*"] } : { workers_dev: true };
  const formData = toFormData(worker);
  formData.set("wrangler-session-config", JSON.stringify(mode));
  const init = {
    method: "POST",
    body: formData,
    headers: {
      "cf-preview-upload-config-token": value,
    },
  };

  // @ts-expect-error TODO: fix this
  const { preview_token: token } = await cfetch(url, init);
  return {
    value: token,
    host,
    inspectorUrl,
    prewarmUrl,
  };
}