-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "orgType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProducerProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "farmName" TEXT NOT NULL,
    "serviceRadiusMiles" INTEGER NOT NULL,
    "farmLatitude" REAL NOT NULL,
    "farmLongitude" REAL NOT NULL,
    CONSTRAINT "ProducerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProducerProduceType" (
    "producerId" TEXT NOT NULL,
    "produceTypeId" TEXT NOT NULL,

    PRIMARY KEY ("producerId", "produceTypeId"),
    CONSTRAINT "ProducerProduceType_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "ProducerProfile" ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProducerProduceType_produceTypeId_fkey" FOREIGN KEY ("produceTypeId") REFERENCES "ProduceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProduceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PickupLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "GroupBuy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produceTypeId" TEXT NOT NULL,
    "targetLbsX100" INTEGER NOT NULL,
    "pickupLocationId" TEXT NOT NULL,
    "pickupWindowStart" DATETIME NOT NULL,
    "pickupWindowEnd" DATETIME NOT NULL,
    "joinDeadline" DATETIME NOT NULL,
    "bidDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT NOT NULL,
    "selectedBidId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupBuy_produceTypeId_fkey" FOREIGN KEY ("produceTypeId") REFERENCES "ProduceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupBuy_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "PickupLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupBuy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupBuy_selectedBidId_fkey" FOREIGN KEY ("selectedBidId") REFERENCES "Bid" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupBuyParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBuyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedLbsX100" INTEGER NOT NULL,
    "depositAmountCents" INTEGER NOT NULL,
    "depositStatus" TEXT NOT NULL DEFAULT 'pending',
    "depositUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completionStatus" TEXT NOT NULL DEFAULT 'pending',
    "checkInToken" TEXT,
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
    "priceCentsPerLb" INTEGER NOT NULL,
    "availableLbsX100" INTEGER NOT NULL,
    "availabilityWindowStart" DATETIME NOT NULL,
    "availabilityWindowEnd" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bid_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bid_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBuyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuy_selectedBidId_key" ON "GroupBuy"("selectedBidId");

-- CreateIndex
CREATE INDEX "GroupBuy_status_produceTypeId_idx" ON "GroupBuy"("status", "produceTypeId");

-- CreateIndex
CREATE INDEX "GroupBuy_pickupLocationId_idx" ON "GroupBuy"("pickupLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyParticipant_checkInToken_key" ON "GroupBuyParticipant"("checkInToken");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyParticipant_groupBuyId_userId_key" ON "GroupBuyParticipant"("groupBuyId", "userId");

-- CreateIndex
CREATE INDEX "Bid_groupBuyId_idx" ON "Bid"("groupBuyId");

-- CreateIndex
CREATE INDEX "Event_groupBuyId_createdAt_idx" ON "Event"("groupBuyId", "createdAt");
