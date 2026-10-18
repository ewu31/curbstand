-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "organizationType" TEXT,
    "contact" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProducerProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "farmName" TEXT NOT NULL,
    "produceTypes" TEXT NOT NULL,
    "serviceRadiusMiles" INTEGER NOT NULL,
    CONSTRAINT "ProducerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProduceCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "PickupLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'Seattle / Puget Sound',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "GroupBuy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produceType" TEXT NOT NULL,
    "targetLbs" TEXT NOT NULL,
    "pickupLocationId" TEXT NOT NULL,
    "pickupWindowStart" DATETIME NOT NULL,
    "pickupWindowEnd" DATETIME NOT NULL,
    "joinDeadline" DATETIME NOT NULL,
    "bidDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT NOT NULL,
    "selectedBidId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupBuy_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "PickupLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupBuy_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupBuy_selectedBidId_fkey" FOREIGN KEY ("selectedBidId") REFERENCES "Bid" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupBuyParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBuyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedLbs" TEXT NOT NULL,
    "depositAmount" TEXT NOT NULL,
    "depositStatus" TEXT NOT NULL DEFAULT 'pending',
    "completionStatus" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupBuyParticipant_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupBuyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBuyId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "pricePerLb" TEXT NOT NULL,
    "availableLbs" TEXT NOT NULL,
    "availabilityWindowStart" DATETIME NOT NULL,
    "availabilityWindowEnd" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bid_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bid_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBuyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProduceCatalog_slug_key" ON "ProduceCatalog"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuy_selectedBidId_key" ON "GroupBuy"("selectedBidId");

-- CreateIndex
CREATE INDEX "GroupBuy_status_pickupWindowStart_idx" ON "GroupBuy"("status", "pickupWindowStart");

-- CreateIndex
CREATE INDEX "GroupBuy_produceType_status_idx" ON "GroupBuy"("produceType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyParticipant_groupBuyId_userId_key" ON "GroupBuyParticipant"("groupBuyId", "userId");

-- CreateIndex
CREATE INDEX "Bid_groupBuyId_pricePerLb_idx" ON "Bid"("groupBuyId", "pricePerLb");

-- CreateIndex
CREATE INDEX "Event_groupBuyId_createdAt_idx" ON "Event"("groupBuyId", "createdAt");
