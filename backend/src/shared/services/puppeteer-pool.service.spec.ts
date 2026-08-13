/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { mkdtemp, rm } from 'fs/promises';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { loadPuppeteer } from './puppeteer-runtime';

jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  rm: jest.fn(),
}));

// O Puppeteer 25 é ESM puro e não pode ser carregado por `require` num backend
// CommonJS — importá-lo aqui derruba a suíte inteira com
// "SyntaxError: Unexpected token 'export'". O serviço acessa a biblioteca
// exclusivamente por `loadPuppeteer()`, então é esse o ponto que se programa.
jest.mock('./puppeteer-runtime', () => ({
  loadPuppeteer: jest.fn(),
}));

describe('PuppeteerPoolService', () => {
  const originalEnv = process.env;

  const launch = jest.fn();
  const executablePath = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
    };
    (
      loadPuppeteer as jest.MockedFunction<typeof loadPuppeteer>
    ).mockResolvedValue({ launch, executablePath });
    (mkdtemp as jest.MockedFunction<typeof mkdtemp>).mockResolvedValue(
      '/tmp/sgs-pdf-chromium-test',
    );
    (rm as jest.MockedFunction<typeof rm>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('lança o Chromium com diretório temporário e variáveis seguras de runtime', async () => {
    const service = new PuppeteerPoolService();
    const browser = {
      process: jest.fn(() => ({ pid: 1234 })),
    } as never;
    launch.mockResolvedValue(browser);

    const result = await service['launchBrowser']();

    expect(result).toEqual({
      browser,
      userDataDir: '/tmp/sgs-pdf-chromium-test',
    });
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/usr/bin/chromium',
        headless: true,
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-crash-reporter',
          '--disable-features=Crashpad,TranslateUI,BlinkGenPropertyTrees',
          '--user-data-dir=/tmp/sgs-pdf-chromium-test',
          '--data-path=/tmp/sgs-pdf-chromium-test',
          '--disk-cache-dir=/tmp/sgs-pdf-chromium-test',
          '--crash-dumps-dir=/tmp/sgs-pdf-chromium-test',
        ]),
        env: expect.objectContaining({
          HOME: expect.any(String),
          XDG_CONFIG_HOME: expect.any(String),
          XDG_CACHE_HOME: expect.any(String),
        }),
      }),
    );
  });

  it('limpa o diretório temporário quando o launch falha', async () => {
    const service = new PuppeteerPoolService();
    launch.mockRejectedValue(new Error('launch failed'));

    await expect(service['launchBrowser']()).rejects.toThrow('launch failed');

    expect(rm).toHaveBeenCalledWith('/tmp/sgs-pdf-chromium-test', {
      recursive: true,
      force: true,
    });
  });

  it('usa o executablePath resolvido pelo Puppeteer quando a env não está definida', async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;

    const service = new PuppeteerPoolService();
    const browser = {
      process: jest.fn(() => ({ pid: 5678 })),
    } as never;

    // `executablePath()` passou a devolver Promise<string> no Puppeteer 25.
    executablePath.mockResolvedValue(
      '/workspace/backend/.cache/puppeteer/chrome/linux/chrome',
    );
    launch.mockResolvedValue(browser);

    await service['launchBrowser']();

    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath:
          '/workspace/backend/.cache/puppeteer/chrome/linux/chrome',
      }),
    );
  });
});
