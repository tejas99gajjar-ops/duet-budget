import { PGlite, types } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createDbWith, pgBackend } from './pg-backend.js';
export const createDb = () => createDbWith(PGlite, types, readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
export { pgBackend };
