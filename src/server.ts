import express from "express";
import cors from "cors";
import morgan from "morgan";

import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import path from "path";
const openapiPath = path.join(process.cwd(), "openapi-browza.yaml");
const openapiDoc = YAML.load(openapiPath);


const app = express();       // create the app first
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(morgan("tiny"));

const openapiDoc = YAML.load("./openapi-browza.yaml");  // load file from project root
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDoc)); // then mount /docs
app.get("/", (_req, res) => res.redirect("/docs"));


async function isHostAllowed(host: string) {
  const found = await prisma.allowlistHost.findUnique({ where: { host } });
  return !!found;
}

const DENY_PATH_REGEX = /(\/login|\/signin|\/account|\/profile|\/cart|\/checkout|\/wp-admin)/i;

// --- Middleware: sanitize & policy enforce ---
app.use((req, _res, next) => {
  delete req.headers["cookie"];
  delete req.headers["authorization"];
  delete req.headers["set-cookie"];
  next();
});

async function enforceJobPolicy(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: "url_required" });

  try {
    const u = new URL(url);

    // 1) Domain allow-list (DB)
    if (!(await isHostAllowed(u.hostname))) {
      return res.status(400).json({ error: "domain_not_allowed", host: u.hostname });
    }

    // 2) Deny login/checkout/admin paths
    if (/(\/login|\/signin|\/account|\/profile|\/cart|\/checkout|\/wp-admin)/i.test(u.pathname)) {
      return res.status(400).json({ error: "path_blocked" });
    }

    // 3) Only GET or HEAD allowed
    const method = (req.body.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      return res.status(400).json({ error: "method_not_allowed" });
    }

    // 4) Drop any auth/cookie headers from payload (defense in depth)
    if (req.body.headers) {
      delete req.body.headers["cookie"];
      delete req.body.headers["authorization"];
      delete req.body.headers["set-cookie"];
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
app.post("/jobs", enforceJobPolicy, async (req, res) => {
  const job = (req as any).normalizedJob as { url: string; method: string };
  const created = await prisma.job.create({
    data: { url: job.url, method: job.method, status: "queued" },
    select: { id: true, url: true, method: true, status: true },
  });
  return res.json({ jobId: created.id, url: created.url, method: created.method, status: created.status });
});

app.get("/jobs/:id", async (req, res) => {
  const j = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!j) return res.status(404).json({ error: "not_found" });
  return res.json({
    jobId: j.id,
    status: j.status,
    httpCode: j.httpCode ?? 200,
    bytesDown: j.bytesDown ?? 12345,
    latencyMs: j.latencyMs ?? 850,
  });
});

app.get("/jobs/:id/summary", async (req, res) => {
  const j = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!j) return res.status(404).json({ error: "not_found" });
  return res.json({
    successPct: j.successPct ?? 96.4,
    p50: j.p50 ?? 1200,
    p95: j.p95 ?? 4200,
    gbUsed: j.gbUsed ?? 0.07,
  });
});


// --- Seller: device registration & runtime ---
app.post("/seller/register", async (req, res) => {
  const dev = await prisma.device.create({
    data: { city: "Pune", isp: "Jio", uptimePct: 99.1, qualityScore: 87, lastSeen: new Date() },
  });
  return res.json({ deviceId: dev.id, token: "device.jwt" });
});

app.post("/seller/heartbeat", async (req, res) => {
  // For demo, update the first device if exists
  const any = await prisma.device.findFirst();
  if (any) {
    await prisma.device.update({ where: { id: any.id }, data: { lastSeen: new Date() } });
  }
  return res.json({ ok: true, eligible: true });
});

app.post("/seller/usage", async (req, res) => {
  const any = await prisma.device.findFirst();
  if (any) {
    await prisma.device.update({
      where: { id: any.id },
      data: { bytesToday: (any.bytesToday ?? 0) + 1024 * 1024 }, // +1MB
    });
  }
  return res.json({ ok: true });
});


app.post("/seller/payouts/request", (_req, res) => res.json({ payoutRequestId: "po_001", status: "pending" }));

// --- Admin: allow-list, devices, payouts ---
app.post("/admin/allowlist/add", async (req, res) => {
  const { host } = req.body as { host?: string };
  if (!host) return res.status(400).json({ error: "host_required" });

  const added = await prisma.allowlistHost.upsert({
    where: { host },
    create: { host },
    update: {}, // already exists → no change
  });
  return res.json({ ok: true, added: added.host });
});


app.post("/admin/denylist/set", (_req, res) => res.json({ ok: true }));

app.get("/admin/devices", async (req, res) => {
  const list = await prisma.device.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, city: true, isp: true, uptimePct: true, qualityScore: true },
  });
  return res.json(list);
});

app.get("/admin/payouts", async (req, res) => {
  const list = await prisma.payoutRequest.findMany({ orderBy: { createdAt: "desc" } });
  return res.json(list);
});

app.post("/seller/payouts/request", async (req, res) => {
  const pr = await prisma.payoutRequest.create({ data: { user: "u_123", amount: 250, vpa: "user@upi", kyc: "verified" } });
  return res.json({ payoutRequestId: pr.id, status: pr.status });
});

app.post("/admin/payouts/:id/approve", async (req, res) => {
  const pr = await prisma.payoutRequest.update({ where: { id: req.params.id }, data: { status: "paid" } });
  return res.json({ id: pr.id, status: pr.status, ref: "txn_ref_123" });
});

app.post("/admin/payouts/:id/reject", async (req, res) => {
  const pr = await prisma.payoutRequest.update({ where: { id: req.params.id }, data: { status: "rejected" } });
  return res.json({ id: pr.id, status: pr.status });
});


// --- Start ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Browza API listening on ${PORT}`));
