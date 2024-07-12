import {
  GrammarId,
  GrammarWithLexer,
  NodeJSON,
  NodeProps,
  RegexJSON,
  RegexSpec,
} from "./api";
import { BaseNode, RegexNode } from "./regexnode";
import { assert, panic } from "./util";

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
    const serial = n.serializeInner(this.regex);
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

  visited.clear();
}
