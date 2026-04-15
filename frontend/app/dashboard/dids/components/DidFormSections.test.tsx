import { fireEvent, render, screen } from '@testing-library/react';
import {
  DidContextSection,
  DidFormPageShell,
  DidParticipantsSection,
} from './DidFormSections';

describe('DidFormSections', () => {
  it('exibe estado visual de leitura no shell do formulário', () => {
    render(
      <DidFormPageShell
        id="did-1"
        isReadOnly
        readOnlyMessage="Este Diálogo do Início do Dia já possui PDF final governado e não aceita edição."
        currentStatus="executado"
        selectedTurno="manha"
        selectedCompanyName="Empresa Teste"
        selectedSiteName="Obra Norte"
        participantCount={3}
        selectedMainActivity="Montagem da linha"
        selectedTitle="DID Operacional"
        onBack={jest.fn()}
        saving={false}
        isSubmitting={false}
        footer={<div>Rodapé do formulário</div>}
      >
        <div>Conteúdo interno</div>
      </DidFormPageShell>,
    );

    expect(screen.getByText('Documento travado para edição')).toBeInTheDocument();
    expect(
      screen.getByText(/já possui PDF final governado/i),
    ).toBeInTheDocument();
    expect(screen.getByText('3 participante(s)')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo interno')).toBeInTheDocument();
    expect(screen.getByText('Rodapé do formulário')).toBeInTheDocument();
  });

  it('renderiza o contexto básico do DID com selects de empresa e site', () => {
    const register = jest.fn((name: string) => ({ name }));

    render(
      <DidContextSection
        register={register}
        errors={{}}
        companies={[{ id: 'company-1', razao_social: 'Empresa Teste' }]}
        filteredSites={[{ id: 'site-1', nome: 'Obra Norte' }]}
        filteredUsers={[{ id: 'user-1', nome: 'Responsável' }]}
        selectedCompanyId="company-1"
        handleCompanyChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Empresa')).toBeInTheDocument();
    expect(screen.getByLabelText('Site / frente')).toBeInTheDocument();
    expect(screen.getByLabelText('Responsável')).toBeInTheDocument();
    expect(screen.getByText('Use um título curto que identifique o DID com facilidade.')).toBeInTheDocument();
  });

  it('aciona o callback ao selecionar participante e atualiza o estado visual recebido via props', () => {
    const toggleParticipant = jest.fn();

    const { rerender } = render(
      <DidParticipantsSection
        selectedCompanyId="company-1"
        filteredUsers={[{ id: 'user-2', nome: 'Equipe Campo' }]}
        selectedParticipantIds={[]}
        toggleParticipant={toggleParticipant}
      />,
    );

    expect(screen.getByText('0 selecionado(s)')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Equipe Campo: participante disponível/i,
      }),
    );

    expect(toggleParticipant).toHaveBeenCalledWith('user-2');

    rerender(
      <DidParticipantsSection
        selectedCompanyId="company-1"
        filteredUsers={[{ id: 'user-2', nome: 'Equipe Campo' }]}
        selectedParticipantIds={['user-2']}
        toggleParticipant={toggleParticipant}
      />,
    );

    expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();
    expect(
      screen.getByText('Participante incluído na equipe deste DID'),
    ).toBeInTheDocument();
  });
});
