-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMPTZ(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_attachments" (
    "post_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "post_attachments_pkey" PRIMARY KEY ("post_id","file_id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("message_id","file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_uploaded_by_id_status_created_at_idx" ON "files"("uploaded_by_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "files_status_created_at_idx" ON "files"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_id_organization_id_key" ON "files"("id", "organization_id");

-- CreateIndex
CREATE INDEX "post_attachments_file_id_idx" ON "post_attachments"("file_id");

-- CreateIndex
CREATE INDEX "message_attachments_file_id_idx" ON "message_attachments"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_id_organization_id_key" ON "messages"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_organization_id_fkey" FOREIGN KEY ("post_id", "organization_id") REFERENCES "posts"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_file_id_organization_id_fkey" FOREIGN KEY ("file_id", "organization_id") REFERENCES "files"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_organization_id_fkey" FOREIGN KEY ("message_id", "organization_id") REFERENCES "messages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_organization_id_fkey" FOREIGN KEY ("file_id", "organization_id") REFERENCES "files"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;
