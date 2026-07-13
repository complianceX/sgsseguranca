import {
  findAprActivityTemplate,
  resolveAprActivityTemplateType,
} from './apr-activity-templates.catalog';

describe('APR activity template catalog', () => {
  it('mantém compatibilidade com o identificador legado de manutenção elétrica', () => {
    expect(resolveAprActivityTemplateType('manutencao_eletrica')).toBe(
      'eletrica',
    );
  });

  it('resolve rótulos legados de instalações elétricas para o template canônico', () => {
    const template = findAprActivityTemplate(
      'Instalações elétricas prediais e infraestrutura',
    );

    expect(template?.tipo_atividade).toBe('eletrica');
  });
});
