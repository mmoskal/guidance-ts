import {
  gen,
  GrammarNode,
  grm,
  keyword,
  lexeme,
  oneOrMore,
  select,
  str,
  join,
} from "./index";
import { assert, panic } from "./util";

function checkStr(g: GrammarNode, expected: string) {
  const actual = JSON.parse(g.pp());
  if (actual != expected) {
    console.log({ actual, expected });
    panic();
  }
}

function testDedent() {
  let g = grm`\
      A: ${"A"}
      B: ${"B"}
        Blah
      C
      `;
  checkStr(g, "A: A\nB: B\n  Blah\nC\n");

  g = grm`A: ${"A"}
          B: ${"B"}
            Blah
          C
      `;
  checkStr(g, "A: A\nB: B\n  Blah\nC\n");

  g = grm`
          A: ${"A"}
          B: ${"B"}
            Blah
          C
      `;
  checkStr(g, "\nA: A\nB: B\n  Blah\nC\n");

  g = grm`
          A: ${"A"}
          B: ${"B"}
            Blah
          C
      
          `;
  checkStr(g, "\nA: A\nB: B\n  Blah\nC\n\n");

  g = grm`
            A: ${"A"}
            B: ${"B"}
              Blah
            C

          `;
  checkStr(g, "\nA: A\nB: B\n  Blah\nC\n\n");

  g = grm`
            A: ${"A"}\n B: ${"B"}\n
              Blah\n
            C

          `;
  checkStr(g, "\nA: A\n B: B\n\n  Blah\n\nC\n\n");

  g = grm`\&\|\t\r\b\Q\x33\u1234\u{1f600}`;
  checkStr(g, "&|\t\r\bQ\x33\u1234\u{1f600}");
}

function readme() {
  let g = grm`\
    Do you want a joke or a poem? A ${select("joke", "poem")}.
    Okay, here is a one-liner: "${gen({ stop: '"' })}"
  `;
  g = join(
    str("Do you want a joke or a poem? A "),
    select("joke", "poem"),
    '.\nOkay, here is a one-liner: "',
    gen({ stop: '"' }),
    str('"')
  );
  console.log(g.pp());
}

function main() {
  let g = grm`\n\&\\Name: "${gen("foo", { stop: '"' })}"\n`;
  g = g.join(select("foo", "bar", "baz"));
  g = g.join(oneOrMore(select("a", "b")));
  g = g.join(gen(/[abc]/));
  g = g.join(gen("foo"));
  g = g.join(
    gen({
      name: "xy",
      stop: /[xy]/,
    })
  );
  g = g.join(lexeme(/"[^"]*"/));
  g = g.join(keyword("while"));
  const json = g.serialize();
  // console.log(JSON.stringify(json, null, 1));
  console.log(g.pp());

  testDedent();

  readme();
}

main();
