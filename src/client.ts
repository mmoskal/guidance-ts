import {
  AssistantPrompt,
  InitialRunResponse,
  OutCapture,
  OutText,
  ParserOutput,
  RunRequest,
  RunResponse,
  RunUsageResponse,
} from "./api";
import { Gen, GrammarNode } from "./grammarnode";
import { postAndRead } from "./nodefetch";
import {
  assert,
  uint8ArrayConcat,
  uint8arrayFromHex,
  utf8decode,
} from "./util";

function mkUrl(path: string, connString: string) {
  const match = /^(.*?)(#.*)?$/.exec(connString);
  let url = match[1] || "";
  const fragment = match[2] || "";

  let headers: Record<string, string> = {};
  let info = "no auth header";

  if (fragment) {
    const params = new URLSearchParams(fragment.slice(1)); // remove the leading '#'
    if (params.has("key")) {
      const key = params.get("key");
      headers = { "api-key": key };
      info = `api-key: ${key.slice(0, 2)}...${key.slice(-2)}`;
    } else if (params.has("auth")) {
      const key = params.get("auth");
      headers = { authorization: "Bearer " + key };
      info = `authorization: Bearer ${key.slice(0, 2)}...${key.slice(-2)}`;
    }
  }

  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  if (url.endsWith("/run")) {
    url = url.slice(0, -4) + "/" + path;
  } else if (url.endsWith("/guidance") && path === "run") {
    // no change
  } else {
    url += "/" + path;
  }

  info = `${url} (${info})`;

  return { url, headers, info };
}

export interface RequestOptions {
  url: string;
  info?: string; // included in
  headers?: Record<string, string>;
  method?: string;
  data?: any;
  lineCb?: (s: string) => void;
}

export interface GenerationOptions {
  prompt?: string;
  messages?: AssistantPrompt[];
  grammar: GrammarNode;
  maxTokens?: number;
}

export class Session {
  constructor(private connectionString: string) {
    const info = mkUrl("run", connectionString);
    if (!(info.url.startsWith("http://") || info.url.startsWith("https://")))
      throw new Error("Invalid URL: " + connectionString);
    if (Object.keys(info.headers).length == 0)
      throw new Error("No key in connection string");
  }

  resolvePath(url: string) {
    return mkUrl(url, this.connectionString);
  }

  async request(options: RequestOptions) {
    const info = this.resolvePath(options.url);
    return await postAndRead({
      ...options,
      url: info.url,
      headers: {
        ...info.headers,
        ...(options.headers ?? {}),
      },
    });
  }

  generation(options: GenerationOptions) {
    return new SessionGeneration(this, options);
  }
}

export abstract class Generation {
  constructor(protected options: GenerationOptions) {}

  lastUsage: RunUsageResponse;
  logLevel = 1;
  captures: Map<string, OutCapture> = new Map();
  listCaptures: Map<string, OutCapture[]> = new Map();
  text: OutText[] = [];
  isDone = false;
  started = false;
  warnings: string[] = [];

  onText = (s: OutText) => {};
  onLog = (s: string) => {};
  onWarning = (warn: string) => {};
  onError = (err: string) => {
    throw new Error("Server error: " + err);
  };

  getTextBytes() {
    return uint8ArrayConcat(this.text.map((t) => uint8arrayFromHex(t.hex)));
  }

  getText() {
    return utf8decode(this.getTextBytes());
  }

  getCapture(name: string) {
    return this.captures.get(name)?.str;
  }

  getCaptureBytes(name: string) {
    return uint8arrayFromHex(this.captures.get(name)?.hex);
  }

  getListCapture(name: string) {
    return this.listCaptures.get(name)?.map((v) => v.str);
  }

  destroy() {}

  abstract run(): Promise<void>;

  protected handleParserOutput(output: ParserOutput) {
    switch (output.object) {
      case "capture":
        if (output.name.startsWith(Gen.LIST_APPEND_PREFIX)) {
          const name = output.name.slice(Gen.LIST_APPEND_PREFIX.length);
          if (!this.listCaptures.has(name)) this.listCaptures.set(name, []);
          this.listCaptures.get(name).push(output);
        } else {
          this.captures.set(output.name, output);
        }
        break;
      case "final_text":
        this.isDone = true;
        break;
      case "text":
        this.text.push(output);
        this.onText(output);
        break;
    }
  }
}

class SessionGeneration extends Generation {
  constructor(private session: Session, options: GenerationOptions) {
    super(options);
  }

  async run() {
    const arg: RunRequest = {
      controller: "llguidance",
      controller_arg: { grammar: this.options.grammar.serialize() },
      prompt: this.options.prompt,
      messages: this.options.messages,
      temperature: 0.0,
      max_tokens: this.options.maxTokens ?? 100,
    };
    assert(!this.started);
    this.started = true;
    if (this.logLevel >= 4) {
      console.log(`POST ${this.session.resolvePath("run").info}`);
      console.log(JSON.stringify(arg));
    }
    await this.session.request({
      url: "run",
      data: arg,
      lineCb: (s) => this.handleLine(s),
    });
  }

  private handleLine(serverLine: string) {
    if (serverLine.startsWith("[DONE]")) return;
    const output: RunResponse | InitialRunResponse = JSON.parse(serverLine);
    if (output.object == "initial-run") {
      // ignore
    } else if (output.object == "run") {
      this.lastUsage = output.usage;
      assert(output.forks.length == 1);
      const f = output.forks[0];
      if (f.error) {
        this.onError(f.error);
        return;
      }
      for (const line of f.logs.split("\n")) {
        if (line.startsWith("JSON-OUT: ")) {
          if (this.logLevel >= 6) {
            console.log(line);
          }
          this.handleParserOutput(JSON.parse(line.slice(10)));
        } else if (line.startsWith("Warning: ")) {
          if (this.logLevel >= 1) console.warn(line);
          this.warnings.push(line);
          this.onWarning(line);
        } else {
          if (this.logLevel >= 2) console.log(line);
          this.onLog(line);
        }
      }
    }
  }
}
