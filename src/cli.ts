import { gen, grm, oneOrMore, select } from "./index";

function main() {
  let g = grm`Name: "${gen("foo", { stop: '"' })}"\n`;
  g = g.join(select("foo", "bar", "baz"));
  g = g.join(oneOrMore(select("a", "b")));
  const json = g.serialize();
  // console.log(JSON.stringify(json, null, 1));
  console.log(g.pp());
}

main();
