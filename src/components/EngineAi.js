/**
 * FinRisk AI Engine — Multi-Turn Memory
 *
 * Drop this file into src/ and import in App.js:
 *   import { getAIResponse } from "./engine-ai";
 *
 * Usage in send():
 *   const reply = getAIResponse(messages, latestUserText, profile, parsed);
 */

// import utility functions from engine if needed in future
// import { parseFinancials, computeProfile, calculateEMI } from "../engine"; 

/* ─────────────────────────────────────────────────────────────
   THE ONLY FUNCTION YOU NEED TO CALL
   
   @param chatHistory  — full messages[] array (all roles, all turns)
   @param latestText   — the newest user message string
   @param profile      — computeProfile() result from ALL history
   @param parsed       — parseFinancials() result from ALL history
   @returns { text, card }
─────────────────────────────────────────────────────────────── */
export function getAIResponse(chatHistory, latestText, profile, parsed) {
  // 1. Full history for context awareness
  const history = chatHistory || [];
  const userTurns = history.filter(m => m.role === "user");
  const asTurns   = history.filter(m => m.role === "ai" || m.role === "assistant");
  const turnCount = userTurns.length;

  // 2. Latest message intent (ONLY current turn, not history)
  const t = latestText.toLowerCase();

  // 3. What was discussed in prior AI turns (avoid repetition)
  const priorTopics = asTurns.map(m => m.content).join(" ").toLowerCase();
  const alreadyShownOverview = priorTopics.includes("dti") || priorTopics.includes("stress score");
  const alreadyShownBudget   = priorTopics.includes("budget split") || priorTopics.includes("monthly breakdown");
  // const alreadyShownEMI      = priorTopics.includes("monthly emi") || priorTopics.includes("reducing balance"); // unused currently

  // 4. What the user discussed before (carry-forward awareness)
  const allUserContext = userTurns.map(m => m.content).join(" ").toLowerCase();
  const mentionedKids  = allUserContext.match(/kid|child|dependent|son|daughter|family/);
  const mentionedAge   = allUserContext.match(/age|year.*old|i.m \d+/);
  const mentionedSave  = allUserContext.match(/sav(e|ing|ings)/);

  // 5. Intent flags
  const intent = {
    greet:    /^(hi+|hello|hey|namaste|good\s*(morning|evening|afternoon))\b/i.test(t) && turnCount <= 1,
    budget:   /budget|breakdown|split|expense|surplus|saving|where.*money|how.*spend/i.test(t),
    emi:      /calculat|emi.*loan|how much.*emi|loan.*calculat|compute.*emi|what.*emi/i.test(t),
    advice:   /advice|suggest|recommend|what should|help me|how\s+(to|many|do|can)|plan|improve|what.*do/i.test(t),
    risk:     /risk|score|safe|dangerous|stress|dti|ratio|explain.*score|why.*score/i.test(t),
    compare:  /compare|better|worse|vs|versus|difference/i.test(t),
    more:     /more|detail|elaborate|tell me more|explain/i.test(t),
    update:   /also|forgot|plus|and my|additionally|update|add|i have|by the way/i.test(t),
    thanks:   /thank|great|awesome|good|nice|perfect|got it|ok|okay|cool/i.test(t),
    reset:    /start over|restart|reset|new|fresh|forget/i.test(t),
    noIncome: !parsed?.income,
    noEMI:    parsed?.income && !parsed?.emi,
    hasAll:   !!profile,
  };

  // additional handling: if the user replies affirmatively to a follow‑up
  // question from the AI, treat it as a request for advice.  We look at the
  // last AI turn and see if it asked the “Want me to show…” question.
  const lastAI = asTurns.length ? asTurns[asTurns.length - 1].content.toLowerCase() : "";
  if (/^(yes|yeah|yep|sure|ok|please)\b/i.test(t) && /want me to show/i.test(lastAI)) {
    intent.advice = true;
  }

  const p   = profile;
  const fmt = n => (n || 0).toLocaleString("en-IN");
  const fmtK = n => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(0)}k` : `₹${fmt(n)}`;
  const riskLabel = s => s < 35 ? "Safe" : s < 65 ? "Concerned" : "High Risk";

  /* ── GREETING (turn 1 only) ── */
  if (intent.greet) {
    return {
      text: `Hey! I'm your **AI Financial Advisor**.\n\nI maintain full conversation memory — so you can tell me details across multiple messages and I'll build your complete financial profile progressively.\n\nI compute:\n• **Debt-to-Income ratio** & **Risk Score** (0–100)\n• **Exact EMI** using reducing-balance formula\n• **Safe borrowing limits** and personalized advice\n\nJust talk naturally — start with your income:\n*"I earn ₹75,000/month"*`,
      card: null,
    };
  }

  /* ── THANKS / ACKNOWLEDGEMENT ── */
  if (intent.thanks && turnCount > 1) {
    if (!intent.hasAll) {
      return {
        text: `Glad that helps! ${intent.noIncome ? "Share your **monthly income** when you're ready and I'll run your full analysis." : "Add your **total monthly EMI** and I'll complete your risk assessment."}`,
        card: null,
      };
    }
    return {
      text: `Happy to help! Your profile is loaded — I remember everything from this session.\n\nYou can ask me:\n• *"How can I improve my score?"*\n• *"What if I take a new ₹20L loan?"*\n• *"Show my budget breakdown"*`,
      card: null,
    };
  }

  /* ── RESET REQUEST ── */
  if (intent.reset) {
    return {
      text: `Sure — let's start fresh. Tell me your **monthly income** and I'll rebuild your financial profile from scratch.`,
      card: null,
    };
  }

  /* ── NO INCOME YET ── */
  if (intent.noIncome) {
    return {
      text: `To run your financial analysis, I need your **monthly income** first.\n\nYou can say:\n• *"I earn ₹80,000 per month"*\n• *"Take-home is 1.2 lakh"*\n• *"Salary 60k"*`,
      card: null,
    };
  }

  /* ── HAS INCOME, NO EMI ── */
  if (intent.noEMI) {
    const incomeContext = `Income **${fmtK(parsed.income)}/month** noted ✓`;
    const extras = [];
    if (mentionedAge)  extras.push("age captured");
    if (mentionedKids) extras.push("dependents noted");
    const ctxNote = extras.length ? ` (${extras.join(", ")})` : "";

    return {
      text: `${incomeContext}${ctxNote}\n\nNow I need your total monthly **loan EMIs**:\n• *"Home loan EMI ₹18,000"*\n• *"I pay 25% of salary on loans"*\n• *"Total EMI ₹12,000/month"*\n\nIf you have multiple loans, give me the combined total.`,
      card: null,
    };
  }

  /* ── EMI CALCULATOR ── */
  if (intent.emi) {
    const incomeNote = p ? `\n\nFor reference: your income is **${fmtK(p.income)}/month**. I'll flag if the new EMI pushes you above the safe 40% threshold.` : "";
    return {
      text: `Here's the **EMI Calculator** — adjust the sliders for live results.${incomeNote}`,
      card: "emi",
    };
  }

  /* ── BUDGET (context-aware, avoids repetition) ── */
  if (intent.budget && p) {
    const alreadyNote = alreadyShownBudget
      ? "Here's your **updated** budget breakdown" 
      : "Here's your **monthly budget breakdown**";
    return {
      text: `${alreadyNote} — EMI load, living expenses, and net surplus. The projection shows your savings trajectory over 6 months.${mentionedSave && p.savings ? `\n\nIncluding your savings of **${fmtK(p.savings)}**, your emergency runway is **${p.survivalMonths} months**.` : ""}`,
      card: "budget",
    };
  }

  /* ── RISK SCORE EXPLANATION ── */
  if (intent.risk && p) {
    const s = p.stressScore;
    const dtiGap = s < 65 ? Math.round((p.dti - 30) * parsed.income / 100) : 0;
    return {
      text: `**Risk Score: ${s}/100** → ${riskLabel(s)}\n\nFormula: **(DTI × 1.2) + age factor + dependent load**\n\n${
        s < 35
          ? `Your DTI of ${p.dti.toFixed(0)}% is in the ideal zone (< 30%). You have strong financial resilience.`
          : s < 65
          ? `DTI at ${p.dti.toFixed(0)}% is the main driver. Reducing total EMI by ~${fmtK(dtiGap)}/month would bring your DTI to 30% and push your score below 35.`
          : `DTI at ${p.dti.toFixed(0)}% is critical. Your loan burden is consuming ${p.dti.toFixed(0)}% of income — the safe ceiling is 40%.`
      }${mentionedKids ? `\n\nNote: dependents (${p.dependents || "detected"}) add to your score since they reduce financial flexibility.` : ""}`,
      card: "overview",
    };
  }

  /* ── PERSONALIZED ADVICE (progressive, aware of prior advice) ── */
  if (intent.advice && p) {
    const s = p.stressScore;
    const alreadyAdvised = priorTopics.includes("roadmap") || priorTopics.includes("action plan") || priorTopics.includes("step");

    if (alreadyAdvised) {
      // Don't repeat — give deeper follow-up advice
      return {
        text: `Going deeper on your improvement plan:\n\n${
          s < 35
            ? `Since you're in great shape, focus on **wealth building**:\n• Index fund SIP: ${fmtK(Math.round(p.surplus * .4))}/month at 12% CAGR = ${fmtK(Math.round(p.surplus * .4 * 12 * 10))} in 10 years\n• Step up SIP by 10% annually for compounding boost\n• Consider NPS for additional ₹50k tax deduction under 80CCD`
            : s < 65
            ? `**Debt payoff sequencing:**\n1. List all loans by interest rate (highest first)\n2. Pay minimum on all except the highest-rate one\n3. Throw every extra rupee at that loan\n4. When it's gone, roll that EMI into the next — this is the **debt avalanche**\n5. Each loan cleared instantly frees up cash flow`
            : `**Emergency measures:**\n1. Request a **3-month moratorium** from your bank — legally available under RBI guidelines\n2. Check if you qualify for **balance transfer** to a lower-rate lender\n3. Liquidate any idle FDs or investments earning less than your loan rate\n4. Even selling a vehicle and using ride-hailing can free ₹8–15k/month`
        }`,
        card: s < 35 ? null : "budget",
      };
    }

    return {
      text: s < 35
        ? `**Growth Roadmap** — you're in strong shape:\n\n1. **SIP investing** — ${fmtK(Math.round(p.surplus * .5))}/month in index funds\n2. **Emergency fund** — build to ${fmtK(6 * (p.expenses + p.emi))} (6 months)\n3. **80C deduction** — maximize ₹1.5L/year\n4. **Term insurance** — ${fmtK(parsed.income * 120)} cover (~₹8k/year)\n5. You qualify for **prime loan rates** — leverage strategically only`
        : s < 65
        ? `**Stabilization Plan:**\n\n1. **Debt avalanche** — extra cash to highest-interest loan first\n2. **No new credit** until DTI drops below 35%\n3. **Emergency buffer** — ${fmtK(3 * (p.expenses + p.emi))} minimum (3 months)\n4. ₹10k/month side income drops your DTI by ${(10000 / parsed.income * 100).toFixed(1)}%\n5. **Renegotiate rate** — call your bank and ask for a rate review`
        : `🚨 **Urgent (do this week):**\n\n1. **Call your bank** — request EMI restructuring or moratorium\n2. **Debt consolidation** — merge loans into one lower-rate product\n3. **Slash all discretionary spending** immediately\n4. **SEBI advisor** — book a session (₹2–5k, worth it)\n5. **Zero new debt** until DTI is below 50%`,
      // always show budget graph with advice so the monthly analysis appears
      card: s < 35 ? null : "budget",
    };
  }

  /* ── FOLLOW-UP: "MORE DETAIL" on prior topic ── */
  if (intent.more && p) {
    if (alreadyShownBudget) {
      return {
        text: `Here's a deeper look at your numbers:\n\n• **EMI-to-income**: ${p.dti.toFixed(1)}% — every ${fmtK(Math.round(parsed.income / 100))} earned, ${fmtK(Math.round(p.emi / 100))} goes to loans\n• **Expense-to-income**: ${((p.expenses / parsed.income) * 100).toFixed(0)}% — living costs\n• **Free cash ratio**: ${p.surplus > 0 ? ((p.surplus / parsed.income) * 100).toFixed(0) : 0}%\n• **Break-even income**: ${fmtK(p.emi + p.expenses)} — below this you go into deficit`,
        card: "budget",
      };
    }
    if (alreadyShownOverview) {
      return {
        text: `Deeper score breakdown:\n\n• **DTI contribution**: ${(p.dti * 1.2).toFixed(0)} points (${p.dti.toFixed(1)}% × 1.2)\n• **Age factor**: ${p.ageFactor || "~5"} points\n• **Dependent load**: ${p.depFactor || (p.dependents ? p.dependents * 5 : 0)} points\n• **Total**: ${p.stressScore}/100\n\nTo cut 10 points off your score, reduce EMI by ${fmtK(Math.round(parsed.income * (10/1.2) / 100))} — either by prepaying or refinancing.`,
        card: "overview",
      };
    }
  }

  /* ── UPDATE / ADDING MORE INFO (turn 2+) ── */
  if (intent.update && p) {
    return {
      text: `Profile updated — I've incorporated that into your complete financial picture. Stress score **recalculated** across all ${turnCount} turns of our conversation.`,
      card: "overview",
    };
  }

  /* ── COMPARE / WHAT-IF ── */
  if (intent.compare && p) {
    return {
      text: `For a **what-if scenario**, tell me what you'd like to compare:\n• *"What if my EMI drops to ₹15,000?"*\n• *"What if I take an additional ₹10L loan?"*\n• *"What if I earn ₹10k more per month?"*`,
      card: null,
    };
  }

  /* ── FULL PROFILE COMPUTED — show overview (first time or after update) ── */
  if (p) {
    const s = p.stressScore;
    const isRepeat = alreadyShownOverview && !intent.update;

    if (isRepeat) {
      // Contextual follow-up instead of repeating the same card
      return {
        text: `Based on your profile (score: **${s}/100**, DTI: **${p.dti.toFixed(1)}%**):\n\n${
          s < 35
            ? `You're in a strong position. Want me to build a **savings & investment plan** around your ${fmtK(p.surplus)} monthly surplus?`
            : s < 65
            ? `Your biggest lever is reducing the DTI. Want a **step-by-step debt payoff plan** specific to your numbers?`
            : `Urgent action is needed. Want me to show exactly **which expenses to cut** or **how to restructure your loans**?`
        }\n\n(Scroll down for your **monthly budget split** with projected savings—this is your expense tracker and future prediction.)`,
        card: "budget",
      };
    }

    return {
      text: `**Analysis complete** (based on ${turnCount} turn${turnCount>1?"s":""} of conversation).\n\nDTI: **${p.dti.toFixed(1)}%** · Score: **${s}/100** (${riskLabel(s)})\n${p.surplus >= 0 ? `Monthly surplus: **${fmtK(p.surplus)}** after all obligations.` : `⚠ Monthly deficit of **${fmtK(Math.abs(p.surplus))}** — spending exceeds income.`}\nFair loan rate: **${p.fairRate.toFixed(1)}% p.a.**\n\nBelow is your **monthly budget split** (EMI, expenses, surplus) and a 6‑month projection—this serves as an expense tracker and future prediction.\n\nAsk me anything:\n• *"Show my budget breakdown"*\n• *"How do I improve my score?"*\n• *"Calculate EMI for a ₹30L loan"*`,
      card: "budget",
    };
  }

  /* ── FALLBACK ── */
  return {
    text: `Could you confirm your **monthly income** and **total EMI**?${mentionedAge ? " I've noted your age." : ""}${mentionedKids ? " Dependents noted." : ""} Once I have both, I'll give you a complete risk assessment.`,
    card: null,
  };
}

/* ─────────────────────────────────────────────────────────────
   CORRECT send() IMPLEMENTATION (paste this into App.js)
   
   This is the ONLY correct pattern for multi-turn React chat.
   The key insight: use functional setState BOTH times, and
   accumulate ALL user messages before parsing.
─────────────────────────────────────────────────────────────── */
export const SEND_IMPLEMENTATION = `
// In your ChatApp component:

const send = useCallback((text = input) => {
  const msg = text.trim();
  if (!msg || typing) return;

  setInput("");
  setTyping(true);

  setMessages(prev => {
    // STEP 1: New state with user message appended
    const withUser = [...prev, { role: "user", content: msg }];

    // STEP 2: Accumulate ALL user turns — never discard history
    const fullContext = withUser
      .filter(m => m.role === "user")
      .map(m => m.content)
      .join(" ");

    // STEP 3: Parse from full context, not just latest message
    const parsed  = parseFinancials(fullContext);
    const prof    = computeProfile(parsed);

    // STEP 4: Generate with full history for memory + context
    const { text: aiText, card } = getAIResponse(withUser, msg, prof, parsed);

    // STEP 5: Append AI message after delay (functional update = fresh array)
    setTimeout(() => {
      if (prof) setProfile(prof);
      setTyping(false);
      setMessages(hist => [...hist, { role:"ai", content:aiText, card, profile:prof||null }]);
    }, 860 + Math.random() * 540);

    return withUser; // user message appears immediately
  });
}, [input, typing]);
`;
