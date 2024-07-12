import {
  Gen,
  GrammarNode,
  Join,
  Lexeme,
  Select,
  StringLiteral,
} from "./grammarnode";
import { RegexNode } from "./regexnode";

export type RegexDef = RegExp | RegexNode;

export interface GenOptions {
  regex?: RegexDef;
  stop?: string;
  stopRegex?: RegexDef;
  maxTokens?: number;
  temperature?: number;
}

export type Grammar = GrammarNode | string;

export function gen(name: string, options: GenOptions = {}): Gen {
  const regex = options.regex ?? /.*/;
  const stop =
    options.stopRegex ??
    (options.stop === undefined
      ? RegexNode.noMatch()
      : RegexNode.literal(options.stop));
  const g = new Gen(RegexNode.from(regex), RegexNode.from(stop));
  if (options.maxTokens !== undefined) g.maxTokens = options.maxTokens;
  if (options.temperature !== undefined) g.temperature = options.temperature;
  g.captureName = name;
  return g;
}

export function select(values: Grammar[]) {
  return new Select(values.map(GrammarNode.from));
}

export function join(values: Grammar[]) {
  return new Join(values.map(GrammarNode.from));
}

export function lexeme(rx: RegexDef) {
  return new Lexeme(RegexNode.from(rx));
}

export function keyword(s: string) {
  return new Lexeme(RegexNode.literal(s), true);
}

export function str(s: string) {
  return new StringLiteral(s);
}

function concatStrings(acc: GrammarNode[]) {
  for (let i = 1; i < acc.length; ++i) {
    const a = acc[i - 1];
    const b = acc[i];
    if (a instanceof StringLiteral && b instanceof StringLiteral) {
      acc[i - 1] = str(a.literal + b.literal);
      acc.splice(i, 1);
      i--;
    }
  }
}

export function grm(
  strings: TemplateStringsArray,
  ...values: Grammar[]
): GrammarNode {
  const acc: GrammarNode[] = [];

  for (let i = 0; i < strings.length; i++) {
    if (strings[i] !== "") acc.push(str(strings[i]));
    if (i < values.length) {
      if (values[i] != null) acc.push(GrammarNode.from(values[i]));
    }
  }

  concatStrings(acc);

  if (acc.length == 0) return str("");
  else if (acc.length == 1) return acc[0];
  else return new Join(acc);
}
