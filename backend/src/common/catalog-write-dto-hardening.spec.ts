import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEpiDto } from '../epis/dto/create-epi.dto';
import { CreateMachineDto } from '../machines/dto/create-machine.dto';
import { CreateToolDto } from '../tools/dto/create-tool.dto';
import { CreateRiskDto } from '../risks/dto/create-risk.dto';
import { CreateSiteDto } from '../sites/dto/create-site.dto';

type DtoCtor<T extends object> = new () => T;

async function validatePayload<T extends object>(
  dto: DtoCtor<T>,
  payload: Record<string, unknown>,
) {
  return validate(plainToInstance(dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('Catalog write DTO hardening', () => {
  it.each([
    ['EPI', CreateEpiDto, { nome: 'Capacete' }],
    ['Máquina', CreateMachineDto, { nome: 'Guindaste' }],
    ['Ferramenta', CreateToolDto, { nome: 'Parafusadeira' }],
    ['Risco', CreateRiskDto, { nome: 'Queda', categoria: 'Operacional' }],
    ['Obra/Setor', CreateSiteDto, { nome: 'Mina Norte' }],
  ])(
    'aceita criação de %s sem company_id no payload',
    async (_name, dto, payload) => {
      const errors = await validatePayload(dto, payload);

      expect(errors).toHaveLength(0);
    },
  );

  it.each([
    ['EPI', CreateEpiDto, { nome: 'Capacete' }],
    ['Máquina', CreateMachineDto, { nome: 'Guindaste' }],
    ['Ferramenta', CreateToolDto, { nome: 'Parafusadeira' }],
    ['Risco', CreateRiskDto, { nome: 'Queda', categoria: 'Operacional' }],
    ['Obra/Setor', CreateSiteDto, { nome: 'Mina Norte' }],
  ])(
    'rejeita company_id forjado na criação de %s',
    async (_name, dto, payload) => {
      const errors = await validatePayload(dto, {
        ...payload,
        company_id: '11111111-1111-4111-8111-111111111111',
      });

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'company_id',
          }),
        ]),
      );
    },
  );
});
