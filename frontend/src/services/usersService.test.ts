import api from "@/lib/api";
import { fetchAllPages } from "@/services/pagination";
import {
  usersService,
  UserAccessStatus,
  UserIdentityType,
} from "@/services/usersService";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/services/pagination", () => ({
  fetchAllPages: jest.fn(),
}));

const mockUser = {
  id: "user-1",
  nome: "Joao Silva",
  email: "joao@example.com",
  cpf: "12345678900",
  role: "TST",
  company_id: "company-1",
  site_id: "site-1",
  profile_id: "profile-1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const mockPaginatedResponse = {
  data: [mockUser],
  page: 1,
  limit: 20,
  total: 1,
  lastPage: 1,
};

describe("usersService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("busca usuarios com paginacao padrao", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    const result = await usersService.findPaginated();

    expect(api.get).toHaveBeenCalledWith("/users", {
      params: { page: 1, limit: 20 },
      headers: {},
    });
    expect(result).toEqual(mockPaginatedResponse);
  });

  it("envia companyId no header tenant-scoped e nao como query param", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await usersService.findPaginated({
      page: 2,
      limit: 50,
      search: "Joao",
      companyId: "company-2",
      siteId: "site-2",
    });

    expect(api.get).toHaveBeenCalledWith("/users", {
      params: {
        page: 2,
        limit: 50,
        search: "Joao",
        site_id: "site-2",
      },
      headers: { "x-company-id": "company-2" },
    });
  });

  it("limita paginação ao teto aceito pelo backend", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await usersService.findPaginated({
      page: 1,
      limit: 200,
      companyId: "company-2",
    });

    expect(api.get).toHaveBeenCalledWith("/users", {
      params: {
        page: 1,
        limit: 100,
      },
      headers: { "x-company-id": "company-2" },
    });
  });

  it("carrega usuario com tenant no header quando informado", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockUser });

    await usersService.findOne("user-1", "company-2");

    expect(api.get).toHaveBeenCalledWith("/users/user-1", {
      headers: { "x-company-id": "company-2" },
    });
  });

  it("envia filtros semanticos de identidade e acesso", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await usersService.findPaginated({
      identityType: UserIdentityType.EMPLOYEE_SIGNER,
      accessStatus: UserAccessStatus.NO_LOGIN,
    });

    expect(api.get).toHaveBeenCalledWith("/users", {
      params: {
        page: 1,
        limit: 20,
        identity_type: "employee_signer",
        access_status: "no_login",
      },
      headers: {},
    });
  });

  it("findAll preserva companyId para o fetch paginado", async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([mockUser]);

    const result = await usersService.findAll("company-1", "site-1");

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        maxPages: 500,
        batchSize: 3,
        cacheKey:
          "GET:/users?page=*&limit=100&company_id=company-1&site_id=site-1",
      }),
    );
    expect(result).toEqual([mockUser]);
  });

  it("cria usuario com tenant no header e sem company_id no payload", async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: mockUser });

    await usersService.create({
      nome: "Bruno",
      cpf: "09878058433",
      company_id: "company-1",
      site_id: "site-1",
      profile_id: "profile-1",
    });

    expect(api.post).toHaveBeenCalledWith(
      "/users",
      {
        nome: "Bruno",
        cpf: "09878058433",
        site_id: "site-1",
        profile_id: "profile-1",
      },
      { headers: { "x-company-id": "company-1" } },
    );
  });

  it("atualiza usuario com tenant no header e sem company_id no payload", async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: mockUser });

    await usersService.update("user-1", {
      nome: "Bruno Goncalves Soares",
      cpf: "09878058433",
      company_id: "company-1",
      site_id: "site-2",
    });

    expect(api.patch).toHaveBeenCalledWith(
      "/users/user-1",
      {
        nome: "Bruno Goncalves Soares",
        cpf: "09878058433",
        site_id: "site-2",
      },
      { headers: { "x-company-id": "company-1" } },
    );
  });

  it("carrega catálogo de módulos liberáveis", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        modules: [
          {
            key: "trainings",
            label: "Treinamentos",
            description: "Libera treinamentos.",
            permissions: ["can_view_trainings", "can_manage_trainings"],
          },
        ],
      },
    });

    const result = await usersService.getModuleAccessOptions();

    expect(api.get).toHaveBeenCalledWith("/users/module-access-options");
    expect(result.modules).toHaveLength(1);
  });

  it("atualiza módulos do usuário com step-up token", async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: mockUser });

    await usersService.updateModuleAccess(
      "user-1",
      ["trainings", "medical-exams"],
      "step-up-token-abc",
      "company-1",
    );

    expect(api.patch).toHaveBeenCalledWith(
      "/users/user-1/module-access",
      { module_keys: ["trainings", "medical-exams"] },
      {
        headers: {
          "x-step-up-token": "step-up-token-abc",
          "x-company-id": "company-1",
        },
      },
    );
  });
});
