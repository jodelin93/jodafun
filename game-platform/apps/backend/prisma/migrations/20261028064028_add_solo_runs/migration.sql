-- CreateTable
CREATE TABLE "solo_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_type" VARCHAR(50) NOT NULL DEFAULT 'joda-memory',
    "difficulty" VARCHAR(10) NOT NULL,
    "time_seconds" INTEGER NOT NULL,
    "moves" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solo_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solo_runs_game_type_difficulty_time_seconds_idx" ON "solo_runs"("game_type", "difficulty", "time_seconds");

-- CreateIndex
CREATE INDEX "solo_runs_user_id_idx" ON "solo_runs"("user_id");

-- AddForeignKey
ALTER TABLE "solo_runs" ADD CONSTRAINT "solo_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
