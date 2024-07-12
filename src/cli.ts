import { gen, grm } from "./gen";

function main() {
  const g = grm`Name: "${gen("foo", { stop: '"' })}"`;
  const json = g.serialize();
  console.log(JSON.stringify(json, null, 1));
  console.log(g.pp());
}

main();
