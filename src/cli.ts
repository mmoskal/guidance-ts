import { Serializer } from "./ast";
import { gen, grm } from "./gen";

function main() {
  const g = grm`Name: "${gen("foo", { stop: '"' })}"`;
  const json = Serializer.grammar(g);
  console.log(json);
}

main();
