ALTER TABLE "GroupBuyParticipant" ADD COLUMN "completionMethod" TEXT;
ALTER TABLE "GroupBuyParticipant" ADD COLUMN "checkInTokenHash" TEXT;

CREATE TABLE "CheckInToken" (
    "participantId" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckInToken_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "GroupBuyParticipant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PriceBenchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produceType" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL DEFAULT 'lb',
    "retailLow" TEXT NOT NULL,
    "retailHigh" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

CREATE INDEX "PriceBenchmark_produceType_region_retrievedAt_idx" ON "PriceBenchmark"("produceType", "region", "retrievedAt");

CREATE TABLE "DistributionCenterBaseline" (
    "produceType" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "baselinePerLb" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("produceType", "region")
);
