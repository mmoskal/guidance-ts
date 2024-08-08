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

test("infer stop", () => {
  function tstInfer(stop: string, mk: (stop: string) => GrammarNode) {
    assert.equal(mk(stop).serialize(), mk(undefined).serialize());
  }

  tstInfer(".", (stop) => grm`${gen({ stop })}.`);
  tstInfer(".", (stop) => grm`${gen({ stop })}${select(".a", ".b")}`);
  tstInfer("", (stop) => grm`${gen({ stop })}`);

});

test("infer error", () => {
  // assert.throws(() => grm`${gen()}`.serialize(), /infer/);
  assert.throws(() => grm`${gen()}${gen()}`, /followed/);
  assert.throws(() => grm`${gen()}${select("XXX", "YYY")}`, /XXX/);
  const g = gen();
  assert.throws(() => grm`${g}X${g}Y`, /X/);
});

test.run();
