-- CreateTable
CREATE TABLE "game_moves" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "symbol" VARCHAR(1) NOT NULL,
    "x" VARCHAR(401) NOT NULL,
    "y" VARCHAR(401) NOT NULL,

    CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_moves_game_id_ply_key" ON "game_moves"("game_id", "ply");

-- CreateIndex
CREATE UNIQUE INDEX "game_moves_game_id_x_y_key" ON "game_moves"("game_id", "x", "y");

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
