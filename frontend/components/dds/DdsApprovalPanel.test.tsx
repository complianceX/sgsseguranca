import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import type { Dds, DdsApprovalFlow } from "@/services/ddsService";
import { ddsService } from "@/services/ddsService";
import { DdsApprovalPanel } from "./DdsApprovalPanel";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock("@/services/ddsService", () => ({
  ddsService: {
    getApprovalFlow: jest.fn(),
    initializeApprovalFlow: jest.fn(),
    approveApprovalStep: jest.fn(),
    rejectApprovalStep: jest.fn(),
    reopenApprovalFlow: jest.fn(),
    findOne: jest.fn(),
  },
}));

const mockDds: Dds = {
  id: "dds-1",
  company_id: "company-1",
  status: "publicado",
  is_modelo: false,
  tema: "DDS Teste",
  data: "2026-05-04",
  site_id: "site-1",
  facilitador_id: "user-1",
  participants: [],
  participant_count: 0,
  conteudo: "Conteúdo do DDS",
  created_at: "2026-05-04T10:00:00Z",
  updated_at: "2026-05-04T10:00:00Z",
  approval_flow: null,
  pdf_file_key: null,
} as Dds;

const mockFlowNotStarted: DdsApprovalFlow = {
  status: "not_started",
  activeCycle: null,
  currentStep: null,
  steps: [],
  events: [],
};

const mockFlowPending: DdsApprovalFlow = {
  status: "pending",
  activeCycle: 1,
  currentStep: {
    level_order: 1,
    title: "Aprovação técnica",
    approver_role: "Técnico",
    status: "pending",
    pending_record_id: "record-1",
    event_hash: "hash-1",
    actor_signature_hash: null,
    actor_signature_signed_at: null,
    actor_signature_timestamp_authority: null,
    decision_reason: null,
  },
  steps: [
    {
      level_order: 1,
      title: "Aprovação técnica",
      approver_role: "Técnico",
      status: "pending",
      pending_record_id: "record-1",
      event_hash: "hash-1",
      actor_signature_hash: null,
      actor_signature_signed_at: null,
      actor_signature_timestamp_authority: null,
      decision_reason: null,
    },
  ],
  events: [],
};

const mockFlowRejected: DdsApprovalFlow = {
  status: "rejected",
  activeCycle: 1,
  currentStep: null,
  steps: [
    {
      level_order: 1,
      title: "Aprovação técnica",
      approver_role: "Técnico",
      status: "rejected",
      pending_record_id: "record-1",
      event_hash: "hash-1",
      actor_signature_hash: null,
      actor_signature_signed_at: null,
      actor_signature_timestamp_authority: null,
      decision_reason: "Dados insuficientes",
    },
  ],
  events: [
    {
      id: "event-1",
      cycle: 1,
      level_order: 1,
      action: "rejected",
      event_at: "2026-05-04T10:30:00Z",
      actor_user_id: "user-2",
      actor: { id: "user-2", nome: "João Silva" },
      decided_ip: "192.168.1.1",
      event_hash: "hash-1",
      previous_event_hash: null,
      actor_signature_hash: null,
      actor_signature_signed_at: null,
      actor_signature_timestamp_authority: null,
    },
  ],
};

describe("DdsApprovalPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowNotStarted,
    );
  });

  it("renderiza botão 'Iniciar aprovação' quando status = 'not_started'", async () => {
    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowNotStarted,
    );

    render(
      <DdsApprovalPanel
        dds={mockDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Iniciar aprovação")).toBeInTheDocument();
    });

    const initButton = screen.getByText("Iniciar aprovação");
    expect(initButton).not.toBeDisabled();
  });

  it("renderiza botões Aprovar/Reprovar quando status = 'pending'", async () => {
    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowPending,
    );

    render(
      <DdsApprovalPanel
        dds={mockDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Aprovar etapa")).toBeInTheDocument();
    });

    expect(screen.getByText("Reprovar")).toBeInTheDocument();
    expect(screen.getByText("Aprovar etapa")).not.toBeDisabled();
  });

  it("renderiza botão 'Reabrir ciclo' quando status = 'rejected'", async () => {
    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowRejected,
    );

    render(
      <DdsApprovalPanel
        dds={mockDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Reabrir ciclo")).toBeInTheDocument();
    });

    const reopenButton = screen.getByText("Reabrir ciclo");
    expect(reopenButton).not.toBeDisabled();
  });

  it("não renderiza ações para DDS modelo (is_modelo=true)", async () => {
    const modelDds = { ...mockDds, is_modelo: true };

    render(
      <DdsApprovalPanel
        dds={modelDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Modelos não possuem aprovação operacional/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Iniciar aprovação")).not.toBeInTheDocument();
  });

  it("não renderiza ações para DDS auditado (status='auditado')", async () => {
    const auditedDds = { ...mockDds, status: "auditado" as const };

    render(
      <DdsApprovalPanel
        dds={auditedDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/DDS auditado: aprovação concluída/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Iniciar aprovação")).not.toBeInTheDocument();
  });

  it("chama onDdsChanged após aprovação bem-sucedida", async () => {
    const onDdsChanged = jest.fn();
    const updatedDds = { ...mockDds, status: "auditado" as const };

    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowPending,
    );
    (ddsService.approveApprovalStep as jest.Mock).mockResolvedValue(
      mockFlowRejected,
    );
    (ddsService.findOne as jest.Mock).mockResolvedValue(updatedDds);

    render(
      <DdsApprovalPanel dds={mockDds} canManage={true} onDdsChanged={onDdsChanged} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Aprovar etapa")).toBeInTheDocument();
    });

    const pinInput = screen.getByPlaceholderText(
      "PIN de assinatura do aprovador (4 a 6 dígitos)",
    ) as HTMLInputElement;
    const approveButton = screen.getByText("Aprovar etapa");

    fireEvent.change(pinInput, { target: { value: "123456" } });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(onDdsChanged).toHaveBeenCalledWith(updatedDds);
    });
  });

  it("exibe toast de erro se API falhar", async () => {
    const errorMessage = "Erro ao aprovar etapa";
    (ddsService.getApprovalFlow as jest.Mock).mockResolvedValue(
      mockFlowPending,
    );
    (ddsService.approveApprovalStep as jest.Mock).mockRejectedValue(
      new Error(errorMessage),
    );

    render(
      <DdsApprovalPanel
        dds={mockDds}
        canManage={true}
        onDdsChanged={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Aprovar etapa")).toBeInTheDocument();
    });

    const pinInput = screen.getByPlaceholderText(
      "PIN de assinatura do aprovador (4 a 6 dígitos)",
    ) as HTMLInputElement;
    const approveButton = screen.getByText("Aprovar etapa");

    fireEvent.change(pinInput, { target: { value: "123456" } });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível aprovar a etapa atual.",
      );
    });
  });
});
