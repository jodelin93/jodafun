-- CreateTable
CREATE TABLE "game_participants" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT,
    "seat" INTEGER NOT NULL,
    "team" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "result" VARCHAR(10) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_hands" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "hand_number" INTEGER NOT NULL,
    "dealer_seat" INTEGER NOT NULL,
    "points_team0" INTEGER NOT NULL,
    "points_team1" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "game_hands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_participants_user_id_idx" ON "game_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_participants_game_id_seat_key" ON "game_participants"("game_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "game_hands_game_id_hand_number_key" ON "game_hands"("game_id", "hand_number");

-- AddForeignKey
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_hands" ADD CONSTRAINT "game_hands_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
