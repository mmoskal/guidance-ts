import {
  GrammarId,
  GrammarWithLexer,
  NodeJSON,
  NodeProps,
  RegexJSON,
  RegexSpec,
} from "./api";
import { assert, panic } from "./util";

export class BaseNode {
  static nextNodeId = 1;

  id: number;

  protected constructor() {
    this.id = BaseNode.nextNodeId++;
  }
}

const REGEX_PLACEHOLDER = -1000;
export class RegexNode extends BaseNode {
  private constructor(
    private simple: RegexJSON,
    private children?: RegexNode[]
  ) {
    super();
  }

  serializeInner(s: Serializer): RegexJSON {
    const simple = JSON.parse(JSON.stringify(this.simple));
    const key = Object.keys(simple)[0];
    let arg = Object.values(simple)[0];

    if (this.children) {
      const mapped = this.children.map(s.regex);
      if (Array.isArray(arg)) {
        arg = mapped.concat(arg);
      } else if (arg === REGEX_PLACEHOLDER) {
        assert(mapped.length == 1);
        arg = mapped[0];
      } else {
        panic();
      }
      simple[key] = arg;
    }

    return simple;
  }

  static literal(s: string) {
    return new RegexNode({ Literal: s });
  }

  static regex(s: string | RegExp) {
    if (typeof s != "string") s = s.source;
    return new RegexNode({ Regex: s });
  }

  static noMatch() {
    return new RegexNode({ NoMatch: {} });
  }

  static from(s: RegexNode | RegExp) {
    if (s instanceof RegexNode) return s;
    return RegexNode.regex(s);
  }

  pp() {
    let res = "";

    const visit = (n: RegexNode) => {
      if (res.length > 1024) return;
      if ("Literal" in n.simple) {
        const lit = n.simple["Literal"];
        res += JSON.stringify(lit);
      } else if ("Regex" in n.simple) {
        const rx = n.simple["Regex"];
        res += "" + new RegExp(rx);
      } else {
        res += JSON.stringify(this.simple);
      }
    };

    visit(this);

    if (res.length > 1024) res += "...";

    return res;
  }
}

export abstract class GrammarNode extends BaseNode {
  maxTokens?: number;
  captureName?: string;

  protected constructor() {
    super();
  }

  abstract serializeInner(s: Serializer): NodeJSON;

  getChildren(): GrammarNode[] | undefined {
    return undefined;
  }

  static from(s: string | GrammarNode) {
    if (typeof s === "string") return new StringLiteral(s);
    return s;
  }
}

export class Gen extends GrammarNode {
  public temperature?: number;
  public lazy?: boolean;

  constructor(public regex: RegexNode, public stop?: RegexNode) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Gen: {
        body_rx: s.regex(this.regex),
        stop_rx: s.regex(this.stop),
        temperature: this.temperature,
        lazy: this.lazy,
      },
    };
  }
}

export class Select extends GrammarNode {
  constructor(public among: GrammarNode[]) {
    super();
  }

  override getChildren(): GrammarNode[] | undefined {
    return this.among;
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Select: {
        among: this.among.map(s.serialize),
      },
    };
  }
}

export class Join extends GrammarNode {
  constructor(public sequence: GrammarNode[]) {
    super();
  }

  override getChildren(): GrammarNode[] | undefined {
    return this.sequence;
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Join: {
        sequence: this.sequence.map(s.serialize),
      },
    };
  }
}

export class StringLiteral extends GrammarNode {
  constructor(public literal: string) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      String: {
        literal: this.literal,
      },
    };
  }
}

export class Lexeme extends GrammarNode {
  public temperature?: number;

  constructor(public rx: RegexNode, public contextual?: boolean) {
    super();
  }

  override serializeInner(s: Serializer): NodeJSON {
    return {
      Lexeme: {
        rx: s.regex(this.rx),
        contextual: this.contextual,
        temperature: this.temperature,
      },
    };
  }
}

function nodeProps(node: NodeJSON): NodeProps {
  return Object.values(node)[0];
}

export class Serializer {
  private cache: Map<BaseNode, number> = new Map();
  private grmNodes: NodeJSON[] = [];
  private rxNodes: RegexJSON[] = [];
  private rxHashCons: Map<string, number> = new Map();

  constructor() {
    this.serialize = this.serialize.bind(this);
    this.regex = this.regex.bind(this);
  }

  static grammar(top: GrammarNode): GrammarWithLexer {
    // TODO Grammar node
    const s = new Serializer();
    const id = s.serialize(top);
    assert(id == 0);
    return {
      nodes: s.grmNodes,
      greedy_lexer: false,
      rx_nodes: s.rxNodes,
    };
  }

  serialize(n: GrammarNode): GrammarId {
    let sid = this.cache.get(n);
    if (sid !== undefined) return sid;
    sid = this.grmNodes.length;
    this.grmNodes.push(null);
    this.cache.set(n, sid);
    const serial = n.serializeInner(this);
    const props = nodeProps(serial);
    if (n.maxTokens !== undefined) props.max_tokens = n.maxTokens;
    if (n.captureName !== undefined) props.capture_name = n.captureName;
    this.grmNodes[sid] = serial;
    return sid;
  }

  regex(n?: RegexNode): RegexSpec {
    if (n === undefined) n = RegexNode.noMatch();
    let sid = this.cache.get(n);
    if (sid === null) throw new Error("circular regex");
    this.cache.set(n, null);
    const serial = n.serializeInner(this);
    const key = JSON.stringify(serial);
    const cached = this.rxHashCons.get(key);
    if (cached !== undefined) {
      sid = cached;
    } else {
      sid = this.rxNodes.length;
      this.rxNodes.push(serial);
      this.rxHashCons.set(key, sid);
    }
    this.cache.set(n, sid);
    return sid;
  }
}

function ppGrammar(top: GrammarNode) {
  const visited = new Set();
  const useCount = new Map();

  const visit = (n: GrammarNode) => {
    const v = useCount.get(n) ?? 0;
    useCount.set(n, v + 1);
    if (visited.has(n)) return;
    visited.add(n);
    n.getChildren()?.forEach(visit);
  };

  visited.clear()
  
}
