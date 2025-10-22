import { Buffer } from "buffer";

type HeaderValue = string | number | string[] | undefined;

type NodeStyleRequestOptions = {
  protocol?: string;
  hostname?: string;
  host?: string;
  port?: number | string;
  path?: string;
  href?: string;
  method?: string;
  headers?: Record<string, HeaderValue>;
  timeout?: number;
  agent?: unknown;
  ca?: unknown;
  cert?: unknown;
  key?: unknown;
  body?: ArrayBufferView | ArrayBuffer | string | null;
};

type InternalRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  body?: ArrayBufferView | ArrayBuffer | string | null;
};

type ResponseCallback = (response: FetchLikeResponse) => void;

type FetchInit = RequestInit & {
  headers?: Record<string, string>;
  body?: Uint8Array;
};

type Listener = (...args: any[]) => void;

class Emitter {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(listener);
    } else {
      this.listeners.set(event, new Set([listener]));
    }
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapper: Listener = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    (wrapper as any).__origin = listener;
    return this.on(event, wrapper);
  }

  off(event: string, listener: Listener) {
    const listeners = this.listeners.get(event);
    if (!listeners) return this;
    for (const entry of listeners) {
      if (entry === listener || (entry as any).__origin === listener) {
        listeners.delete(entry);
        break;
      }
    }
    if (listeners.size === 0) {
      this.listeners.delete(event);
    }
    return this;
  }

  removeListener(event: string, listener: Listener) {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  emit(event: string, ...args: any[]) {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) return false;
    for (const listener of Array.from(listeners)) {
      listener(...args);
    }
    return true;
  }

  listenersFor(event: string) {
    return this.listeners.get(event) ? Array.from(this.listeners.get(event)!) : [];
  }
}

class FetchLikeResponse extends Emitter {
  statusCode: number;
  headers: Record<string, string>;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null;

  constructor(res: Response) {
    super();
    this.statusCode = res.status;
    this.headers = Object.create(null);
    res.headers.forEach((value, key) => {
      this.headers[key.toLowerCase()] = value;
    });
    Object.defineProperty(this, "body", {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    this.reader = res.body?.getReader() ?? null;
  }

  async *streamChunks() {
    if (!this.reader) return;
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done || !value) break;
        this.emit("data", value);
        yield Buffer.from(value);
      }
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      this.emit("end");
    }
  }

  [Symbol.asyncIterator]() {
    return this.streamChunks();
  }
}

class ClientRequest extends Emitter {
  private readonly url: string;
  private readonly init: InternalRequestOptions;
  private readonly bodyChunks: Buffer[] = [];
  private ended = false;
  private sendPromise: Promise<void> | null = null;
  private readonly controller = new AbortController();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, options: InternalRequestOptions, callback?: ResponseCallback) {
    super();
    this.url = url;
    this.init = {
      method: options.method?.toUpperCase(),
      headers: { ...(options.headers ?? {}) },
      timeout: options.timeout,
    };

    if (options.body !== undefined && options.body !== null) {
      this.bodyChunks.push(toBuffer(options.body));
    }

    if (callback) {
      this.once("response", callback);
    }
  }

  setHeader(name: string, value: string | number | readonly string[]) {
    this.init.headers ??= Object.create(null);
    this.init.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
    return this;
  }

  getHeader(name: string) {
    return this.init.headers?.[name.toLowerCase()];
  }

  hasHeader(name: string) {
    return Boolean(this.init.headers?.[name.toLowerCase()]);
  }

  removeHeader(name: string) {
    if (this.init.headers) {
      delete this.init.headers[name.toLowerCase()];
    }
    return this;
  }

  write(chunk: Buffer | ArrayBufferView | ArrayBuffer | string, encoding: BufferEncoding = "utf8", callback?: () => void) {
    this.bodyChunks.push(typeof chunk === "string" ? Buffer.from(chunk, encoding) : toBuffer(chunk));
    if (callback) callback();
    return this;
  }

  end(chunk?: Buffer | ArrayBufferView | ArrayBuffer | string, encoding: BufferEncoding = "utf8", callback?: () => void) {
    if (this.ended) {
      if (callback) callback();
      return this;
    }
    this.ended = true;
    if (chunk !== undefined) {
      this.write(chunk as any, encoding);
    }
    if (callback) {
      this.once("finish", callback);
    }
    this.send();
    return this;
  }

  abort() {
    if (!this.controller.signal.aborted) {
      this.controller.abort();
      this.emit("abort");
    }
    return this;
  }

  destroy(error?: Error) {
    this.clearTimeout();
    if (error) {
      this.emit("error", error);
    }
    this.abort();
    return this;
  }

  setTimeout(ms: number, callback?: () => void) {
    this.init.timeout = ms;
    if (callback) {
      this.once("timeout", callback);
    }
    if (this.sendPromise) {
      this.clearTimeout();
      this.startTimeout();
    }
    return this;
  }

  private startTimeout() {
    if (!this.init.timeout || this.init.timeout <= 0) return;
    this.timeoutId = setTimeout(() => {
      this.emit("timeout");
      this.abort();
    }, this.init.timeout);
  }

  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async send() {
    if (this.sendPromise) return;
    this.sendPromise = (async () => {
      const method = this.init.method ?? "GET";
      const bodyBuffer = this.prepareBody(method);
      const headers = { ...(this.init.headers ?? {}) };
      const fetchInit: FetchInit = {
        method,
        headers,
        signal: this.controller.signal,
      };
      if (bodyBuffer) {
        fetchInit.body = bodyBuffer;
      } else if (method === "GET" || method === "HEAD") {
        delete fetchInit.headers?.["content-length"];
      }

      try {
        this.startTimeout();
        const response = await fetch(this.url, fetchInit as RequestInit);
        this.clearTimeout();
        const wrapped = new FetchLikeResponse(response);
        this.emit("response", wrapped);
      } catch (error) {
        this.clearTimeout();
        if ((error as Error).name === "AbortError" || this.controller.signal.aborted) {
          this.emit("error", new Error("Request aborted"));
        } else {
          this.emit("error", error as Error);
        }
      } finally {
        this.emit("finish");
      }
    })();
  }

  private prepareBody(method: string) {
    if (method === "GET" || method === "HEAD") {
      return undefined;
    }
    if (this.bodyChunks.length === 0) {
      return undefined;
    }
    return Buffer.concat(this.bodyChunks);
  }
}

class Agent {}

const STATUS_CODES: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a Teapot",
  422: "Unprocessable Entity",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  511: "Network Authentication Required",
};

function toBuffer(input: ArrayBufferView | ArrayBuffer | string | Buffer) {
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(input);
}

function normaliseHeaders(headers?: Record<string, HeaderValue>) {
  if (!headers) return undefined;
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key.toLowerCase()] = value.map((entry) => String(entry)).join(", ");
    } else {
      result[key.toLowerCase()] = String(value);
    }
  }
  return result;
}

function buildUrl(options: NodeStyleRequestOptions, defaultProtocol: "http:" | "https:") {
  if (options.href) return options.href;
  const protocol = options.protocol ?? defaultProtocol;
  const hostname = options.hostname ?? options.host ?? "localhost";
  const port = options.port ? `:${options.port}` : "";
  const path = options.path ?? "/";
  return `${protocol}//${hostname}${port}${path}`;
}

function createHttpModule(defaultProtocol: "http:" | "https:") {
  const moduleGlobalAgent = new Agent();
  function request(
    url: string | URL | NodeStyleRequestOptions,
    options?: NodeStyleRequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) {
    let targetUrl: string;
    let requestOptions: NodeStyleRequestOptions = {};
    let responseCallback: ResponseCallback | undefined;

    if (typeof url === "string" || url instanceof URL) {
      targetUrl = url.toString();
      if (typeof options === "function") {
        responseCallback = options;
      } else {
        requestOptions = options ?? {};
        responseCallback = callback;
      }
    } else {
      requestOptions = { ...url };
      targetUrl = buildUrl(requestOptions, defaultProtocol);
      if (typeof options === "function") {
        responseCallback = options;
      } else {
        responseCallback = callback;
      }
    }

    const internal: InternalRequestOptions = {
      method: requestOptions.method,
      headers: normaliseHeaders(requestOptions.headers),
      timeout: requestOptions.timeout,
      body: requestOptions.body ?? null,
    };

    const req = new ClientRequest(targetUrl, internal, responseCallback);
    return req;
  }

  function get(
    url: string | URL | NodeStyleRequestOptions,
    options?: NodeStyleRequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) {
    const req = request(url, options as any, callback);
    req.end();
    return req;
  }

  return { request, get, Agent, globalAgent: moduleGlobalAgent, STATUS_CODES };
}

const httpModule = createHttpModule("http:");

export const request = httpModule.request;
export const get = httpModule.get;
export const Agent = httpModule.Agent;
export const globalAgent = httpModule.globalAgent;
export { STATUS_CODES, createHttpModule, FetchLikeResponse, ClientRequest };

export default {
  request,
  get,
  Agent,
  globalAgent,
  STATUS_CODES,
};
