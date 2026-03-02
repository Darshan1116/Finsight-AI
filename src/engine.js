
export function parseAmount(raw, context = "") {
  if (!raw) return null;
  let str = raw.toString().replace(/,/g, "").trim().toLowerCase();
  let val = parseFloat(str);
  if (isNaN(val)) return null;
  const ctx = (context + " " + str).toLowerCase();
  if (ctx.match(/crore|cr\b/)) val *= 10000000;
  else if (ctx.match(/lakh|lac|l\b/)) val *= 100000;
  else if (ctx.match(/\bk\b/)) val *= 1000;
  
  return val;
}


export function parseFinancials(text) {
  const t = text.toLowerCase();
  const result = {
    income: null, emi: null, emiPct: null,
    age: null, dependents: null, savings: null,
    loanAmount: null, loanTenure: null, interestRate: null,
  };

  /* ── INCOME ── */
  const incomePatterns = [
    /(?:earn|income|salary|make|get|ctc|take.?home)[^\d₹$]*([\d,]+\.?\d*)\s*(k|lakh|lac|l|crore|cr)?/i,
    /([\d,]+\.?\d*)\s*(k|lakh|lac|l|crore|cr)?\s*(?:per month|monthly|\/month|pm\b|p\.m)/i,
    /(?:my|monthly)?\s*(?:income|salary)[^\d]*([\d,]+)/i,
  ];
  for (const p of incomePatterns) {
    const m = t.match(p);
    if (m) {
      const raw = m[1].replace(/,/g, "");
      const unit = m[2] || "";
      let val = parseFloat(raw);
      if (unit.match(/lakh|lac|^l$/)) val *= 100000;
      else if (unit.match(/crore|cr/)) val *= 10000000;
      else if (unit.match(/^k$/)) val *= 1000;
      else if (val < 500) val *= 1000; // likely in thousands
      result.income = Math.round(val);
      break;
    }
  }

  /* ── EMI as PERCENTAGE ── */
  const pctPatterns = [
    /(?:emi|loan|payment|installment)[^%\d]*([\d.]+)\s*(?:%|percent|percentage)/i,
    /([\d.]+)\s*(?:%|percent)\s*(?:of|goes|for|toward)?\s*(?:my)?\s*(?:salary|income|earning|pay)/i,
    /(?:spend|pay|goes)\s*([\d.]+)\s*(?:%|percent)\s*(?:on|for|as)\s*(?:emi|loan|debt)/i,
  ];
  for (const p of pctPatterns) {
    const m = t.match(p);
    if (m) {
      result.emiPct = parseFloat(m[1]);
      if (result.income) result.emi = Math.round((result.income * result.emiPct) / 100);
      break;
    }
  }

  /* ── EMI as ABSOLUTE ── */
  if (!result.emi) {
    const emiPatterns = [
      /(?:emi|installment|equated)[^\d₹]*([\d,]+\.?\d*)\s*(k|lakh|lac)?/i,
      /(?:loan|debt)\s+(?:is|of|payment)[^\d₹]*([\d,]+\.?\d*)/i,
      /pay\s+([\d,]+\.?\d*)\s*(?:k|lakh)?\s*(?:per month|monthly|\/month|as emi|as loan)/i,
    ];
    for (const p of emiPatterns) {
      const m = t.match(p);
      if (m) {
        let val = parseFloat(m[1].replace(/,/g, ""));
        const unit = m[2] || "";
        if (unit.match(/lakh|lac/)) val *= 100000;
        else if (unit.match(/^k$/)) val *= 1000;
        result.emi = Math.round(val);
        if (result.income && result.income > 0) result.emiPct = (result.emi / result.income) * 100;
        break;
      }
    }
  }

  /* ── AGE ── */
  const ageM = t.match(/(?:i(?:'m| am)|age(?:d)?|year[s]? old)[^\d]*([\d]+)/i)
    || t.match(/([\d]+)\s*(?:years?\s*old|yr\s*old|yo\b)/i);
  if (ageM) { const a = parseInt(ageM[1]); if (a >= 18 && a <= 80) result.age = a; }

  /* ── DEPENDENTS ── */
  const depM = t.match(/(\d+)\s*(?:dependent[s]?|kid[s]?|child(?:ren)?|son|daughter)/i)
    || t.match(/family\s*(?:of|with)\s*(\d+)/i)
    || t.match(/(\d+)\s*member[s]?\s*(?:family|household)/i);
  if (depM) result.dependents = parseInt(depM[1]);

  /* ── SAVINGS ── */
  const savM = t.match(/(?:sav(?:e|ing)[s]?|saved)\s+(?:about|around|nearly|₹|rs\.?)?\s*([\d,]+\.?\d*)\s*(k|lakh|lac)?/i);
  if (savM) {
    let val = parseFloat(savM[1].replace(/,/g, ""));
    const unit = savM[2] || "";
    if (unit.match(/lakh|lac/)) val *= 100000;
    else if (unit.match(/^k$/)) val *= 1000;
    result.savings = Math.round(val);
  }

  /* ── LOAN AMOUNT (for EMI calculator) ── */
  const loanM = t.match(/(?:loan|borrow(?:ed)?|principal)\s+(?:of|amount|is)?\s*([\d,]+\.?\d*)\s*(k|lakh|lac|crore|cr)?/i);
  if (loanM) {
    let val = parseFloat(loanM[1].replace(/,/g, ""));
    const unit = loanM[2] || "";
    if (unit.match(/crore|cr/)) val *= 10000000;
    else if (unit.match(/lakh|lac/)) val *= 100000;
    else if (unit.match(/^k$/)) val *= 1000;
    result.loanAmount = Math.round(val);
  }

  /* ── TENURE ── */
  const tenM = t.match(/([\d]+)\s*(?:year[s]?|yr[s]?)\s*(?:tenure|loan|term|period)/i)
    || t.match(/(?:tenure|term|period|duration)\s*(?:of|is)?\s*([\d]+)\s*(?:year[s]?|yr[s]?)/i);
  if (tenM) result.loanTenure = parseInt(tenM[1]);

  /* ── INTEREST RATE ── */
  const rateM = t.match(/([\d.]+)\s*(?:%|percent)\s*(?:interest|rate|p\.a|per annum)/i)
    || t.match(/(?:interest|rate)\s*(?:of|is|at)?\s*([\d.]+)\s*%/i);
  if (rateM) result.interestRate = parseFloat(rateM[1]);

  return result;
}

/**
 * calculateEMI — standard reducing balance formula
 * P * r * (1+r)^n / ((1+r)^n - 1)
 */
export function calculateEMI(principal, annualRate, tenureYears) {
  const r = annualRate / 12 / 100;
  const n = tenureYears * 12;
  if (r === 0) return principal / n;
  const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(emi);
}

/**
 * computeProfile — full financial risk computation
 */
export function computeProfile(parsed) {
  const { income, emi, emiPct, age, dependents, savings, loanAmount, loanTenure, interestRate } = parsed;
  if (!income || !emi) return null;

  const dti = (emi / income) * 100;

  // Age factor: older = higher risk (less earning years ahead)
  const ageFactor = age
    ? age >= 55 ? 20 : age >= 45 ? 12 : age >= 35 ? 6 : 3
    : 5;

  // Dependent factor
  const depFactor = dependents ? Math.min(dependents * 5, 25) : 0;

  // Savings cushion factor (more savings = lower risk)
  const savingsFactor = savings
    ? savings >= income * 12 ? -10 : savings >= income * 6 ? -5 : savings >= income * 3 ? 0 : 5
    : 3;

  const rawScore = (dti * 1.2) + depFactor + ageFactor + savingsFactor;
  const stressScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  // Living expenses estimate (30-40% of income, varies by dependents)
  const expenseRate = 0.3 + (dependents ? Math.min(dependents * 0.03, 0.15) : 0);
  const expenses = Math.round(income * expenseRate);
  const surplus = income - emi - expenses;
  const savingAmt = Math.max(0, surplus);

  const category = stressScore < 35 ? "Stable" : stressScore < 65 ? "Concerned" : "High Stress";

  // Fair market rate: base 8.5% + risk premium
  const riskPremium = stressScore < 35 ? 0 : stressScore < 50 ? 1.5 : stressScore < 65 ? 3.0 : 5.5;
  const fairRate = 8.5 + riskPremium;

  // Survival months (how long savings last if income stops)
  const monthlyBurn = emi + expenses;
  const survivalMonths = savings ? Math.round(savings / monthlyBurn) : 0;

  // EMI affordability check
  const maxSafeEMI = Math.round(income * 0.40);
  const emiStatus = emi <= maxSafeEMI ? "safe" : emi <= income * 0.55 ? "caution" : "danger";

  // Calculate EMI if loan details provided
  let calculatedEMI = null;
  if (loanAmount && loanTenure) {
    const rate = interestRate || fairRate;
    calculatedEMI = calculateEMI(loanAmount, rate, loanTenure);
  }

  return {
    income, emi, emiPct: emiPct || dti, age, dependents, savings,
    dti, stressScore, expenses, surplus, savingAmt,
    category, fairRate, survivalMonths, maxSafeEMI, emiStatus,
    ageFactor, depFactor, calculatedEMI, loanAmount, loanTenure, interestRate,
  };
}

/**
 * generateAIResponse — smart contextual advisor responses
 */
export function generateAIResponse(userText, profile, parsed, history) {
  const t = userText.toLowerCase();
  const hasIncome = parsed.income !== null;
  const hasEmi = parsed.emi !== null;

  // Greetings
  if (t.match(/^(hi|hello|hey|namaste|hii+|good\s*(morning|evening|afternoon))\b/i) && !hasIncome) {
    return `👋 Hello! I'm your **AI Financial Advisor**.

I analyze your financial health in real-time and give you a personalized risk assessment. I can help you with:

• 📊 **Debt-to-Income (DTI) analysis**
• 💸 **EMI calculation** (exact reducing-balance formula)
• 🔴 **Loan stress scoring** (0–100)
• 💡 **Personalized recommendations**

To begin, just tell me naturally about your finances. For example:

*"I earn ₹65,000 per month and my home loan EMI is ₹22,000. I'm 38 years old with 2 kids."*

Or try: *"I want to take a ₹30 lakh loan for 20 years at 8.5% interest. What will my EMI be?"*`;
  }

  // EMI calculation request
  if (t.match(/calculat|what.*emi|emi.*loan|how much.*emi|compute.*emi/i) && parsed.loanAmount && parsed.loanTenure) {
    const rate = parsed.interestRate || 8.5;
    const emi = calculateEMI(parsed.loanAmount, rate, parsed.loanTenure);
    const total = emi * parsed.loanTenure * 12;
    const totalInterest = total - parsed.loanAmount;
    return `🧮 **EMI Calculation Result**

**Loan Details:**
• Principal: ₹${parsed.loanAmount.toLocaleString("en-IN")}
• Tenure: ${parsed.loanTenure} years (${parsed.loanTenure * 12} months)
• Interest Rate: ${rate}% per annum

**Results:**
• **Monthly EMI: ₹${emi.toLocaleString("en-IN")}**
• Total Amount Payable: ₹${total.toLocaleString("en-IN")}
• Total Interest Cost: ₹${totalInterest.toLocaleString("en-IN")}

${profile ? `**For your income of ₹${profile.income.toLocaleString("en-IN")}:** This EMI would be **${((emi / profile.income) * 100).toFixed(1)}%** of your income — ${(emi / profile.income) * 100 < 40 ? "✅ within safe limits." : "⚠️ above the recommended 40% limit."}` : "Share your monthly income to see if this EMI fits your budget."}`;
  }

  // Needs income
  if (!hasIncome) {
    return `To give you a precise assessment, I need your **monthly income** first.

You can say it naturally:
• *"I earn ₹80,000 per month"*
• *"My salary is 1.2 lakh monthly"*
• *"My take-home is 60k"*

Or if you want an EMI calculation: *"I want to take a ₹25 lakh home loan for 20 years at 8.5%"*`;
  }

  // Has income but no EMI
  if (hasIncome && !hasEmi) {
    return `Got it — your monthly income is **₹${parsed.income.toLocaleString("en-IN")}** ✅

Now tell me about your **loan or EMI payments**. You can say:
• *"My home loan EMI is ₹18,000"*
• *"I pay 25% of my salary as EMI"*
• *"I have a car loan of ₹8,000 and personal loan of ₹5,000 per month"*

You can also ask me to **calculate EMI** for a loan you're planning to take.`;
  }

  // Has both — generate full analysis
  if (!profile) {
    return "I'm processing your information — could you confirm your income and EMI amount one more time? I want to make sure I have the numbers right.";
  }

  const { stressScore, dti, category, fairRate, surplus, emi, income,
    survivalMonths, maxSafeEMI, emiStatus, ageFactor, depFactor } = profile;

  const emoji = category === "Stable" ? "🟢" : category === "Concerned" ? "🟡" : "🔴";
  const scoreColor = stressScore < 35 ? "excellent" : stressScore < 65 ? "moderate" : "high";

  const breakdown = `(DTI×1.2 = ${(dti * 1.2).toFixed(0)}pts${depFactor ? ` + dependents = ${depFactor}pts` : ""}${ageFactor ? ` + age = ${ageFactor}pts` : ""})`;

  const advice = category === "Stable"
    ? `💡 **Next Steps:** You're in great shape. Consider investing your ₹${Math.abs(surplus).toLocaleString("en-IN")} monthly surplus in:\n• SIP Mutual Funds (₹${Math.round(surplus * 0.5).toLocaleString("en-IN")}/month)\n• Emergency fund top-up if under 6 months\n• NPS for tax-saving retirement corpus`
    : category === "Concerned"
    ? `⚠️ **Action Plan:**\n• Avoid taking any new loans until DTI drops below 35%\n• Target prepaying your highest-interest loan first\n• Build a 6-month emergency fund (target: ₹${(6 * (profile.expenses + emi)).toLocaleString("en-IN")})\n• Review and cut discretionary spending`
    : `🚨 **Urgent Steps:**\n• Seek **loan consolidation** immediately — merge high-interest loans\n• Contact your bank for EMI restructuring or moratorium\n• Consult a SEBI-registered financial planner\n• Avoid ALL new credit until score improves\n• Look for income supplementation (side income, freelance)`;

  return `${emoji} **Financial Analysis Complete**

**Profile Summary:**
• Monthly Income: ₹${income.toLocaleString("en-IN")}
• Total EMI: ₹${emi.toLocaleString("en-IN")} (${dti.toFixed(1)}% of income)
• Monthly Surplus: ${surplus >= 0 ? `₹${surplus.toLocaleString("en-IN")}` : `⚠️ Deficit of ₹${Math.abs(surplus).toLocaleString("en-IN")}`}

**Risk Stress Score: ${stressScore}/100** ${breakdown}
Your score reflects a **${scoreColor}** risk level — placing you in the **${category}** category.

**Why this score?**
Your DTI of ${dti.toFixed(1)}% ${dti < 30 ? "is healthy and below the 30% ideal threshold." : dti < 40 ? "is acceptable but approaching caution zone." : dti < 55 ? "is elevated. Banks flag anything above 40%." : "is critically high — most lenders will classify this as high-risk."}${survivalMonths > 0 ? ` With ₹${(profile.savings || 0).toLocaleString("en-IN")} savings, you have **${survivalMonths} months** of financial runway.` : ""}

**Safe EMI Limit for you:** ₹${maxSafeEMI.toLocaleString("en-IN")} (40% of income)
Your current EMI is **${emiStatus === "safe" ? "✅ within safe limits" : emiStatus === "caution" ? "⚠️ above recommended" : "🚨 dangerously high"}**

**Suggested Fair Loan Rate:** ${fairRate.toFixed(1)}% p.a. — ${stressScore < 35 ? "prime rate (strong profile)" : stressScore < 65 ? "slightly above prime (moderate risk)" : "high premium (elevated risk)"}

${advice}`;
}
