/*
  Warnings:

  - The primary key for the `accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `friendships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `game_rounds` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `games` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `match_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `verifications` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_friend_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "game_rounds" DROP CONSTRAINT "game_rounds_game_id_fkey";

-- DropForeignKey
ALTER TABLE "game_rounds" DROP CONSTRAINT "game_rounds_winner_id_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_player1_id_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_player2_id_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_winner_id_fkey";

-- DropForeignKey
ALTER TABLE "match_history" DROP CONSTRAINT "match_history_game_id_fkey";

-- DropForeignKey
ALTER TABLE "match_history" DROP CONSTRAINT "match_history_opponent_id_fkey";

-- DropForeignKey
ALTER TABLE "match_history" DROP CONSTRAINT "match_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "verifications" DROP CONSTRAINT "verifications_user_id_fkey";

-- AlterTable
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "friend_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "game_rounds" DROP CONSTRAINT "game_rounds_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "game_id" SET DATA TYPE TEXT,
ALTER COLUMN "winner_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "games" DROP CONSTRAINT "games_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "player1_id" SET DATA TYPE TEXT,
ALTER COLUMN "player2_id" SET DATA TYPE TEXT,
ALTER COLUMN "winner_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "match_history" DROP CONSTRAINT "match_history_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "game_id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "opponent_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "match_history_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "verifications" DROP CONSTRAINT "verifications_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "verifications_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
