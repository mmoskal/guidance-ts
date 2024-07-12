import { RegexJSON } from "./api";
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

  serializeInner(rec: (n: RegexNode) => number): RegexJSON {
    const simple = JSON.parse(JSON.stringify(this.simple));
    const key = Object.keys(simple)[0];
    let arg = Object.values(simple)[0];

    if (this.children) {
      const mapped = this.children.map(rec);
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
