import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserForm } from "./UserForm";
import { companiesService } from "@/services/companiesService";
import { profilesService } from "@/services/profilesService";
import { sitesService } from "@/services/sitesService";

const pushMock = jest.fn();

const sessionCompany = {
  id: "company-tst-1",
  razao_social: "Empresa TST",
  cnpj: "00000000000100",
  endereco: "Rua Teste",
  responsavel: "Responsavel",
  status: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    isAdminGeral: false,
    user: {
      id: "tst-user-1",
      nome: "Tecnico TST",
      company_id: "company-tst-1",
      profile: {
        nome: "TST",
      },
    },
  }),
}));

jest.mock("@/services/companiesService", () => ({
  companiesService: {
    findOne: jest.fn(),
  },
}));

jest.mock("@/services/profilesService", () => ({
  profilesService: {
    findAll: jest.fn(),
  },
}));

jest.mock("@/services/sitesService", () => ({
  sitesService: {
    findPaginated: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock("@/services/usersService", () => ({
  UserIdentityType: {
    SYSTEM_USER: "system_user",
    EMPLOYEE_SIGNER: "employee_signer",
  },
  usersService: {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("@/lib/error-handler", () => ({
  handleApiError: jest.fn(),
}));

describe("UserForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    jest.mocked(companiesService.findOne).mockResolvedValue(sessionCompany);
    jest.mocked(profilesService.findAll).mockResolvedValue([
      {
        id: "profile-tst",
        nome: "TST",
        permissoes: ["can_view_sites", "can_manage_users"],
      },
    ]);
    jest.mocked(sitesService.findPaginated).mockResolvedValue({
      data: [
        {
          id: "site-obra-1",
          nome: "Obra Central",
          company_id: "company-tst-1",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      lastPage: 1,
    });
  });

  it("permite TST selecionar obra usando a empresa da sessao", async () => {
    render(<UserForm />);

    const siteCheckbox = await screen.findByRole("checkbox", {
      name: /Obra Central/i,
    });

    await waitFor(() => {
      expect(sitesService.findPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
        companyId: "company-tst-1",
      });
    });

    expect(
      screen.queryByRole("combobox", { name: /Empresa/i }),
    ).not.toBeInTheDocument();
    expect(siteCheckbox).toBeEnabled();
    expect(await screen.findByText("Obra Central")).toBeInTheDocument();

    fireEvent.click(siteCheckbox);

    expect(siteCheckbox).toBeChecked();
  });
});
