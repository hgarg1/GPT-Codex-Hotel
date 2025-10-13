CREATE TABLE "DiningConfig" (
    "id" TEXT NOT NULL,
    "dwellMinutes" INTEGER NOT NULL DEFAULT 120,
    "blackoutDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "policyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiningConfig_pkey" PRIMARY KEY ("id")
);
