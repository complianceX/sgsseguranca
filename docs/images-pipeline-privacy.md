# Pipeline de imagens: limites e privacidade

Todas as fotos selecionadas no checklist e no relatório fotográfico passam pelo pipeline de `src/lib/images/process-mobile-image.ts` antes de armazenamento ou upload.

## Segurança de memória

- São aceitos somente JPEG, PNG e WebP, com validação do cabeçalho (magic bytes), não apenas do MIME informado pelo navegador.
- Largura, altura e total de pixels são lidos do arquivo antes do decode. Arquivos acima de `maxDimension` ou `maxPixels` são rejeitados antes que o navegador aloque o bitmap, mitigando decompression bombs/OOM.
- Onde `createImageBitmap` está disponível, `resizeWidth`/`resizeHeight` reduzem a imagem durante o decode. O fallback mantém concorrência limitada.
- Processamento em lote tem concorrência limitada e o resultado preserva a ordem da seleção, mesmo quando decodes terminam fora de ordem.

## Quota e resiliência

- O limite offline considera o tamanho do Data URL já expandido em base64, e também um limite agregado das fotos existentes e novas.
- Falhas parciais não descartam sucessos anteriores.
- Anexos de checklist são enviados sequencialmente, no máximo cinco por lote, para respeitar o throttle do backend.
- Gerações e retries possuem identidade própria. Resultado cancelado, removido, desmontado ou obsoleto não atualiza estado nem cria preview.

## EXIF e privacidade

A saída é sempre re-encoded em canvas (JPEG/WebP), em vez de copiar os bytes originais. Isso remove intencionalmente metadados EXIF/IPTC/XMP, inclusive GPS, modelo/serial do aparelho e data/hora original. A orientação EXIF é aplicada durante o decode quando suportada, mas o metadado em si não é preservado.

Consequência: não use o arquivo processado quando metadados forenses forem requisito legal. Nesse caso deve existir um fluxo governado específico, com consentimento, retenção e controle de acesso próprios; o pipeline padrão prioriza minimização de dados pessoais.
