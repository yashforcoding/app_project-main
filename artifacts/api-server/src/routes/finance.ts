import { Router, type IRouter, type Request } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

type Intent = "send_money" | "check_balance" | "apply_loan";
type Transaction = {
  id: string;
  title: string;
  amount: number;
  direction: "in" | "out";
  createdAt: string;
};

const router: IRouter = Router();

const PIN_PATTERN = /^\d{6}$/;

function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 64).toString("hex");
}

function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_PATTERN.test(pin);
}

async function getWalletRow() {
  const wallets = await supabase("wallets?select=id,balance,currency,pin_hash,pin_salt&limit=1");
  const wallet = (wallets as Record<string, unknown>[])[0];
  if (!wallet?.id) throw new Error("The wallet row could not be found");
  return wallet;
}

function verifyPin(pin: string, wallet: Record<string, unknown>) {
  const storedHash = typeof wallet.pin_hash === "string" ? wallet.pin_hash : "";
  const storedSalt = typeof wallet.pin_salt === "string" ? wallet.pin_salt : "";
  if (!storedHash || !storedSalt) return false;
  const candidate = hashPin(pin, storedSalt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function supabase(path: string, init?: RequestInit) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  const extraHeaders =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : Array.isArray(init?.headers)
        ? Object.fromEntries(init.headers)
        : init?.headers ?? {};
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      ...extraHeaders,
    } as Record<string, string>,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

function normalizeTransaction(row: Record<string, unknown>): Transaction {
  const rawAmount = Number(row.amount ?? row.amount_inr ?? 0);
  const direction = row.direction === "in" || rawAmount < 0 ? "in" : "out";
  return {
    id: String(row.id ?? `${row.created_at ?? Date.now()}`),
    title: String(row.title ?? row.description ?? row.recipient ?? "Transaction"),
    amount: Math.abs(rawAmount),
    direction,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function getDashboard() {
  const wallets = await supabase("wallets?select=balance,currency&limit=1");
  const rows = await supabase(
    "transactions?select=*&order=created_at.desc&limit=8",
  );
  const wallet = (wallets as Record<string, unknown>[])[0];
  return {
    balance: Number(wallet?.balance ?? 0),
    currency: String(wallet?.currency ?? "INR"),
    transactions: (rows as Record<string, unknown>[]).map(normalizeTransaction),
  };
}

async function callGemini(systemInstruction: string, userText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

function normalizeLang(lang: unknown): string {
  return typeof lang === "string" && lang.trim() ? lang.trim() : "English";
}

/**
 * Translates a single short piece of app-generated text (a confirmation, an
 * error, a status message) into the user's preferred language. Numbers,
 * currency symbols, and names are preserved. Falls back to the original
 * English text if translation fails for any reason, so a translation hiccup
 * never blocks a payment flow.
 */
async function translateText(text: string, lang: string): Promise<string> {
  if (!text || normalizeLang(lang) === "English") return text;
  try {
    const raw = await callGemini(
      "Translate the given app message into the target language named in the user turn's " +
        "language field. Keep numbers, currency symbols (like ₹), names of people, and the app " +
        "name 'Paisa Voice' unchanged. Keep the same tone and length. Return JSON only: " +
        '{"translated": "..."}. No markdown, no extra keys.',
      JSON.stringify({ language: lang, text }),
    );
    const parsed = JSON.parse(raw) as { translated?: string };
    return typeof parsed.translated === "string" && parsed.translated.trim() ? parsed.translated : text;
  } catch (error) {
    console.error("translateText failed, falling back to English:", error);
    return text;
  }
}

/**
 * Translates a batch of fixed UI strings in one Gemini call, preserving
 * order. Used to localize the app's static screen text (headings, hints,
 * placeholders) when the user picks a new preferred language.
 */
async function translateBatch(texts: string[], lang: string): Promise<string[]> {
  if (normalizeLang(lang) === "English") return texts;
  try {
    const raw = await callGemini(
      "Translate each string in the given JSON array into the target language named in the " +
        "language field. Preserve order and array length exactly. Keep numbers, currency symbols " +
        "(like ₹), and the app name 'Paisa Voice' unchanged. Some strings contain placeholder " +
        "tokens like {amount} or {recipient} — copy those tokens through completely unchanged " +
        "(same spelling, same curly braces), just translate the surrounding words around them. " +
        "This is UI text for a mobile finance app, keep translations short and natural. Return " +
        'JSON only: {"translated": ["...", ...]}. No markdown, no extra keys.',
      JSON.stringify({ language: lang, texts }),
    );
    const parsed = JSON.parse(raw) as { translated?: unknown[] };
    if (!Array.isArray(parsed.translated) || parsed.translated.length !== texts.length) return texts;
    return parsed.translated.map((value, index) => (typeof value === "string" && value.trim() ? value : texts[index]));
  } catch (error) {
    console.error("translateBatch failed, falling back to English:", error);
    return texts;
  }
}

async function parseIntent(text: string, lang: string) {
  const raw = await callGemini(
    "Classify a spoken finance request into exactly one intent: send_money, check_balance, or " +
      "apply_loan. The request may be in English, or in any Indian language, written either in " +
      "its native script or transliterated into Latin letters (e.g. Hindi typed as 'mukul ko " +
      "paanch hazar bhej do'). The user's app language is given for context but the request " +
      "itself can be in a different language or script — detect it from the text, don't assume. " +
      "Convert number words in ANY language to a plain numeric amount, including Indian scale " +
      "words: hazar/हज़ार/hajar = thousand, lakh/lakh = 100,000, crore/crore = 10,000,000, " +
      "sau/सौ = hundred (e.g. 'paanch hazar' or 'पांच हज़ार' = 5000, 'do lakh' = 200000). The " +
      "recipient is a person's name only — strip any grammatical particle attached to it in the " +
      "source language (Hindi 'ko', Marathi 'la', Tamil 'kku', Telugu 'ki', Kannada 'ge', Bengali " +
      "'ke', Gujarati 'ne', Punjabi 'nu', Malayalam 'nu', etc.), and capitalize it normally. " +
      "Example — input 'mukul ko paanch hazar bhej do' (Hindi, transliterated) → " +
      '{"intent":"send_money","amount":5000,"recipient":"Mukul","loanAmount":null}. ' +
      "Return JSON only with intent, amount (number or null), recipient (string or null), " +
      "loanAmount (number or null). No markdown, no extra keys.",
    JSON.stringify({ appLanguage: lang, text }),
  );
  const parsed = JSON.parse(raw) as {
    intent?: Intent;
    amount?: number | null;
    recipient?: string | null;
    loanAmount?: number | null;
  };
  if (!parsed.intent || !["send_money", "check_balance", "apply_loan"].includes(parsed.intent)) {
    throw new Error("AI returned an unsupported finance intent");
  }
  return parsed;
}

router.post("/finance/transcribe", async (req: Request, res) => {
  const audioBase64 = typeof req.body?.audioBase64 === "string" ? req.body.audioBase64 : "";
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/webm";
  const lang = normalizeLang(req.body?.lang);
  if (!audioBase64) {
    res.status(400).json({ message: await translateText("A microphone recording is required", lang) });
    return;
  }
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(audioBase64, "base64")], { type: mimeType }), "paisa-voice-recording.webm");
    form.append("model_id", "scribe_v1");
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`ElevenLabs request failed (${response.status}): ${detail}`);
    }
    const body = (await response.json()) as { text?: string };
    console.log("ElevenLabs raw response:", body);
    const text = body.text?.trim();
    if (!text) throw new Error("ElevenLabs returned an empty transcript");
    res.json({ text });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Speech transcription unavailable";
    res.status(502).json({ message: await translateText(fallback, lang) });
  }
});

router.post("/finance/localize", async (req: Request, res) => {
  const texts = Array.isArray(req.body?.texts) ? req.body.texts.filter((value: unknown) => typeof value === "string") : null;
  const lang = normalizeLang(req.body?.lang);
  if (!texts || texts.length === 0) {
    res.status(400).json({ message: "A non-empty texts array is required" });
    return;
  }
  try {
    const translated = await translateBatch(texts, lang);
    res.json({ texts: translated });
  } catch (error) {
    res.status(502).json({ message: error instanceof Error ? error.message : "Unable to translate UI text" });
  }
});

router.get("/finance/pin/status", async (_req, res) => {
  try {
    const wallet = await getWalletRow();
    res.json({ pinSet: Boolean(wallet.pin_hash) });
  } catch (error) {
    res.status(502).json({ message: error instanceof Error ? error.message : "Unable to check PIN status" });
  }
});

router.post("/finance/pin/set", async (req: Request, res) => {
  const pin = req.body?.pin;
  const currentPin = req.body?.currentPin;
  const lang = normalizeLang(req.body?.lang);
  if (!isValidPin(pin)) {
    res.status(400).json({ message: await translateText("PIN must be exactly 6 digits", lang) });
    return;
  }
  try {
    const wallet = await getWalletRow();
    // If a PIN already exists, require the current one before allowing a change.
    if (wallet.pin_hash) {
      if (!isValidPin(currentPin) || !verifyPin(currentPin, wallet)) {
        res.status(401).json({ message: await translateText("Your current PIN is incorrect", lang) });
        return;
      }
    }
    const salt = randomBytes(16).toString("hex");
    const pinHash = hashPin(pin, salt);
    await supabase(`wallets?id=eq.${encodeURIComponent(String(wallet.id))}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ pin_hash: pinHash, pin_salt: salt }),
    });
    res.json({ pinSet: true, message: await translateText("Your payment PIN has been saved.", lang) });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Unable to save PIN";
    res.status(502).json({ message: await translateText(fallback, lang) });
  }
});

router.get("/finance/dashboard", async (req, res) => {
  const lang = normalizeLang(req.query?.lang);
  try {
    res.json(await getDashboard());
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Finance data unavailable";
    res.status(502).json({ message: await translateText(fallback, lang) });
  }
});

router.post("/finance/command", async (req: Request, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const lang = normalizeLang(req.body?.lang);
  if (!text) {
    res.status(400).json({ message: await translateText("A financial request is required", lang) });
    return;
  }
  try {
    const parsed = await parseIntent(text, lang);
    if (parsed.intent === "check_balance") {
      const dashboard = await getDashboard();
      const message = await translateText(`Your available balance is ₹${dashboard.balance.toLocaleString("en-IN")}.`, lang);
      res.json({ intent: parsed.intent, balance: dashboard.balance, message });
      return;
    }
    if (parsed.intent === "apply_loan") {
      const amount = Number(parsed.loanAmount ?? parsed.amount ?? 0);
      await supabase("loan_applications", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ amount, status: "pending", purpose: text }),
      });
      const message = await translateText(`Your loan request for ₹${amount.toLocaleString("en-IN")} has been submitted for review.`, lang);
      res.json({ intent: parsed.intent, message });
      return;
    }

    const amount = Number(parsed.amount ?? 0);
    const recipient = typeof parsed.recipient === "string" ? parsed.recipient.trim() : "";
    if (!amount || amount <= 0) throw new Error("I could not find a valid amount to send");
    if (!recipient) throw new Error("Who would you like to send this to?");

    // Validate funds up front so the user isn't asked for a PIN on a request that can't succeed anyway.
    const wallet = await getWalletRow();
    const currentBalance = Number(wallet.balance ?? 0);
    if (amount > currentBalance) {
      throw new Error(
        `Insufficient balance. Your available balance is ₹${currentBalance.toLocaleString("en-IN")}, but you tried to send ₹${amount.toLocaleString("en-IN")}.`
      );
    }

    // Do NOT move any money here. send_money always requires a follow-up call to
    // /finance/confirm-payment with a valid 6-digit PIN before funds are transferred.
    const [message, confirmPrompt] = await Promise.all([
      translateText(`Enter your 6-digit PIN to send ₹${amount.toLocaleString("en-IN")} to ${recipient}.`, lang),
      translateText(`Are you sure you want to send ₹${amount.toLocaleString("en-IN")} to ${recipient}?`, lang),
    ]);
    res.json({
      intent: parsed.intent,
      requiresPin: true,
      pinSet: Boolean(wallet.pin_hash),
      pendingPayment: { amount, recipient },
      message,
      confirmPrompt,
    });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Unable to complete request";
    res.status(502).json({ message: await translateText(fallback, lang) });
  }
});

router.post("/finance/confirm-payment", async (req: Request, res) => {
  const amount = Number(req.body?.amount ?? 0);
  const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";
  const pin = req.body?.pin;
  const lang = normalizeLang(req.body?.lang);

  if (!amount || amount <= 0) {
    res.status(400).json({ message: await translateText("A valid amount is required", lang) });
    return;
  }
  if (!recipient) {
    res.status(400).json({ message: await translateText("A recipient is required", lang) });
    return;
  }
  if (!isValidPin(pin)) {
    res.status(400).json({ message: await translateText("PIN must be exactly 6 digits", lang) });
    return;
  }

  try {
    const wallet = await getWalletRow();
    if (!wallet.pin_hash) {
      res.status(409).json({ message: await translateText("No payment PIN has been set up yet", lang), pinSet: false });
      return;
    }
    if (!verifyPin(pin, wallet)) {
      res.status(401).json({ message: await translateText("Incorrect PIN. Please try again.", lang) });
      return;
    }

    // Re-check the balance at confirmation time in case it changed since the command was parsed.
    const currentBalance = Number(wallet.balance ?? 0);
    if (amount > currentBalance) {
      throw new Error(
        `Insufficient balance. Your available balance is ₹${currentBalance.toLocaleString("en-IN")}, but you tried to send ₹${amount.toLocaleString("en-IN")}.`
      );
    }

    const created = await supabase("transactions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ amount, direction: "out", title: `Sent to ${recipient}`, recipient }),
    });
    const transaction = normalizeTransaction((created as Record<string, unknown>[])[0] ?? {});

    const nextBalance = currentBalance - amount;
    await supabase(`wallets?id=eq.${encodeURIComponent(String(wallet.id))}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ balance: nextBalance }),
    });

    const message = await translateText(`₹${amount.toLocaleString("en-IN")} sent to ${recipient}.`, lang);
    res.json({
      intent: "send_money",
      balance: nextBalance,
      transaction,
      message,
    });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Unable to complete payment";
    res.status(502).json({ message: await translateText(fallback, lang) });
  }
});

export default router;