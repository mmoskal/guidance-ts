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
} from "../src/index";

import { test } from "uvu";
import * as assert from "uvu/assert";

test("dedent in grm", () => {
  function s(g: GrammarNode) {
    return JSON.parse(g.pp());
  }

  let g = grm`\
        A: ${"A"}
        B: ${"B"}
          Blah
        C
        `;
  assert.equal(s(g), "A: A\nB: B\n  Blah\nC\n");

  g = grm`A: ${"A"}
            B: ${"B"}
              Blah
            C
        `;
  assert.equal(s(g), "A: A\nB: B\n  Blah\nC\n");

  g = grm`
            A: ${"A"}
            B: ${"B"}
              Blah
            C
        `;
  assert.equal(s(g), "\nA: A\nB: B\n  Blah\nC\n");

  g = grm`
            A: ${"A"}
            B: ${"B"}
              Blah
            C
        
            `;
  assert.equal(s(g), "\nA: A\nB: B\n  Blah\nC\n\n");

  g = grm`
              A: ${"A"}
              B: ${"B"}
                Blah
              C
  
            `;
  assert.equal(s(g), "\nA: A\nB: B\n  Blah\nC\n\n");

  g = grm`
              A: ${"A"}\n B: ${"B"}\n
                Blah\n
              C
  
            `;
  assert.equal(s(g), "\nA: A\n B: B\n\n  Blah\n\nC\n\n");

  g = grm`\&\|\t\r\b\Q\x33\u1234\u{1f600}`;
  assert.equal(s(g), "&|\t\r\bQ\x33\u1234\u{1f600}");
});

test("readme eq", () => {
  let g0 = grm`\
      Do you want a joke or a poem? A ${select("joke", "poem")}.
      Okay, here is a one-liner: "${gen({ stop: '"' })}"
    `;
  let g1 = join(
    str("Do you want a joke or a poem? A "),
    select("joke", "poem"),
    // str() can be omitted:
    '.\nOkay, here is a one-liner: "',
    gen({ stop: '"' }),
    '"\n'
  );
  let s0 = g0 + "";
  let s1 = g1 + "";

  assert.equal(s0, s1);

  let g2 = grm`Do you want a joke or a poem? A ${select("joke", "poem")}.\n`;
  g2 = g2.join(grm`Okay, here is a one-liner: "${gen({ stop: '"' })}"\n`);
  let s2 = g2 + "";
  assert.equal(s0, s2);
});

test("main", () => {
  let g = grm`\n\&\\Name: "${gen("foo", { stop: '"' })}"\n`;
  g = g.join(select("foo", "bar", "baz"));
  g = g.join(oneOrMore(select("a", "b")));
  g = g.join(gen(/[abc]/));
  g = g.join("x");
  g = g.join(gen("foo"));
  g = g.join("x");
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
  const s = g.pp();
});

test.run();
