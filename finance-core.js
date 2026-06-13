(function(root){
  function num(value){
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function money(value){
    return Number(num(value).toFixed(2));
  }
  function ymd(value){
    if(!value) return '';
    return String(value).slice(0,10);
  }
  function inRange(date, from, to){
    const d = ymd(date);
    return (!from || d >= from) && (!to || d <= to);
  }
  function salesInRange(db, from, to){
    return ((db && db.ventas) || []).filter(v=>inRange(v.fecha, from, to));
  }
  function expensesInRange(db, from, to){
    return ((db && db.gastos) || []).filter(g=>inRange(g.fecha, from, to));
  }
  function salePaidAmount(v){
    return ((v && v.pagos) || []).reduce((acc,p)=>acc + num(p.monto), 0);
  }
  function buildFinancialSummary(db, from, to){
    const ventas = salesInRange(db, from, to);
    const gastos = expensesInRange(db, from, to);
    const salesTotal = ventas.reduce((acc,v)=>acc + num(v.total), 0);
    const cashIn = ventas.reduce((acc,v)=>acc + salePaidAmount(v), 0);
    const receivables = ventas.reduce((acc,v)=>acc + Math.max(0, num(v.saldo)), 0);
    const expensesTotal = gastos.reduce((acc,g)=>acc + num(g.monto), 0);
    const payrollTotal = gastos.filter(g=>(g.categoria||'') === 'Nómina').reduce((acc,g)=>acc + num(g.monto), 0);
    const variableCosts = gastos
      .filter(g=>['Materia prima','Empaque','Comisiones','Envíos'].includes(g.categoria || ''))
      .reduce((acc,g)=>acc + num(g.monto), 0);
    const fixedCosts = Math.max(0, expensesTotal - variableCosts);
    const grossProfit = salesTotal - variableCosts;
    const netProfit = salesTotal - expensesTotal;
    const cashBalance = cashIn - expensesTotal;
    const avgTicket = ventas.length ? salesTotal / ventas.length : 0;
    return {
      salesTotal: money(salesTotal),
      cashIn: money(cashIn),
      receivables: money(receivables),
      expensesTotal: money(expensesTotal),
      payrollTotal: money(payrollTotal),
      variableCosts: money(variableCosts),
      fixedCosts: money(fixedCosts),
      grossProfit: money(grossProfit),
      netProfit: money(netProfit),
      cashBalance: money(cashBalance),
      avgTicket: money(avgTicket),
      ticketCount: ventas.length
    };
  }
  function buildAccountStatement(db, from, to){
    const rows = [];
    salesInRange(db, from, to).forEach(v=>{
      ((v.pagos)||[]).forEach(p=>{
        const amount = num(p.monto);
        if(amount<=0) return;
        rows.push({
          date: ymd(p.fecha || v.fecha),
          type: 'ingreso',
          concept: `${v.folio || 'Venta'} · ${v.clienteNombre || 'Mostrador'} · ${p.metodo || 'Pago'}`,
          income: money(amount),
          expense: 0
        });
      });
    });
    expensesInRange(db, from, to).forEach(g=>{
      rows.push({
        date: ymd(g.fecha),
        type: 'egreso',
        concept: `${g.categoria || 'Gasto'}${g.proveedor ? ' · '+g.proveedor : ''}${g.desc ? ' · '+g.desc : ''}`,
        income: 0,
        expense: money(g.monto)
      });
    });
    rows.sort((a,b)=> a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    let balance = 0;
    rows.forEach(r=>{
      balance += num(r.income) - num(r.expense);
      r.balance = money(balance);
    });
    return rows;
  }
  function buildPayrollExpense(input){
    const colaborador = String(input && input.colaborador || '').trim();
    const periodo = String(input && input.periodo || '').trim();
    const notas = String(input && input.notas || '').trim();
    return {
      id: input && input.id,
      fecha: (input && input.fecha) || ymd(new Date().toISOString()),
      categoria: 'Nómina',
      proveedor: colaborador,
      metodo: (input && input.metodo) || 'Transferencia',
      monto: money(input && input.monto),
      desc: ['Nómina', periodo && `Periodo: ${periodo}`, notas].filter(Boolean).join(' · ')
    };
  }
  function calculateBreakEven(input){
    const fixedCosts = num(input && input.fixedCosts);
    const variableCostPct = Math.min(99.99, Math.max(0, num(input && input.variableCostPct)));
    const avgTicket = num(input && input.avgTicket);
    const contributionPct = money(100 - variableCostPct);
    const contributionRatio = contributionPct / 100;
    const salesRequired = contributionRatio > 0 ? money(fixedCosts / contributionRatio) : 0;
    const ticketsRequired = avgTicket > 0 ? Math.ceil(salesRequired / avgTicket) : 0;
    return { fixedCosts: money(fixedCosts), variableCostPct: money(variableCostPct), contributionPct, salesRequired, ticketsRequired };
  }
  function calculateAbcCost(db, input){
    const from = input && input.from;
    const to = input && input.to;
    const categories = Array.isArray(input && input.categories) ? input.categories : [];
    const productiveMinutes = num(input && input.productiveMinutes);
    const recipeMinutes = num(input && input.recipeMinutes);
    const expenses = categories.length === 0 ? [] : expensesInRange(db, from, to).filter(g=> categories.includes(g.categoria || ''));
    const expensesTotal = expenses.reduce((acc,g)=>acc + num(g.monto), 0);
    const costPerMinute = productiveMinutes > 0 ? expensesTotal / productiveMinutes : 0;
    const recipeCost = costPerMinute * recipeMinutes;
    return {
      expensesTotal: money(expensesTotal),
      productiveMinutes: money(productiveMinutes),
      recipeMinutes: money(recipeMinutes),
      costPerMinute: money(costPerMinute),
      recipeCost: money(recipeCost),
      categories: categories.slice()
    };
  }
  const api = { buildFinancialSummary, buildAccountStatement, buildPayrollExpense, calculateBreakEven, calculateAbcCost };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FinanceCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
