import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplaceDdsSignaturesDto } from './replace-dds-signatures.dto';

function makeSignature(userId = '11111111-1111-4111-8111-111111111111') {
  return {
    user_id: userId,
    signature_data: 'data:image/png;base64,abc',
    type: 'digital',
  };
}

function makePhoto() {
  return {
    imageData: 'data:image/jpeg;base64,/9j/abc',
    capturedAt: new Date().toISOString(),
    hash: 'a'.repeat(64),
    metadata: { userAgent: 'Mozilla/5.0' },
  };
}

describe('ReplaceDdsSignaturesDto — limites de array (achado M1)', () => {
  describe('participant_signatures', () => {
    it('aceita exatamente 60 assinaturas', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: Array.from({ length: 60 }, (_, i) =>
          makeSignature(
            `${String(i + 1).padStart(8, '1')}-1111-4111-8111-111111111111`,
          ),
        ),
      });
      const errors = await validate(dto);
      const sigErrors = errors.filter(
        (e) => e.property === 'participant_signatures',
      );
      expect(sigErrors).toHaveLength(0);
    });

    it('rejeita 61 assinaturas com mensagem clara', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: Array.from({ length: 61 }, (_, i) =>
          makeSignature(
            `${String(i + 1).padStart(8, '1')}-1111-4111-8111-111111111111`,
          ),
        ),
      });
      const errors = await validate(dto);
      const sigErrors = errors.filter(
        (e) => e.property === 'participant_signatures',
      );
      expect(sigErrors.length).toBeGreaterThan(0);
      const constraints = sigErrors[0]?.constraints ?? {};
      const messages = Object.values(constraints).join(' ');
      expect(messages).toMatch(/60/);
    });

    it('rejeita 100 assinaturas (potencial DoS)', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: Array.from({ length: 100 }, (_, i) =>
          makeSignature(
            `${String(i + 1).padStart(8, '1')}-1111-4111-8111-111111111111`,
          ),
        ),
      });
      const errors = await validate(dto);
      const sigErrors = errors.filter(
        (e) => e.property === 'participant_signatures',
      );
      expect(sigErrors.length).toBeGreaterThan(0);
    });
  });

  describe('team_photos', () => {
    it('aceita exatamente 10 fotos', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: [makeSignature()],
        team_photos: Array.from({ length: 10 }, makePhoto),
      });
      const errors = await validate(dto);
      const photoErrors = errors.filter((e) => e.property === 'team_photos');
      expect(photoErrors).toHaveLength(0);
    });

    it('rejeita 11 fotos com mensagem clara', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: [makeSignature()],
        team_photos: Array.from({ length: 11 }, makePhoto),
      });
      const errors = await validate(dto);
      const photoErrors = errors.filter((e) => e.property === 'team_photos');
      expect(photoErrors.length).toBeGreaterThan(0);
      const constraints = photoErrors[0]?.constraints ?? {};
      const messages = Object.values(constraints).join(' ');
      expect(messages).toMatch(/10/);
    });

    it('aceita ausência de fotos (campo opcional)', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: [makeSignature()],
      });
      const errors = await validate(dto);
      const photoErrors = errors.filter((e) => e.property === 'team_photos');
      expect(photoErrors).toHaveLength(0);
    });

    it('rejeita 50 fotos (potencial DoS de memória)', async () => {
      const dto = plainToInstance(ReplaceDdsSignaturesDto, {
        participant_signatures: [makeSignature()],
        team_photos: Array.from({ length: 50 }, makePhoto),
      });
      const errors = await validate(dto);
      const photoErrors = errors.filter((e) => e.property === 'team_photos');
      expect(photoErrors.length).toBeGreaterThan(0);
    });
  });
});
