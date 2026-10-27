import { PGlite, types } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createDbWith, pgBackend } from './pg-backend.js';
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
export const createDb = () => createDbWith(PGlite, types, read('../supabase/schema.sql'), [read('../supabase/fire.sql')]);
export { pgBackend };
