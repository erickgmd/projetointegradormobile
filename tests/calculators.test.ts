import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
async function calculator() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(await readFile("public/calculators.js", "utf8"), context);
  return (context as any).window.CashFlowCalculators;
}
test("RF019 salário CLT2026 isenção até5000, redutor parcial e teto INSS", async () => {
  const c = await calculator();
  const low = c.salary2026(1621, 0, 0);
  assert.equal(low.inss, 121.58);
  assert.equal(low.irrf, 0);
  assert.equal(low.net, 1499.42);
  assert.equal(c.salary2026(5000, 0, 0).irrf, 0);
  assert.ok(c.salary2026(6000, 0, 0).irrf > 0);
  assert.equal(c.salary2026(20000, 0, 0).inss, c.salary2026(10000, 0, 0).inss);
  assert.equal(
    c.salary2026(5000, 0, 100).net,
    c.salary2026(5000, 0, 0).net - 100,
  );
});
test("RF020 RF021 taxas zero nas simulações não geram NaN", async () => {
  const c = await calculator();
  assert.equal(c.compound(100, 50, 0, 12), 700);
  assert.equal(c.loan(1200, 0, 12), 100);
  assert.throws(() => c.salary2026(-10, 0, 0));
});
