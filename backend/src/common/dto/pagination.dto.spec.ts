import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('accepts a valid company_id filter alongside page and limit', () => {
    const dto = plainToInstance(PaginationDto, {
      page: '1',
      limit: '100',
      company_id: '11111111-1111-4111-8111-111111111111',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
    expect(dto.company_id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
