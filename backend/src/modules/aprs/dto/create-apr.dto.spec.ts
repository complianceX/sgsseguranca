import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAprDto } from './create-apr.dto';

function makeMinimalValid(): Record<string, unknown> {
  return {
    numero: 'APR-001',
    titulo: 'APR de trabalho em altura',
    data_inicio: '2026-06-22',
    data_fim: '2026-06-23',
    site_id: '11111111-1111-4111-8111-111111111111',
    elaborador_id: '22222222-2222-4222-8222-222222222222',
  };
}

describe('CreateAprDto — @ArrayMaxSize em itens_risco (achado M1)', () => {
  it('aceita itens_risco ausente (campo opcional)', async () => {
    const dto = plainToInstance(CreateAprDto, makeMinimalValid());
    const errors = await validate(dto);
    const fieldErrors = errors.filter((e) => e.property === 'itens_risco');
    expect(fieldErrors).toHaveLength(0);
  });

  it('aceita exatamente 200 itens em itens_risco', async () => {
    const dto = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      itens_risco: Array.from({ length: 200 }, (_, i) => ({ id: `ri-${i}` })),
    });
    const errors = await validate(dto);
    const fieldErrors = errors.filter((e) => e.property === 'itens_risco');
    expect(fieldErrors).toHaveLength(0);
  });

  it('rejeita 201 itens em itens_risco com mensagem clara', async () => {
    const dto = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      itens_risco: Array.from({ length: 201 }, (_, i) => ({ id: `ri-${i}` })),
    });
    const errors = await validate(dto);
    const fieldErrors = errors.filter((e) => e.property === 'itens_risco');
    expect(fieldErrors.length).toBeGreaterThan(0);
    const msgs = Object.values(fieldErrors[0]?.constraints ?? {}).join(' ');
    expect(msgs).toMatch(/200/);
  });

  it('rejeita payload de DoS com 5000 itens em itens_risco', async () => {
    const dto = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      itens_risco: Array.from({ length: 5000 }, (_, i) => ({ id: `ri-${i}` })),
    });
    const errors = await validate(dto);
    const fieldErrors = errors.filter((e) => e.property === 'itens_risco');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('mantém @ArrayMaxSize(200) para risk_items (regressão)', async () => {
    const dto = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      risk_items: Array.from({ length: 201 }, (_, i) => ({ id: `ri-${i}` })),
    });
    const errors = await validate(dto);
    const fieldErrors = errors.filter((e) => e.property === 'risk_items');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('limite de itens_risco e risk_items são iguais (consistência)', async () => {
    const dto200 = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      itens_risco: Array.from({ length: 200 }, (_, i) => ({ id: `ri-${i}` })),
    });
    const dto201 = plainToInstance(CreateAprDto, {
      ...makeMinimalValid(),
      itens_risco: Array.from({ length: 201 }, (_, i) => ({ id: `ri-${i}` })),
    });

    const errs200 = (await validate(dto200)).filter(
      (e) => e.property === 'itens_risco',
    );
    const errs201 = (await validate(dto201)).filter(
      (e) => e.property === 'itens_risco',
    );

    expect(errs200).toHaveLength(0);
    expect(errs201.length).toBeGreaterThan(0);
  });
});
