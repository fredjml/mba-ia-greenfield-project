import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Video } from '../videos/entities/video.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideos1779000000000 } from './migrations/1779000000000-CreateVideos';
import { createTestDataSource } from '../test/create-test-data-source';

const MANAGED_TABLES = [
  'videos',
  'users',
  'channels',
  'refresh_tokens',
  'verification_tokens',
];
const MANAGED_ENUM_TYPES = [
  'videos_status_enum',
  'verification_tokens_type_enum',
];

describe('Database migrations (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [User, Channel, RefreshToken, VerificationToken, Video],
      {
        synchronize: false,
        migrations: [
          CreateUsersAndChannels1775687773260,
          CreateAuthTokens1777579850478,
          CreateVideos1779000000000,
        ],
      },
    );

    await dataSource.initialize();

    for (const table of MANAGED_TABLES) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    await dataSource.query(`DROP TABLE IF EXISTS "migrations" CASCADE`);

    for (const enumType of MANAGED_ENUM_TYPES) {
      await dataSource.query(`DROP TYPE IF EXISTS "public"."${enumType}"`);
    }
  });

  afterAll(async () => {
    // The second test undoes the last migration, leaving the videos table missing.
    // Re-apply so the shared DB is fully migrated when subsequent suites run.
    await dataSource.runMigrations();
    await dataSource.destroy();
  });

  it('should apply all migrations and create all managed tables', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(3);

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [MANAGED_TABLES],
    );
    const tableNames = result.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'channels',
      'refresh_tokens',
      'users',
      'verification_tokens',
      'videos',
    ]);
  });

  it('should create the video columns and channel-status index', async () => {
    const columns = await dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'videos'
       ORDER BY ordinal_position`,
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'channel_id',
      'title',
      'slug',
      'status',
      'original_bucket',
      'original_key',
      'thumbnail_bucket',
      'thumbnail_key',
      'multipart_upload_id',
      'size_bytes',
      'duration_seconds',
      'metadata',
      'processing_error',
      'created_at',
      'updated_at',
    ]);

    const indexes = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'videos'`,
    );
    expect(
      indexes.some(({ indexdef }) => indexdef.includes('(channel_id, status)')),
    ).toBe(true);
  });

  it('should revert the videos migration and remove the videos table', async () => {
    await dataSource.undoLastMigration();

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['videos']],
    );
    expect(result).toHaveLength(0);
  });
});
