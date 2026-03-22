# PDFs Finais e Storage Oficial

## Resumo rapido

Hoje, o PDF final oficial dos modulos aderentes ao pipeline governado fica no storage de objetos configurado no backend.

Em producao, esse storage oficial esta apontado para o Cloudflare R2.

O banco nao guarda o PDF em si. O banco guarda a referencia do artefato oficial, normalmente em campos como:

- `pdf_file_key`
- `pdf_folder_path`
- `pdf_original_name`

O acesso ao arquivo acontece por URL assinada gerada pelo backend.

## Onde isso e controlado

Camada central:

- `backend/src/common/services/document-storage.service.ts`
- `backend/src/document-registry/document-governance.service.ts`
- `backend/src/document-registry/document-registry.service.ts`

Responsabilidade de cada parte:

- `DocumentStorageService`: upload, download, signed URL e delete do artefato no storage
- `DocumentGovernanceService`: registro governado do documento final, hash e trilha forense
- `DocumentRegistryService`: indice consultavel dos documentos oficiais

## Regra atual importante

Documento final oficial deve ficar no storage oficial.

Nao e mais aceitavel tratar:

- referencia local
- fallback degradado
- ou registro sem upload real

como se fosse documento final oficial.

## Modulos que usam PDF final governado

Os modulos abaixo ja estao no caminho governado de PDF final:

- APR
- PT
- DDS
- RDO
- Relatorio de Inspecao
- Checklist
- CAT
- Nao Conformidade
- Auditoria

Em todos eles, o fluxo esperado e:

1. gerar ou receber o arquivo PDF final
2. subir o arquivo para o storage oficial
3. registrar governanca documental
4. persistir `pdf_file_key` e metadados relacionados
5. servir acesso por signed URL

## Endurecimento recente

Foi endurecida a regra para impedir que documento final oficial seja registrado sem storage real nos pontos que ainda permitiam essa brecha.

Agora:

- APR falha explicitamente se o storage governado estiver indisponivel
- PT falha explicitamente se o storage governado estiver indisponivel
- DDS falha explicitamente se o storage governado estiver indisponivel
- Auditoria falha explicitamente se o storage governado estiver indisponivel

Isso remove a possibilidade de registrar "referencia local" como se fosse PDF final oficial nesses modulos.

## Excecoes e observacoes honestas

- O sistema ainda pode retornar `registered_without_signed_url` quando o arquivo existe no storage, mas a URL assinada nao puder ser emitida naquele momento
- Isso nao significa fallback local; significa que o documento esta registrado, mas o acesso seguro temporario falhou
- Evidencias de imagem e alguns anexos nao finais podem ter politicas diferentes de fallback, mas isso nao deve ser confundido com PDF final oficial

## Como saber se um documento realmente tem PDF oficial

Indicadores comuns:

- existe `pdf_file_key`
- existe entrada no registry documental
- o contrato de acesso retorna `hasFinalPdf: true`
- o backend consegue gerar signed URL ou informa indisponibilidade temporaria de URL

## Onde olhar por modulo

- APR: `backend/src/aprs/aprs.service.ts`
- PT: `backend/src/pts/pts.service.ts`
- DDS: `backend/src/dds/dds.service.ts`
- RDO: `backend/src/rdos/rdos.service.ts`
- Inspecao: `backend/src/inspections/inspections.service.ts`
- Checklist: `backend/src/checklists/checklists.service.ts`
- CAT: `backend/src/cats/cats.service.ts`
- Nao Conformidade: `backend/src/nonconformities/nonconformities.service.ts`
- Auditoria: `backend/src/audits/audits.service.ts`

## Operacao em producao

As credenciais do storage nao devem ficar no repositorio.

Elas devem ficar apenas nas variaveis de ambiente do servico backend.

No ambiente atual, a configuracao do storage oficial esta no Railway, e o bucket oficial esta no Cloudflare R2.

## Regra pratica para manutencao

Se um modulo emitir PDF final oficial, ele deve:

- usar `DocumentStorageService`
- registrar o documento em `DocumentGovernanceService`
- persistir `pdf_file_key`
- expor contrato explicito de disponibilidade

Se um fluxo de PDF final ainda tentar salvar "localmente" ou simular arquivo oficial sem upload real, isso deve ser tratado como divida ou bug, nao como comportamento valido.
