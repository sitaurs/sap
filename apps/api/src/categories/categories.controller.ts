import { Controller, Get, Inject } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { CategoryId } from '../scans/scan.types.js';

type CategoryRow = { id: CategoryId; name: string };

@Controller('categories')
export class CategoriesController {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  @Get()
  async listCategories(): Promise<{ items: CategoryRow[]; nextCursor: null }> {
    const rows = await this.sql<CategoryRow[]>`
      SELECT id, name_id AS name
      FROM categories
      WHERE active = true
      ORDER BY sort_order, id
    `;
    return { items: rows, nextCursor: null };
  }
}
