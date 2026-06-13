const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFinancialSummary,
  buildAccountStatement,
  buildPayrollExpense,
  calculateBreakEven
  , calculateAbcCost
} = require('./finance-core.js');

test('buildFinancialSummary separates sales, collected cash, receivables, payroll and profit', () => {
  const db = {
    ventas: [
      { fecha:'2026-05-01T10:00', total:1000, saldo:0, pagos:[{ metodo:'Efectivo', monto:1000 }], items:[{ prod:'Pastel', precio:1000, cant:1 }] },
      { fecha:'2026-05-02T10:00', total:500, saldo:200, pagos:[{ metodo:'Transferencia', monto:300 }], items:[{ prod:'Pastel', precio:500, cant:1 }] }
    ],
    gastos: [
      { fecha:'2026-05-01', categoria:'Materia prima', monto:250 },
      { fecha:'2026-05-02', categoria:'Nómina', monto:300 },
      { fecha:'2026-05-03', categoria:'Renta', monto:100 }
    ]
  };
  const summary = buildFinancialSummary(db, '2026-05-01', '2026-05-31');

  assert.equal(summary.salesTotal, 1500);
  assert.equal(summary.cashIn, 1300);
  assert.equal(summary.receivables, 200);
  assert.equal(summary.expensesTotal, 650);
  assert.equal(summary.payrollTotal, 300);
  assert.equal(summary.netProfit, 850);
  assert.equal(summary.cashBalance, 650);
});

test('buildAccountStatement returns dated income and expense movements with running balance', () => {
  const db = {
    ventas: [{ folio:'PAN-1', fecha:'2026-05-02T10:00', clienteNombre:'Ana', pagos:[{ metodo:'Efectivo', monto:400 }] }],
    gastos: [{ fecha:'2026-05-03', categoria:'Empaque', proveedor:'Proveedor A', monto:150, desc:'Cajas' }]
  };
  const rows = buildAccountStatement(db, '2026-05-01', '2026-05-31');

  assert.deepEqual(rows.map(r=>r.balance), [400, 250]);
  assert.equal(rows[0].type, 'ingreso');
  assert.equal(rows[1].type, 'egreso');
});

test('buildPayrollExpense creates a payroll expense with useful description', () => {
  const expense = buildPayrollExpense({ fecha:'2026-05-15', colaborador:'Dany', periodo:'1-15 mayo', monto:2500, metodo:'Transferencia', notas:'Bono puntualidad' });

  assert.equal(expense.categoria, 'Nómina');
  assert.equal(expense.proveedor, 'Dany');
  assert.equal(expense.monto, 2500);
  assert.match(expense.desc, /1-15 mayo/);
  assert.match(expense.desc, /Bono puntualidad/);
});

test('calculateBreakEven returns required sales and tickets from fixed cost and margin', () => {
  const result = calculateBreakEven({ fixedCosts:30000, variableCostPct:35, avgTicket:300 });

  assert.equal(result.contributionPct, 65);
  assert.equal(result.salesRequired, 46153.85);
  assert.equal(result.ticketsRequired, 154);
});

test('calculateAbcCost allocates selected expenses by production minutes', () => {
  const db = {
    gastos: [
      { fecha:'2026-05-01', categoria:'Renta', monto:12000 },
      { fecha:'2026-05-02', categoria:'Nómina', monto:18000 },
      { fecha:'2026-05-03', categoria:'Servicios', monto:3000 },
      { fecha:'2026-05-04', categoria:'Ingredientes', monto:9000 }
    ]
  };
  const abc = calculateAbcCost(db, {
    from:'2026-05-01',
    to:'2026-05-31',
    categories:['Renta','Nómina','Servicios'],
    productiveMinutes:6600,
    recipeMinutes:45
  });

  assert.equal(abc.expensesTotal, 33000);
  assert.equal(abc.costPerMinute, 5);
  assert.equal(abc.recipeCost, 225);
});

test('calculateAbcCost returns zero when no expense categories are selected', () => {
  const db = { gastos: [{ fecha:'2026-05-01', categoria:'Renta', monto:12000 }] };
  const abc = calculateAbcCost(db, {
    from:'2026-05-01',
    to:'2026-05-31',
    categories:[],
    productiveMinutes:6000,
    recipeMinutes:30
  });

  assert.equal(abc.expensesTotal, 0);
  assert.equal(abc.recipeCost, 0);
});
