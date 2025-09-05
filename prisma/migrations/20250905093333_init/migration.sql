-- CreateTable
CREATE TABLE "AllowlistHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "httpCode" INTEGER,
    "bytesDown" INTEGER,
    "latencyMs" INTEGER,
    "successPct" REAL,
    "p50" INTEGER,
    "p95" INTEGER,
    "gbUsed" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT,
    "isp" TEXT,
    "uptimePct" REAL,
    "qualityScore" INTEGER,
    "lastSeen" DATETIME,
    "bytesToday" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user" TEXT,
    "amount" INTEGER,
    "vpa" TEXT,
    "kyc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AllowlistHost_host_key" ON "AllowlistHost"("host");
