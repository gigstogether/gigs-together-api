/**
 * Migrations (ts-migrate-mongoose):
 * - npm run migrate:up — apply pending migrations
 * - npm run migrate:up:dry — sets DRY_RUN=true and applies pending migrations
 * (make sure to write the actual code for dry running - it's not an automatic action!)
 *
 * Migrations that need extra input read env from .env / the shell.
 * Example: GIG_POST_DATE_EXPORT_PATH=path/to/a.json,path/to/b.json
 */
import * as dotenv from 'dotenv';

dotenv.config();

const { MONGO_URI } = process.env;

export default {
  uri: MONGO_URI,
  templatePath: './migrations/template.ts',
  autosync: true,
};
