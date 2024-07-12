import { gen, grm, keyword, lexeme, oneOrMore, select } from "./index";
import { assert } from "./util";

function testDedent() {
  let g = grm`\
      A: ${"A"}
      B: ${"B"}
        Blah
      C
      `;
  assert(JSON.parse(g.pp()) == "A: A\nB: B\n  Blah\nC\n");

  g = grm`A: ${"A"}
          B: ${"B"}
            Blah
          C
      `;
  assert(JSON.parse(g.pp()) == "A: A\nB: B\n  Blah\nC\n");

  g = grm`
          A: ${"A"}
          B: ${"B"}
            Blah
          C
      `;
  assert(JSON.parse(g.pp()) == "\nA: A\nB: B\n  Blah\nC\n");

  g = grm`
          A: ${"A"}
          B: ${"B"}
            Blah
          C
      
          `;
  assert(JSON.parse(g.pp()) == "\nA: A\nB: B\n  Blah\nC\n\n");

  g = grm`
            A: ${"A"}
            B: ${"B"}
              Blah
            C

          `;
  assert(JSON.parse(g.pp()) == "\nA: A\nB: B\n  Blah\nC\n\n");
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
}

main();
