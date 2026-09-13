import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1779000000000 implements MigrationInterface {
  name = 'CreateVideos1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."videos_status_enum" AS ENUM('draft', 'upload_initiated', 'uploaded', 'processing', 'ready', 'error', 'upload_aborted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "title" character varying(120) NOT NULL, "slug" character varying(80) NOT NULL, "status" "public"."videos_status_enum" NOT NULL DEFAULT 'draft', "original_bucket" character varying(63) NOT NULL, "original_key" character varying(1024) NOT NULL, "thumbnail_bucket" character varying(63), "thumbnail_key" character varying(1024), "multipart_upload_id" character varying(256), "size_bytes" bigint, "duration_seconds" integer, "metadata" jsonb, "processing_error" character varying(255), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_885515ecd9cb4d0513728c34331" UNIQUE ("slug"), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_41e6b695e308819550604a5c0b" ON "videos" ("channel_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_4d5e96a492a3d8a83b3f283d535" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_4d5e96a492a3d8a83b3f283d535"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_41e6b695e308819550604a5c0b"`,
    );
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "public"."videos_status_enum"`);
  }
}
