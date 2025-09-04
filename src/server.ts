import express from "express";
import cors from "cors";
import morgan from "morgan";

import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";


const app = express();       // create the app first
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(morgan("tiny"));

const openapiDoc = YAML.load("./openapi-browza.yaml");  // load file from project root
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDoc)); // then mount /docs
app.get("/", (_req, res) => res.redirect("/docs"));

// --- Config (replace with DB-backed store) ---
const ALLOWLIST = new Set<string>([
  "www.google.com",
  "www.google.co.in",
  "www.youtube.com",
  "www.flipkart.com",
  "www.amazon.in",
  // add more domains by category
]);
const DENY_PATH_REGEX = /(\/login|\/signin|\/account|\/profile|\/cart|\/checkout|\/wp-admin)/i;

// --- Middleware: sanitize & policy enforce ---
app.use((req, _res, next) => {
  delete req.headers["cookie"];
  delete req.headers["authorization"];
  delete req.headers["set-cookie"];
  next();
});

// Allow-list + method policy for job submissions (buyer → broker)
function enforceJobPolicy(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: "url_required" });

  try {
    const u = new URL(url);
    if (!ALLOWLIST.has(u.hostname)) {
      return res.status(400).json({ error: "domain_not_allowed", host: u.hostname });
    }
    if (DENY_PATH_REGEX.test(u.pathname)) {
      return res.status(400).json({ error: "path_blocked" });
    }
    const method = (req.body.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      return res.status(400).json({ error: "method_not_allowed" });
    }
    if ((req as any).headers) {
      delete (req as any).headers["cookie"];
      delete (req as any).headers["authorization"];
      delete (req as any).headers["set-cookie"];
    }
    (req as any).normalizedJob = { url: u.toString(), method };
    next();
  } catch {
    return res.status(400).json({ error: "invalid_url" });
  }
}

// --- Auth (very light placeholder) ---
app.post("/auth/signup-otp", (_req, res) => res.json({ ok: true }));
app.post("/auth/verify-otp", (_req, res) => res.json({ token: "jwt.token.here" }));

// --- Buyer: org profile & billing ---
app.post("/buyer/profile", (_req, res) => res.json({ ok: true }));
app.post("/buyer/credits/razorpay/init", (_req, res) => res.json({ orderId: "rzp_order_xxx" }));
app.post("/buyer/credits/razorpay/callback", (_req, res) => res.json({ ok: true }));

// --- Buyer: jobs ---
app.post("/jobs", enforceJobPolicy, (req, res) => {
  const job = (req as any).normalizedJob;
  return res.json({ jobId: "job_123", ...job });
});
app.get("/jobs/:id", (req, res) => res.json({ jobId: req.params.id, status: "running", httpCode: 200, bytesDown: 12345, latencyMs: 850 }));
app.get("/jobs/:id/summary", (_req, res) => res.json({ successPct: 96.4, p50: 1200, p95: 4200, gbUsed: 0.07 }));

// --- Seller: device registration & runtime ---
app.post("/seller/register", (_req, res) => res.json({ deviceId: "dev_abc", token: "device.jwt" }));
app.post("/seller/heartbeat", (_req, res) => res.json({ ok: true, eligible: true }));
app.post("/seller/usage", (_req, res) => res.json({ ok: true }));
app.post("/seller/payouts/request", (_req, res) => res.json({ payoutRequestId: "po_001", status: "pending" }));

// --- Admin: allow-list, devices, payouts ---
app.post("/admin/allowlist/add", (req, res) => {
  const { host } = req.body as { host?: string };
  if (!host) return res.status(400).json({ error: "host_required" });
  ALLOWLIST.add(host);
  return res.json({ ok: true, added: host });
});
app.post("/admin/denylist/set", (_req, res) => res.json({ ok: true }));
app.get("/admin/devices", (_req, res) => res.json([{ deviceId: "dev_abc", city: "Pune", isp: "Jio", uptimePct: 99.1, qualityScore: 87 }]));
app.get("/admin/payouts", (_req, res) => res.json([{ id: "po_001", user: "u_123", amount: 250, vpa: "user@upi", kyc: "verified", status: "pending" }]));
app.post("/admin/payouts/:id/approve", (req, res) => res.json({ id: req.params.id, status: "paid", ref: "txn_ref_123" }));
app.post("/admin/payouts/:id/reject", (req, res) => res.json({ id: req.params.id, status: "rejected" }));

// --- Start ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Browza API listening on ${PORT}`));
