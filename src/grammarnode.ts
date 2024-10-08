import {
  GrammarId,
  GrammarWithLexer,
  NodeJSON,
  NodeProps,
  RegexJSON,
  RegexSpec,
  TopLevelGrammar,
} from "./api";
import { BaseNode, RegexNode } from "./regexnode";
import { assert } from "./util";

export type Grammar = GrammarNode | string;

export abstract class GrammarNode extends BaseNode {
  maxTokens?: number;
  captureName?: string;
  nullable = false;

  static LIST_APPEND_PREFIX = "__LIST_APPEND:";

  protected constructor() {
    super();
  }

  abstract serializeInner(s: Serializer): NodeJSON;

  serialize(): TopLevelGrammar {
    const gens = this.rightNodes().filter(
      (n) => n instanceof Gen && n.stop === undefined
    ) as Gen[];
    for (const g of gens) {
      if (g._inferStop === undefined) g._inferStop = "";
    }
    return new NestedGrammar(this).serialize();
  }

  join(other: Grammar): Join {
    return new Join([this, GrammarNode.from(other)]);
  }

  toString() {
    return this.pp();
  }

  pp() {
    const useCount = new Map();

    {
      const visited = new Set();
      const visit = (n: GrammarNode) => {
        const v = useCount.get(n) ?? 0;
        useCount.set(n, v + 1);
        if (visited.has(n)) return;
        visited.add(n);
        n.getChildren()?.forEach(visit);
      };
      visit(this);
    }

    {
      const visited = new Set();
      const visit = (n: GrammarNode) => {
        if (visited.has(n)) return "#" + n.id;
        visited.add(n);
        const ch = n.getChildren()?.map(visit);
        let res = useCount.get(n) > 1 ? `#${n.id}: ` : ``;
        res += n.ppInner(ch);
        if (ch) return `(${res})`;
        else return res;
      };
      return visit(this);
    }
  }

  getChildren(): readonly GrammarNode[] | undefined {
    return undefined;
  }

  leftNodes(): GrammarNode[] {
    return Array.from(this.sideNodes(false));
  }

  rightNodes(): GrammarNode[] {
    return Array.from(this.sideNodes(true));
  }

  private sideNodes(right: boolean): Set<GrammarNode> {
    const r = new Set<GrammarNode>();
    const todo: GrammarNode[] = [this];
    while (todo.length > 0) {
      const e = todo.pop();
      if (r.has(e)) continue;
      r.add(e);
      if (e instanceof Select) {
        todo.push(...e.getChildren());
      } else if (e instanceof Join) {
        const elts = e.sequence.slice();
        if (right) elts.reverse();
        for (const e of elts) {
          todo.push(e);
          if (!e.nullable) break;
        }
      }
    }
    return r;
  }

  abstract ppInner(children?: string[]): string;

  static from(s: Grammar) {
    if (typeof s === "string") return new StringLiteral(s);
    return s;
  }
}

function ppProps(n: GrammarNode & { temperature?: number }) {
  let res = "";
  if (n.maxTokens !== undefined) res += ` maxTokens:${n.maxTokens}`;
  if (n.temperature !== undefined) res += ` temp:${n.temperature}`;
  if (n.captureName !== undefined)
    res += ` name:${JSON.stringify(n.captureName)}`;
  return res;
}

export class Gen extends GrammarNode {
  public temperature?: number;
  public lazy?: boolean;
  public _inferStop?: string;

  constructor(public regex: RegexNode, public stop?: RegexNode) {
    super();
    Serializer.checkRegex(this.regex);
    Serializer.checkRegex(this.stop);
    // if (!stop) this.lazy = true;
  }

  override ppInner() {
    const stop = this.stop
      ? this.stop.pp()
      : this._inferStop !== undefined
      ? JSON.stringify(this._inferStop)
      : "???";
    return (
      `gen(` +
      `regex:${this.regex.pp()} ` +
      `stop:${stop}` +
      ppProps(this) +
      `)`
    );
  }

  override serializeInner(s: Serializer): NodeJSON {
    const stop = this.stop
      ? s.regex(this.stop)
      : this._inferStop !== undefined
      ? this._inferStop
      : undefined;
    if (stop === undefined) throw new Error(`can't infer gen({ stop: ... })`);
    return {
      Gen: {
        body_rx: s.regex(this.regex),
        // TODO-SERVER: passing noMatch doesn't work - need ""
        stop_rx: stop,
        temperature: this.temperature,
        lazy: this.lazy,
      },
    };
  }
}

export class Select extends GrammarNode {
  constructor(public among: GrammarNode[]) {
    super();
    this.nullable = this.among.some((e) => e.nullable);
  }

  override getChildren() {
    return this.among;
  }

  override ppInner(children?: string[]) {
    return children.join(" | ") + ppProps(this);
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
    this.nullable = this.sequence.every((e) => e.nullable);
    this.inferGenStop();
  }

  private inferGenStop() {
    for (let i = 0; i < this.sequence.length - 1; ++i) {
      const gens = this.sequence[i]
        .rightNodes()
        .filter((n) => n instanceof Gen && n.stop === undefined) as Gen[];
      if (gens.length == 0) continue;
      const infer: string[] = [];
      for (const n of this.sequence[i + 1].leftNodes()) {
        if (n instanceof Select || n instanceof Join) continue;
        if (n instanceof StringLiteral) {
          infer.push(n.literal);
        } else {
          throw new Error(
            `can't infer gen({ stop: ... }): ${gens[0].pp()} followed by ${n.pp()}`
          );
        }
      }
      if (infer.length > 0) {
        const inferStop = infer[0][0];
        if (infer.some((x) => x[0] != inferStop))
          throw new Error(
            `can't infer gen({ stop: ...}): ${gens[0].pp()} is followed by ${infer}`
          );
        for (const g of gens) {
          if (g._inferStop !== undefined && g._inferStop != inferStop)
            throw new Error(
              `can't infer gen({ stop: ...}): ${g.pp()} already has ${
                g._inferStop
              }; setting to ${inferStop}`
            );
          g._inferStop = inferStop;
        }
      }
    }
  }

  override ppInner(children?: string[]) {
    return children.join(" + ") + ppProps(this);
  }

  override getChildren() {
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
    this.nullable = this.literal == "";
  }

  override ppInner() {
    return JSON.stringify(this.literal) + ppProps(this);
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
    Serializer.checkRegex(rx);
  }

  override ppInner() {
    const kw = this.contextual ? "keyword" : "lexeme";
    return `${kw}(${this.rx.pp()}${ppProps(this)})`;
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

export class NestedGrammar extends GrammarNode {
  public temperature?: number;

  constructor(public start: GrammarNode, public skip_rx?: RegexNode) {
    super();
    Serializer.checkRegex(this.skip_rx);
  }

  override serialize(): TopLevelGrammar {
    return Serializer.grammar(this);
  }

  override getChildren() {
    return [this.start];
  }

  override serializeInner(s: Serializer): NodeJSON {
    const gid = s.saveGrammar(this);
    return {
      GenGrammar: {
        grammar: gid,
        temperature: this.temperature,
      },
    };
  }

  override ppInner(children?: string[]): string {
    return `grammar(${children[0]})`;
  }
}

function nodeProps(node: NodeJSON): NodeProps {
  return Object.values(node)[0];
}

class Serializer {
  private nodeCache: Map<GrammarNode, number> = new Map();
  private grammarCache: Map<NestedGrammar, number> = new Map();
  private rxCache: Map<RegexNode, number> = new Map();
  private grmNodes: NodeJSON[] = [];
  private rxNodes: RegexJSON[] = [];
  private rxHashCons: Map<string, number> = new Map();
  private grammars: GrammarWithLexer[] = [];
  private grammarSrc: NestedGrammar[] = [];

  constructor() {
    this.serialize = this.serialize.bind(this);
    this.regex = this.regex.bind(this);
  }

  saveGrammar(n: NestedGrammar) {
    let gid = this.grammarCache.get(n);
    if (gid !== undefined) return gid;
    gid = this.grammars.length;
    this.grammars.push({
      greedy_lexer: false, // no longer used
      contextual: false,
      greedy_skip_rx: undefined,
      rx_nodes: [],
      nodes: [],
    });
    this.grammarSrc.push(n);
    this.grammarCache.set(n, gid);
    return gid;
  }

  private fixpoint() {
    // note that this.grammarSrc.length grows during this loop
    for (let i = 0; i < this.grammarSrc.length; ++i) {
      const g = this.grammars[i];
      this.grmNodes = g.nodes;
      this.rxNodes = g.rx_nodes;
      this.rxHashCons.clear();
      this.nodeCache.clear();
      this.rxCache.clear();
      const s = this.grammarSrc[i];
      const id = this.serialize(s.start);
      if (s.skip_rx) g.greedy_skip_rx = this.regex(s.skip_rx);
      assert(id == 0);
    }
  }

  static grammar(top: NestedGrammar): TopLevelGrammar {
    const s = new Serializer();
    const id = s.saveGrammar(top);
    assert(id == 0);
    s.fixpoint();
    return {
      grammars: s.grammars,
    };
  }

  /**
   * Throws is regex is recursive.
   */
  static checkRegex(n: RegexNode) {
    const s = new Serializer();
    s.regex(n);
  }

  serialize(n: GrammarNode): GrammarId {
    let sid = this.nodeCache.get(n);
    if (sid !== undefined) return sid;
    sid = this.grmNodes.length;
    this.grmNodes.push(null);
    this.nodeCache.set(n, sid);
    const serial = n.serializeInner(this);
    const props = nodeProps(serial);
    if (n.maxTokens !== undefined) props.max_tokens = n.maxTokens;
    if (n.captureName !== undefined) props.capture_name = n.captureName;
    this.grmNodes[sid] = serial;
    return sid;
  }

  regex(top?: RegexNode): RegexSpec {
    if (top === undefined) top = RegexNode.noMatch();

    const cache = this.rxCache;

    const lookup = (n: RegexNode) => {
      const r = cache.get(n);
      if (r == null) throw new Error("circular regex");
      assert(typeof r == "number");
      return r;
    };

    const missing = (n: RegexNode) => !cache.has(n);

    const todo = [top];
    while (todo.length > 0) {
      const n = todo.pop();
      let sid = cache.get(n);
      if (sid === null) throw new Error("circular regex");
      cache.set(n, null);

      const unfinished = n.getChildren()?.filter(missing);
      if (unfinished?.length) {
        unfinished.reverse();
        todo.push(n, ...unfinished);
        continue;
      }

      const serial = n.serializeInner(lookup);
      const key = JSON.stringify(serial);
      const cached = this.rxHashCons.get(key);
      if (cached !== undefined) {
        sid = cached;
      } else {
        sid = this.rxNodes.length;
        this.rxNodes.push(serial);
        this.rxHashCons.set(key, sid);
      }
      cache.set(n, sid);
    }

    return lookup(top);
  }
}
