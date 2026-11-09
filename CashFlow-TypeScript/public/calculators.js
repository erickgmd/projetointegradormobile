// Simulação CLT mensal, competência 2026. Fontes em docs/requisitos/CALCULOS.md.
(function () {
  const round = (n) =>
    Math.round((n + Number.EPSILON * Math.max(1, Math.abs(n))) * 100) / 100;
  function numbers(...values) {
    if (values.some((n) => !Number.isFinite(n) || n < 0))
      throw new Error("Informe valores numéricos iguais ou maiores que zero.");
  }
  function salary2026(gross, dependents = 0, healthPlan = 0) {
    numbers(gross, dependents, healthPlan);
    if (gross <= 0 || !Number.isInteger(dependents))
      throw new Error(
        "Informe salário positivo e quantidade inteira de dependentes.",
      );
    let previous = 0,
      inss = 0;
    for (const [cap, rate] of [
      [1621, 0.075],
      [2902.84, 0.09],
      [4354.27, 0.12],
      [8475.55, 0.14],
    ]) {
      inss += Math.max(0, Math.min(gross, cap) - previous) * rate;
      previous = cap;
    }
    inss = round(inss);
    const base = Math.max(
      0,
      gross - Math.max(inss + dependents * 189.59, 607.2),
    );
    const bands = [
      [2428.8, 0, 0],
      [2826.65, 0.075, 182.16],
      [3751.05, 0.15, 394.16],
      [4664.68, 0.225, 675.49],
      [Infinity, 0.275, 908.73],
    ];
    const [, rate, deduction] = bands.find(([limit]) => base <= limit);
    const before = round(Math.max(0, base * rate - deduction));
    const reduction =
      gross <= 5000
        ? before
        : gross <= 7350
          ? Math.min(before, Math.max(0, 978.62 - 0.133145 * gross))
          : 0;
    const irrf = round(Math.max(0, before - reduction));
    return { inss, irrf, net: round(gross - inss - irrf - healthPlan) };
  }
  function compound(initial, contribution, annualRate, months) {
    numbers(initial, contribution, annualRate, months);
    if (!Number.isInteger(months) || months <= 0)
      throw new Error("Informe um prazo positivo em meses.");
    const rate = (1 + annualRate / 100) ** (1 / 12) - 1;
    return (
      initial * (1 + rate) ** months +
      (rate === 0
        ? contribution * months
        : (contribution * ((1 + rate) ** months - 1)) / rate)
    );
  }
  function loan(amount, monthlyPercent, months) {
    numbers(amount, monthlyPercent, months);
    if (amount <= 0 || !Number.isInteger(months) || months <= 0)
      throw new Error("Informe valor e prazo positivos.");
    const r = monthlyPercent / 100;
    return r === 0 ? amount / months : (amount * r) / (1 - (1 + r) ** -months);
  }
  window.CashFlowCalculators = { salary2026, compound, loan };
})();
