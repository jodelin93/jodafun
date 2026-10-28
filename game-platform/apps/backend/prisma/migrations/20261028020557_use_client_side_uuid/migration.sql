-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "friendships" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "game_rounds" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "games" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "match_history" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "verifications" ALTER COLUMN "id" DROP DEFAULT;
