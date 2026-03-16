import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { InspectionResponseDto } from './inspection-response.dto';

describe('InspectionResponseDto', () => {
  it('exposes company summary when relation data is loaded', () => {
    const dto = plainToInstance(
      InspectionResponseDto,
      {
        id: 'inspection-1',
        company_id: 'company-1',
        company: {
          id: 'company-1',
          razao_social: 'Gandra Tecnologia',
          cnpj: '00.000.000/0001-00',
        },
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.company).toEqual({
      id: 'company-1',
      razao_social: 'Gandra Tecnologia',
    });
  });
});
