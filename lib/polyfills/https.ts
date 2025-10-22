import { createHttpModule, STATUS_CODES } from "./http";

const httpsModule = createHttpModule("https:");

export const request = httpsModule.request;
export const get = httpsModule.get;
export const Agent = httpsModule.Agent;
export const globalAgent = httpsModule.globalAgent;

export { STATUS_CODES };

const httpsPolyfill = {
  request,
  get,
  Agent,
  globalAgent,
  STATUS_CODES,
};

export default httpsPolyfill;
