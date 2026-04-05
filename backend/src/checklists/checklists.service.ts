import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Scope,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  FindOptionsSelect,
  DeepPartial,
  IsNull,
} from 'typeorm';
import { plainToClass } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { Checklist } from './entities/checklist.entity';
import { ChecklistResponseDto } from './dto/checklist-response.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { MailService } from '../mail/mail.service';
import { SignaturesService } from '../signatures/signatures.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { FileParserService } from '../document-import/services/file-parser.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import {
  applyBackendPdfFooter,
  backendPdfTheme,
  createBackendPdfTableTheme,
  drawBackendPdfHeader,
  drawBackendSectionTitle,
  getBackendLastTableY,
} from '../common/services/pdf-branding';

import { NotificationsGateway } from '../notifications/notifications.gateway';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { Company } from '../companies/entities/company.entity';
import { getIsoWeekNumber } from '../common/utils/document-calendar.util';
import { requestOpenAiChatCompletionResponse } from '../ai/openai-request.util';
import { OpenAiCircuitBreakerService } from '../common/resilience/openai-circuit-breaker.service';
import {
  CHECKLIST_BARRIER_TYPE_VALUES,
  CHECKLIST_ITEM_CRITICALITY_VALUES,
  ChecklistItemValue,
  ChecklistSubitemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

type ChecklistPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type ChecklistPdfAccessResponse = {
  entityId: string;
  fileKey: string | null;
  folderPath: string | null;
  originalName: string | null;
  url: string | null;
  hasFinalPdf: boolean;
  availability: ChecklistPdfAccessAvailability;
  message: string;
};

type ChecklistPhotoAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url';

type ChecklistPhotoAccessResponse = {
  entityId: string;
  scope: 'equipment' | 'item';
  itemIndex: number | null;
  photoIndex: number | null;
  hasGovernedPhoto: true;
  availability: ChecklistPhotoAccessAvailability;
  fileKey: string;
  originalName: string;
  mimeType: string;
  url: string | null;
  degraded: boolean;
  message: string | null;
};

type ChecklistPhotoAttachResponse = {
  entityId: string;
  scope: 'equipment' | 'item';
  itemIndex: number | null;
  photoIndex: number | null;
  storageMode: 'governed-storage';
  degraded: false;
  message: string;
  photoReference: string;
  photo: {
    fileKey: string;
    originalName: string;
    mimeType: string;
  };
  signaturesReset: boolean;
};

type PresetChecklistTemplateDefinition = {
  titulo: string;
  descricao: string;
  categoria: string;
  periodicidade: string;
  nivel_risco_padrao: string;
  itens: ChecklistItemValue[];
  equipamento?: string;
  maquina?: string;
  foto_equipamento?: string;
};

type GovernedChecklistPhotoReferencePayload = {
  v: 1;
  kind: 'governed-storage';
  scope: 'equipment' | 'item';
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes?: number | null;
};

const GOVERNED_CHECKLIST_PHOTO_REF_PREFIX = 'gst:checklist-photo:';
const CHECKLIST_BARRIER_TYPE_SET = new Set<string>(
  CHECKLIST_BARRIER_TYPE_VALUES,
);
const CHECKLIST_ITEM_CRITICALITY_SET = new Set<string>(
  CHECKLIST_ITEM_CRITICALITY_VALUES,
);

@Injectable({ scope: Scope.REQUEST })
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);
  private static readonly MAX_INLINE_IMAGE_BYTES = 1 * 1024 * 1024;
  private readonly checklistTemplatesByActivity: PresetChecklistTemplateDefinition[] = [];

  private buildNr24OperationalTopics(): ChecklistTopicValue[] {
    const createTopicItems = (items: string[]): ChecklistItemValue[] =>
      items.map((item) => ({
        item,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: string[];
    }> = [
      {
        id: 'nr24-topic-1',
        titulo: 'Aplicação e dimensionamento',
        ordem: 1,
        itens: [
          'O dimensionamento das instalações considera o número de trabalhadores usuários do turno de maior contingente?',
          'Os trabalhadores usuários das instalações estão corretamente identificados para o cálculo de dimensionamento?',
          'A quantidade de trabalhadores é compatível com a estrutura sanitária e de conforto disponível?',
          'Há separação por sexo das instalações quando exigida pela NR-24?',
          'Há condições operacionais para interrupção do trabalho e uso das instalações sem restrição indevida?',
        ],
      },
      {
        id: 'nr24-topic-2',
        titulo: 'Instalações sanitárias – exigência geral',
        ordem: 2,
        itens: [
          'Existe instalação sanitária disponível no estabelecimento ou frente de trabalho?',
          'Há bacia sanitária sifonada com assento e tampo nas instalações sanitárias?',
          'Há lavatório em número compatível com os trabalhadores usuários?',
          'Há mictório no sanitário masculino, aplica-se quando houver solução masculina e exigência dimensional?',
          'A quantidade mínima de instalações sanitárias atende ao efetivo do turno de maior contingente?',
          'Há privacidade de uso nas situações em que a norma admite uso comum?',
          'A quantidade total de sanitários é compatível com o efetivo usuário?',
        ],
      },
      {
        id: 'nr24-topic-3',
        titulo: 'Instalações sanitárias – condições construtivas e de conservação',
        ordem: 3,
        itens: [
          'As instalações sanitárias apresentam estado adequado de conservação?',
          'As instalações sanitárias estão limpas e higienizadas?',
          'O piso é impermeável e lavável?',
          'As paredes são impermeáveis e laváveis?',
          'A ventilação é adequada ao uso sanitário?',
          'Há ligação adequada com rede de água ou sistema equivalente?',
          'O esgotamento sanitário é adequado e sem extravasamentos?',
          'Existem recipientes para descarte de papéis usados?',
          'O acesso às instalações sanitárias é seguro e desobstruído?',
          'Quando os sanitários estão fora da edificação principal, há passagens cobertas e com piso adequado?',
        ],
      },
      {
        id: 'nr24-topic-4',
        titulo: 'Bacias sanitárias',
        ordem: 4,
        itens: [
          'As bacias sanitárias estão instaladas em compartimentos individualizados?',
          'Há privacidade efetiva de uso das bacias sanitárias?',
          'As portas dos compartimentos possuem fechamento adequado?',
          'Há fornecimento de papel higiênico em todos os compartimentos?',
          'Existe recipiente para descarte quando necessário?',
          'Há recipiente com tampa nos sanitários femininos?',
          'O espaço do compartimento é suficiente para uso adequado?',
          'As peças sanitárias estão conservadas e em funcionamento?',
        ],
      },
      {
        id: 'nr24-topic-5',
        titulo: 'Mictórios',
        ordem: 5,
        itens: [
          'Existe mictório quando aplicável ao sanitário masculino?',
          'O mictório adotado é individual ou coletivo em solução admitida pela norma?',
          'O dimensionamento dos mictórios atende ao efetivo usuário?',
          'O material dos mictórios é impermeável e apropriado à limpeza?',
          'Os mictórios estão conservados, limpos e higienizados?',
          'Há separação ou anteparo quando necessário para preservar privacidade?',
        ],
      },
      {
        id: 'nr24-topic-6',
        titulo: 'Lavatórios',
        ordem: 6,
        itens: [
          'Existem lavatórios em número suficiente para os trabalhadores usuários?',
          'O lavatório é individual ou coletivo conforme solução permitida?',
          'Há material ou dispositivo adequado para limpeza das mãos?',
          'Há meio adequado para enxugo ou secagem das mãos?',
          'Não há toalha coletiva para secagem das mãos?',
          'Os lavatórios e seu entorno estão conservados e higienizados?',
        ],
      },
      {
        id: 'nr24-topic-7',
        titulo: 'Chuveiros',
        ordem: 7,
        itens: [
          'A atividade desenvolvida exige a disponibilização de chuveiros?',
          'A quantidade de chuveiros atende ao número mínimo exigido, aplica-se quando houver obrigatoriedade?',
          'Os chuveiros estão localizados junto ao vestiário ou em área anexa adequada?',
          'Os chuveiros dispõem de compartimentos individualizados quando exigidos?',
          'Há privacidade adequada para uso dos chuveiros?',
          'As portas ou fechamentos dos chuveiros são adequados e funcionais?',
          'Há fornecimento de água fria e quente quando exigido?',
          'Há suporte para sabonete e toalha ou solução equivalente?',
          'O piso e as paredes da área de banho são impermeáveis e laváveis?',
          'As dimensões mínimas da área de banho são observadas quando aplicáveis?',
          'Os chuveiros estão limpos, conservados e em funcionamento?',
        ],
      },
      {
        id: 'nr24-topic-8',
        titulo: 'Vestiários – obrigatoriedade',
        ordem: 8,
        itens: [
          'Existe vestiário quando a troca de roupa precisa ocorrer no local de trabalho?',
          'Existe vestiário quando há uso de vestimenta de trabalho?',
          'Existe vestiário quando há necessidade de chuveiro?',
          'O vestiário é compatível com a atividade desenvolvida?',
        ],
      },
      {
        id: 'nr24-topic-9',
        titulo: 'Vestiários – dimensionamento e estrutura',
        ordem: 9,
        itens: [
          'A área do vestiário é compatível com o número de trabalhadores usuários?',
          'O dimensionamento geral do vestiário é adequado ao uso pretendido?',
          'O vestiário apresenta conservação, limpeza e higiene adequadas?',
          'A ventilação do vestiário é adequada?',
          'O piso do vestiário é impermeável e lavável?',
          'As paredes do vestiário são impermeáveis e laváveis quando exigido?',
          'Há assentos em número suficiente no vestiário?',
          'Os assentos são confeccionados em material lavável?',
          'A circulação interna é adequada e segura?',
          'A organização interna do vestiário é adequada ao uso?',
        ],
      },
      {
        id: 'nr24-topic-10',
        titulo: 'Armários',
        ordem: 10,
        itens: [
          'São fornecidos armários individuais aos trabalhadores quando exigidos?',
          'Os armários possuem sistema de trancamento?',
          'O tipo de armário simples ou duplo é compatível com o risco da atividade?',
          'Há separação entre roupa comum e roupa contaminada, aplica-se quando houver risco de contaminação?',
          'Os armários possuem dimensões mínimas adequadas ao uso?',
          'Os armários estão em bom estado de conservação?',
          'Os armários permitem a guarda de pertences pessoais?',
          'Os armários permitem a guarda das vestimentas de trabalho?',
          'O uso rotativo de armários ocorre somente quando permitido e com higienização prévia?',
        ],
      },
      {
        id: 'nr24-topic-11',
        titulo: 'Local para refeições – exigência geral',
        ordem: 11,
        itens: [
          'Existe local para refeição disponível aos trabalhadores?',
          'O local oferece conforto durante as refeições?',
          'O ambiente destinado às refeições apresenta condições adequadas de higiene?',
          'A estrutura do local para refeições é compatível com a quantidade de usuários?',
          'A organização dos turnos de refeição preserva o intervalo legal sem prejuízo ao acesso ao local?',
        ],
      },
      {
        id: 'nr24-topic-12',
        titulo: 'Local para refeições – estabelecimentos com até 30 trabalhadores',
        ordem: 12,
        itens: [
          'Há ambiente destinado ou adaptado para refeições em estabelecimentos com até 30 trabalhadores?',
          'O ambiente apresenta boas condições de ventilação?',
          'O ambiente apresenta boas condições de higiene?',
          'Há mesas, balcões ou similares para apoio da refeição?',
          'Há assentos suficientes para os usuários do local de refeições?',
          'Existem meios próximos para conservação dos alimentos?',
          'Existem meios próximos para aquecimento das refeições?',
          'Há local ou material adequado para lavagem de utensílios?',
          'Há fornecimento de água potável nas proximidades do local para refeições?',
        ],
      },
      {
        id: 'nr24-topic-13',
        titulo: 'Local para refeições – estabelecimentos com mais de 30 trabalhadores',
        ordem: 13,
        itens: [
          'Existe local exclusivo para refeições em estabelecimentos com mais de 30 trabalhadores?',
          'O local de refeições está situado fora da área de trabalho?',
          'O piso do local de refeições é lavável e impermeável?',
          'As paredes do local de refeições são laváveis e impermeáveis?',
          'Há espaço suficiente para circulação no local de refeições?',
          'A ventilação do local de refeições é adequada?',
          'Há lavatórios próximos ou no próprio local para refeições?',
          'Há assentos em número suficiente no local para refeições?',
          'As mesas possuem superfície lavável e em bom estado?',
          'Há água potável disponível no local de refeições?',
          'Existem meios para aquecimento de refeições no local?',
          'Existem recipientes com tampa para descarte de resíduos?',
          'O local para refeições está limpo e conservado?',
        ],
      },
      {
        id: 'nr24-topic-14',
        titulo: 'Dispensas e exceções relativas ao local de refeição',
        ordem: 14,
        itens: [
          'A hipótese de dispensa legal do local de refeições está corretamente enquadrada?',
          'O fornecimento de vale-refeição não está sendo usado para afastar obrigação de local quando ainda exigível?',
          'Existem condições para aquecer e conservar refeições trazidas de casa quando essa solução é admitida?',
          'Existe possibilidade real de o trabalhador realizar a refeição fora do estabelecimento nas hipóteses admitidas?',
        ],
      },
      {
        id: 'nr24-topic-15',
        titulo: 'Cozinhas',
        ordem: 15,
        itens: [
          'Existe cozinha quando há preparo de refeições no local?',
          'A cozinha está localizada de forma anexa ou funcionalmente integrada ao refeitório?',
          'O piso e as paredes da cozinha são impermeáveis e laváveis?',
          'A ventilação da cozinha é adequada?',
          'Há proteção contra insetos e vetores na cozinha?',
          'Existe lavatório exclusivo para manipuladores de alimentos?',
          'Há fornecimento de material para higienização das mãos?',
          'Não há toalha coletiva para secagem das mãos?',
          'O descarte de resíduos da cozinha é realizado de forma correta?',
          'Há sanitário exclusivo para manipuladores quando exigido?',
          'A câmara frigorífica possui dispositivo de segurança para abertura interna quando existente?',
          'O GLP é armazenado de forma adequada e segura?',
        ],
      },
      {
        id: 'nr24-topic-16',
        titulo: 'Alojamentos – existência e composição',
        ordem: 16,
        itens: [
          'Existe alojamento quando a empresa hospeda trabalhadores?',
          'A composição mínima do alojamento atende ao conjunto de ambientes exigidos pela norma?',
          'O alojamento possui dormitórios em quantidade e capacidade adequadas?',
          'O alojamento possui instalações sanitárias adequadas?',
          'O alojamento possui local para refeições ou acesso adequado à refeição?',
          'O alojamento dispõe de áreas de vivência adequadas?',
          'Existe local para lavagem e secagem de roupas?',
          'O empregador mantém as condições do alojamento em padrão adequado de uso e conservação?',
        ],
      },
      {
        id: 'nr24-topic-17',
        titulo: 'Dormitórios e quartos',
        ordem: 17,
        itens: [
          'Há separação por sexo nos dormitórios quando aplicável?',
          'O número de camas é compatível com o número de alojados?',
          'Não existem três ou mais camas na mesma vertical?',
          'Há armários para os trabalhadores alojados?',
          'A área mínima por cama é respeitada?',
          'O dormitório oferece conforto acústico adequado?',
          'As camas e beliches estão conservados e seguros?',
          'Não há arestas cortantes ou partes danificadas nas camas e beliches?',
          'Há escada fixa nos beliches?',
          'Há proteção lateral na cama superior dos beliches?',
          'A organização dos dormitórios considera turnos de trabalho quando recomendável?',
        ],
      },
      {
        id: 'nr24-topic-18',
        titulo: 'Alojamentos – higiene, conservação e apoio',
        ordem: 18,
        itens: [
          'Os sanitários do alojamento são limpos diariamente?',
          'Há coleta regular de lixo no alojamento?',
          'Há manutenção das instalações do alojamento em padrão adequado?',
          'As roupas de cama são lavadas e substituídas com frequência adequada?',
          'Colchões e enxoval estão em condições adequadas de higiene e conservação?',
          'Não há fogão ou fogareiro dentro dos quartos?',
          'Não há preparo de alimentos nos dormitórios?',
          'Existe lavanderia ou local adequado para lavagem e secagem de roupas pessoais?',
          'Há controle de vetores e pragas no alojamento?',
          'Existe procedimento para casos suspeitos de doença infectocontagiosa no alojamento?',
        ],
      },
      {
        id: 'nr24-topic-19',
        titulo: 'Vestimenta de trabalho',
        ordem: 19,
        itens: [
          'A vestimenta de trabalho é fornecida gratuitamente quando exigida?',
          'O material e o tamanho da vestimenta são adequados à atividade e ao trabalhador?',
          'Há quantidade suficiente de peças para trocas necessárias?',
          'A vestimenta é substituída quando danificada ou ao fim da vida útil?',
          'A higienização da vestimenta é de responsabilidade do empregador quando houver risco ocupacional?',
          'Há higienização prévia quando a vestimenta não é de uso exclusivo?',
          'Há distinção clara entre vestimenta de trabalho e EPI?',
          'Peças de cabeça ou face não restringem o campo de visão do trabalhador?',
        ],
      },
      {
        id: 'nr24-topic-20',
        titulo: 'Água potável',
        ordem: 20,
        itens: [
          'Há fornecimento de água potável a todos os trabalhadores?',
          'A quantidade de água potável é suficiente para o efetivo e a jornada?',
          'O número de bebedouros ou sistema equivalente atende ao mínimo necessário?',
          'Não há uso de copos coletivos para consumo de água?',
          'Os bebedouros estão limpos e em condições higiênicas adequadas?',
          'Quando não há água canalizada, o abastecimento ocorre por recipiente adequado?',
          'Os reservatórios de água são limpos e mantidos adequadamente?',
          'Há análise de potabilidade quando aplicável?',
          'A água não potável está identificada e segregada da água para consumo humano?',
          'Os pontos e recipientes de água potável estão protegidos contra contaminação?',
        ],
      },
      {
        id: 'nr24-topic-21',
        titulo: 'Limpeza, higiene e conservação geral',
        ordem: 21,
        itens: [
          'As condições gerais de higiene do ambiente de trabalho são adequadas?',
          'Existe rotina de limpeza definida e executada?',
          'A limpeza é realizada fora do horário de trabalho quando possível?',
          'São adotadas medidas para controle de poeira durante a limpeza?',
          'As instalações de conforto e vivência estão conservadas de forma geral?',
        ],
      },
      {
        id: 'nr24-topic-22',
        titulo: 'Requisitos construtivos gerais',
        ordem: 22,
        itens: [
          'As instalações atendem ao código de obras local e às exigências construtivas aplicáveis?',
          'As edificações possuem cobertura adequada à finalidade de uso?',
          'As paredes possuem resistência e integridade compatíveis com a utilização?',
          'Os pisos são adequados ao uso e à circulação prevista?',
          'A iluminação é suficiente e segura para uso das instalações?',
          'O pé-direito mínimo é observado quando aplicável?',
          'As instalações elétricas estão protegidas e em condições seguras?',
          'Existem medidas de proteção contra choque elétrico nas áreas de vivência e conforto?',
          'A construção é compatível com a finalidade de uso das instalações de conforto e vivência?',
          'As condições de circulação são seguras em todos os acessos e ambientes?',
        ],
      },
      {
        id: 'nr24-topic-23',
        titulo: 'Anexo I – Shopping Center',
        ordem: 23,
        itens: [
          'A administração central fornece sanitários, vestiários e local para refeições quando aplicável aos trabalhadores dos lojistas?',
          'Os trabalhadores dos lojistas sem estrutura própria adequada são efetivamente atendidos pela administração central?',
          'Há local para conservação e aquecimento de refeições quando exigido pelo anexo?',
          'Há vestiário para troca de roupa e guarda de pertences quando exigido?',
          'Há chuveiros quando exigidos pelo tipo de atividade atendida?',
          'O dimensionamento das estruturas compartilhadas considera o número de trabalhadores atendidos?',
        ],
      },
      {
        id: 'nr24-topic-24',
        titulo: 'Anexo II – trabalho externo de prestação de serviços',
        ordem: 24,
        itens: [
          'Há instalações sanitárias disponíveis nas frentes de trabalho e atividades externas?',
          'Há bacia sanitária e lavatório em quantidade adequada aos trabalhadores presentes?',
          'Quando adotado, o banheiro químico está em conformidade com as exigências aplicáveis?',
          'O banheiro químico recebe higienização diária?',
          'Existe local protegido para refeições nas atividades externas?',
          'O custeio da alimentação é observado quando a norma admitir essa solução?',
          'Há fornecimento de água fresca e potável aos trabalhadores externos?',
          'Há meios para conservação e aquecimento dos alimentos próprios dos trabalhadores?',
          'O uso das instalações sanitárias pelos trabalhadores é gratuito?',
          'Há transporte para local conveniado quando essa solução é utilizada?',
        ],
      },
      {
        id: 'nr24-topic-25',
        titulo: 'Anexo III – transporte público rodoviário coletivo urbano em atividade externa',
        ordem: 25,
        itens: [
          'Existem instalações próximas ao ponto inicial ou final da linha quando não houver terminal?',
          'A distância máxima de deslocamento a pé até a instalação atende ao limite normativo aplicável?',
          'Há instalações sanitárias em quantidade adequada ao contingente simultâneo?',
          'As instalações sanitárias oferecem privacidade e higiene adequadas?',
          'Quando utilizado, o banheiro químico atende às condições aplicáveis do anexo?',
          'Há local para refeições protegido contra intempéries?',
          'Há água potável suficiente para a jornada dos trabalhadores externos?',
          'Existe reposição adequada da água potável durante a jornada?',
          'O dimensionamento considera o número máximo de trabalhadores presentes simultaneamente?',
          'O uso das instalações sanitárias é gratuito para os trabalhadores?',
          'Quando permitido, o atendimento por convênio ou parceria garante acesso efetivo e adequado aos trabalhadores?',
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildNr10OperationalTopics(): ChecklistTopicValue[] {
    type Nr10ItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: Nr10ItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: Nr10ItemDefinition[];
    }> = [
      {
        id: 'nr10-topic-1',
        titulo: 'Gestão Documental e Técnica',
        ordem: 1,
        itens: [
          {
            subitem: 'Prontuário',
            item: 'Prontuário de Instalações Elétricas disponível e atualizado quando exigível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização e atualização do prontuário aplicável.',
          },
          {
            subitem: 'Diagrama unifilar',
            item: 'Esquema unifilar atualizado disponível com especificação do aterramento e dispositivos de proteção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização do diagrama unifilar atualizado.',
          },
          {
            subitem: 'Procedimentos',
            item: 'Procedimentos de trabalho específicos, padronizados e aprovados estão disponíveis no local',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade até disponibilização dos procedimentos aplicáveis.',
          },
          {
            subitem: 'Ordem de serviço',
            item: 'Serviço precedido por ordem de serviço específica com tipo, data, local e referência aos procedimentos',
            criticidade: 'alto',
            acao: 'Regularizar a ordem de serviço antes da execução.',
          },
          {
            subitem: 'Responsável técnico',
            item: 'Documentos técnicos, instruções e liberações elaborados ou aprovados por profissional legalmente habilitado quando exigível',
            criticidade: 'alto',
            acao: 'Submeter a documentação à validação técnica antes da execução.',
          },
        ],
      },
      {
        id: 'nr10-topic-2',
        titulo: 'Planejamento e Análise de Risco',
        ordem: 2,
        itens: [
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco realizada contemplando risco elétrico e riscos adicionais da atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
          },
          {
            subitem: 'Riscos adicionais',
            item: 'Análise considera altura, espaço confinado, umidade, condições atmosféricas, áreas classificadas e demais riscos adicionais aplicáveis',
            criticidade: 'alto',
            acao: 'Revisar a análise de risco antes do início da atividade.',
          },
          {
            subitem: 'Medidas de controle',
            item: 'Medidas preventivas de controle do risco elétrico estão definidas e integradas ao planejamento da atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade até definição formal das medidas de controle.',
          },
          {
            subitem: 'Condição impeditiva',
            item: 'Condições impeditivas para execução estão definidas, conhecidas e controladas pela equipe',
            criticidade: 'alto',
            acao: 'Suspender a atividade até alinhamento formal das condições impeditivas.',
          },
          {
            subitem: 'Trabalho energizado',
            item: 'Execução energizada somente ocorre quando tecnicamente justificada e controlada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção energizada até justificativa técnica e controles aplicáveis.',
          },
        ],
      },
      {
        id: 'nr10-topic-3',
        titulo: 'Qualificação, Capacitação e Autorização',
        ordem: 3,
        itens: [
          {
            subitem: 'Qualificação',
            item: 'Trabalhadores atendem às condições de qualificação compatíveis com a atividade elétrica executada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até comprovação de qualificação compatível.',
          },
          {
            subitem: 'Capacitação básica',
            item: 'Trabalhadores autorizados possuem treinamento básico NR-10 vigente e rastreável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até regularização do treinamento NR-10 básico.',
          },
          {
            subitem: 'Capacitação SEP',
            item: 'Trabalhadores possuem treinamento complementar SEP quando atuarem no SEP ou em suas proximidades',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até regularização do treinamento complementar SEP.',
          },
          {
            subitem: 'Autorização formal',
            item: 'Trabalhadores estão formalmente autorizados pela empresa para a atividade elétrica específica',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão ou atualização da autorização formal.',
          },
          {
            subitem: 'Aptidão',
            item: 'Comprovação ocupacional e condições psicofísicas compatíveis com a atividade estão válidas quando exigíveis',
            criticidade: 'alto',
            acao: 'Afastar o trabalhador da atividade até validação da aptidão aplicável.',
          },
        ],
      },
      {
        id: 'nr10-topic-4',
        titulo: 'Proteção Coletiva, EPI e Ferramental',
        ordem: 4,
        itens: [
          {
            subitem: 'Proteção coletiva',
            item: 'Medidas de proteção coletiva estão implantadas priorizando desenergização e outras barreiras técnicas aplicáveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação das medidas de proteção coletiva.',
          },
          {
            subitem: 'EPI específico',
            item: 'EPIs específicos e adequados ao risco elétrico e aos riscos adicionais estão disponíveis e em uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização e uso correto dos EPIs aplicáveis.',
          },
          {
            subitem: 'Vestimenta',
            item: 'Vestimentas de trabalho são adequadas quanto à condutibilidade, inflamabilidade e influências eletromagnéticas',
            criticidade: 'alto',
            acao: 'Adequar a vestimenta antes do início da atividade.',
          },
          {
            subitem: 'Adornos',
            item: 'Ausência de adornos pessoais nos trabalhos com instalações elétricas ou em suas proximidades',
            criticidade: 'alto',
            acao: 'Retirar adornos e reinspecionar a equipe antes do início da atividade.',
          },
          {
            subitem: 'Ferramental',
            item: 'Ferramental, instrumentos e equipamentos de medição são adequados, íntegros e compatíveis com a classe de tensão',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até substituição ou adequação do ferramental e instrumentos.',
          },
          {
            subitem: 'Ensaios e testes',
            item: 'Resultados de testes de isolação e inspeções de EPC/EPI/ferramental estão disponíveis quando aplicáveis',
            criticidade: 'alto',
            acao: 'Restringir a atividade até apresentação dos ensaios e testes aplicáveis.',
          },
        ],
      },
      {
        id: 'nr10-topic-5',
        titulo: 'Desenergização, Bloqueio e Liberação',
        ordem: 5,
        itens: [
          {
            subitem: 'Seccionamento',
            item: 'Seccionamento da instalação realizado conforme procedimento aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até execução correta do seccionamento.',
          },
          {
            subitem: 'Impedimento de reenergização',
            item: 'Bloqueio e impedimento de reenergização implementados e controlados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação do bloqueio e impedimento de reenergização.',
          },
          {
            subitem: 'Ausência de tensão',
            item: 'Constatação da ausência de tensão realizada com instrumento adequado e procedimento válido',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até constatação formal da ausência de tensão.',
          },
          {
            subitem: 'Aterramento temporário',
            item: 'Aterramento temporário com equipotencialização dos condutores foi instalado quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até instalação do aterramento temporário aplicável.',
          },
          {
            subitem: 'Proteção de partes vivas',
            item: 'Proteção dos elementos energizados existentes na zona controlada foi implementada quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até proteção adequada das partes vivas existentes.',
          },
          {
            subitem: 'Liberação para serviço',
            item: 'Liberação formal para execução ocorreu somente após conclusão da sequência de desenergização aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a execução até formalização da liberação para serviço.',
          },
        ],
      },
      {
        id: 'nr10-topic-6',
        titulo: 'Instalações Energizadas e Proximidade',
        ordem: 6,
        itens: [
          {
            subitem: 'Trabalho energizado',
            item: 'Intervenções energizadas são executadas apenas por trabalhadores que atendem aos requisitos específicos da NR-10',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade energizada até atendimento integral dos requisitos.',
          },
          {
            subitem: 'Zona controlada e de risco',
            item: 'Delimitação e controle das zonas livre, controlada e de risco estão implementados conforme nível de tensão aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até delimitação correta e controle das zonas.',
          },
          {
            subitem: 'Barreiras e obstáculos',
            item: 'Barreiras, obstáculos, anteparos ou isolação de partes vivas estão implantados quando desenergização não for possível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação das barreiras e proteções aplicáveis.',
          },
          {
            subitem: 'Religamento automático',
            item: 'Bloqueio do religamento automático foi implementado quando aplicável',
            criticidade: 'alto',
            acao: 'Suspender a atividade até bloqueio do religamento automático aplicável.',
          },
          {
            subitem: 'Supervisão',
            item: 'Atividade em proximidade ou energizada conta com supervisão e coordenação compatíveis com o risco',
            criticidade: 'alto',
            acao: 'Reforçar a supervisão antes do início ou continuidade da atividade.',
          },
        ],
      },
      {
        id: 'nr10-topic-7',
        titulo: 'Sinalização e Controle de Área',
        ordem: 7,
        itens: [
          {
            subitem: 'Sinalização geral',
            item: 'Sinalização de segurança adequada está implantada para advertência, identificação e restrição de acesso',
            criticidade: 'alto',
            acao: 'Implantar ou corrigir a sinalização antes do início da atividade.',
          },
          {
            subitem: 'Bloqueios e travamentos',
            item: 'Dispositivos e sistemas de manobra possuem sinalização de travamento, bloqueio e impedimento de energização',
            criticidade: 'alto',
            acao: 'Regularizar a sinalização de bloqueio e impedimento antes da continuidade da atividade.',
          },
          {
            subitem: 'Delimitação da área',
            item: 'Área de trabalho está delimitada e protegida contra acesso indevido de terceiros',
            criticidade: 'alto',
            acao: 'Isolar e delimitar a área antes do início ou continuidade da atividade.',
          },
          {
            subitem: 'Identificação de circuitos',
            item: 'Circuitos, equipamentos e pontos de intervenção estão identificados de forma inequívoca',
            criticidade: 'alto',
            acao: 'Regularizar a identificação antes da intervenção.',
          },
        ],
      },
      {
        id: 'nr10-topic-8',
        titulo: 'Aterramento, SPDA e Integridade da Instalação',
        ordem: 8,
        itens: [
          {
            subitem: 'Aterramento',
            item: 'Sistema de aterramento está especificado, identificado e mantido conforme documentação técnica aplicável',
            criticidade: 'alto',
            acao: 'Regularizar documentação e inspeção do sistema de aterramento antes da atividade.',
          },
          {
            subitem: 'SPDA',
            item: 'Inspeções e medições do sistema de proteção contra descargas atmosféricas estão disponíveis quando aplicáveis',
            criticidade: 'alto',
            acao: 'Atualizar as inspeções e medições do SPDA antes da liberação da atividade.',
          },
          {
            subitem: 'Condição da instalação',
            item: 'Instalação elétrica não apresenta aquecimento anormal, falhas de isolação, sobrecorrentes ou outras anormalidades sem controle',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até diagnóstico e correção da anormalidade elétrica.',
          },
          {
            subitem: 'Áreas classificadas',
            item: 'Em áreas classificadas, equipamentos, materiais e liberação formal atendem aos requisitos específicos aplicáveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até conformidade técnica e liberação formal da área classificada.',
          },
        ],
      },
      {
        id: 'nr10-topic-9',
        titulo: 'Emergência, Resgate e Incêndio',
        ordem: 9,
        itens: [
          {
            subitem: 'Plano de emergência',
            item: 'Ações de emergência envolvendo instalações ou serviços com eletricidade constam do plano de emergência da empresa',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até alinhamento com o plano de emergência aplicável.',
          },
          {
            subitem: 'Métodos de resgate',
            item: 'Métodos de resgate padronizados e adequados à atividade estão definidos e disponíveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até definição e disponibilização dos métodos de resgate.',
          },
          {
            subitem: 'Primeiros socorros',
            item: 'Trabalhadores autorizados estão aptos a executar resgate e primeiros socorros, incluindo reanimação cardiopulmonar',
            criticidade: 'alto',
            acao: 'Reforçar ou regularizar a prontidão de resgate e primeiros socorros antes da atividade.',
          },
          {
            subitem: 'Combate a incêndio',
            item: 'Equipe autorizada está apta a operar os meios de prevenção e combate a incêndio existentes nas instalações elétricas',
            criticidade: 'alto',
            acao: 'Regularizar a prontidão da equipe e dos meios de combate a incêndio antes da atividade.',
          },
          {
            subitem: 'Meios de emergência',
            item: 'Meios de comunicação, rota de fuga e acesso aos recursos de emergência estão assegurados',
            criticidade: 'alto',
            acao: 'Adequar os meios de emergência antes do início da atividade.',
          },
        ],
      },
      {
        id: 'nr10-topic-10',
        titulo: 'Inspeções, Correções e Auditoria Operacional',
        ordem: 10,
        itens: [
          {
            subitem: 'Inspeção de área',
            item: 'Área, instalações, ferramental, EPC e EPI foram inspecionados antes do início da atividade',
            criticidade: 'alto',
            acao: 'Executar a inspeção prévia antes da liberação da atividade.',
          },
          {
            subitem: 'Não conformidades anteriores',
            item: 'Não conformidades anteriores da instalação ou da atividade possuem tratativa ou bloqueio vigente',
            criticidade: 'alto',
            acao: 'Tratar ou bloquear a condição pendente antes da execução.',
          },
          {
            subitem: 'Recomendações técnicas',
            item: 'Relatórios técnicos de inspeção e recomendações possuem cronograma de adequação acompanhado',
            criticidade: 'medio',
            acao: 'Atualizar o acompanhamento das recomendações técnicas e do cronograma.',
          },
          {
            subitem: 'Acidente/incidente',
            item: 'Ocorrências anteriores envolvendo eletricidade geraram medidas preventivas e corretivas implantadas',
            criticidade: 'medio',
            acao: 'Revisar o aprendizado operacional e implantar as ações pendentes.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildNr12OperationalTopics(): ChecklistTopicValue[] {
    type Nr12ItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: Nr12ItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: Nr12ItemDefinition[];
    }> = [
      {
        id: 'nr12-topic-1',
        titulo: 'Inventário, Documentação e Procedimentos',
        ordem: 1,
        itens: [
          {
            subitem: 'Inventário',
            item: 'Máquina ou equipamento consta do inventário com identificação, capacidade, descrição do sistema e riscos associados',
            criticidade: 'alto',
            acao: 'Atualizar o inventário antes da continuidade operacional.',
          },
          {
            subitem: 'Manual',
            item: 'Manual do fabricante está disponível em português e acessível aos operadores e mantenedores',
            criticidade: 'alto',
            acao: 'Disponibilizar o manual ou instrução técnica equivalente antes da operação.',
          },
          {
            subitem: 'Procedimento operacional',
            item: 'Procedimentos de operação, limpeza, ajuste, inspeção e manutenção estão formalizados e disponíveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização dos procedimentos aplicáveis.',
          },
          {
            subitem: 'Análise de risco',
            item: 'Apreciação ou análise de risco da máquina está disponível e compatível com a configuração real',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até validação da análise de risco da máquina.',
          },
          {
            subitem: 'Sinalização técnica',
            item: 'Identificação da máquina, capacidade, sentido de rotação, pontos de risco e advertências estão legíveis',
            criticidade: 'alto',
            acao: 'Regularizar a sinalização técnica e de segurança antes do uso.',
          },
        ],
      },
      {
        id: 'nr12-topic-2',
        titulo: 'Instalação, Arranjo Físico e Estrutura',
        ordem: 2,
        itens: [
          {
            subitem: 'Fixação e estabilidade',
            item: 'Máquina está instalada, nivelada e fixada de forma a garantir estabilidade operacional',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até correção da instalação e estabilidade da máquina.',
          },
          {
            subitem: 'Espaçamento',
            item: 'Há espaços ao redor da máquina suficientes para operação, abastecimento, manutenção e evacuação segura',
            criticidade: 'alto',
            acao: 'Readequar o arranjo físico antes da continuidade operacional.',
          },
          {
            subitem: 'Piso',
            item: 'Piso do entorno está íntegro, antiderrapante quando necessário e livre de irregularidades que gerem risco',
            criticidade: 'alto',
            acao: 'Corrigir o piso e eliminar o risco antes da operação.',
          },
          {
            subitem: 'Iluminação',
            item: 'Iluminação geral e localizada é suficiente para operação, inspeção, ajuste e manutenção',
            criticidade: 'alto',
            acao: 'Adequar a iluminação antes da execução da atividade.',
          },
          {
            subitem: 'Acesso seguro',
            item: 'Acessos, escadas, plataformas e passarelas permanentes estão íntegros e seguros quando existentes',
            criticidade: 'alto',
            acao: 'Interditar o acesso inseguro e corrigir a estrutura antes do uso.',
          },
        ],
      },
      {
        id: 'nr12-topic-3',
        titulo: 'Proteções, Enclausuramento e Dispositivos de Segurança',
        ordem: 3,
        itens: [
          {
            subitem: 'Proteções fixas',
            item: 'Proteções fixas estão instaladas, íntegras e impedem acesso à zona de perigo',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a máquina até recomposição das proteções fixas.',
          },
          {
            subitem: 'Proteções móveis',
            item: 'Proteções móveis estão íntegras, corretamente fixadas e sem possibilidade de neutralização indevida',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a máquina até correção das proteções móveis.',
          },
          {
            subitem: 'Intertravamentos',
            item: 'Intertravamentos e chaves de segurança funcionam corretamente e impedem acesso inseguro às zonas de risco',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a máquina até correção do sistema de intertravamento.',
          },
          {
            subitem: 'Neutralização',
            item: 'Não há burlas, pontes, by-pass, sensores anulados ou qualquer neutralização de dispositivo de segurança',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a máquina e eliminar a neutralização indevida.',
          },
          {
            subitem: 'Detecção de presença',
            item: 'Cortina de luz, scanner, tapete ou detector de presença opera corretamente quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até restabelecimento do sistema de detecção aplicável.',
          },
          {
            subitem: 'Risco residual',
            item: 'Riscos residuais estão identificados, sinalizados e controlados por procedimento e treinamento',
            criticidade: 'alto',
            acao: 'Reavaliar os controles do risco residual antes da continuidade.',
          },
        ],
      },
      {
        id: 'nr12-topic-4',
        titulo: 'Comandos, Partida, Parada e Emergência',
        ordem: 4,
        itens: [
          {
            subitem: 'Partida segura',
            item: 'Sistema de partida exige ação intencional e não permite acionamento involuntário',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção do sistema de partida.',
          },
          {
            subitem: 'Parada normal',
            item: 'Dispositivo de parada normal opera corretamente e é acessível ao operador',
            criticidade: 'alto',
            acao: 'Corrigir o sistema de parada normal antes do uso.',
          },
          {
            subitem: 'Parada de emergência',
            item: 'Dispositivos de parada de emergência estão acessíveis, identificados e funcionam corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a máquina até correção da parada de emergência.',
          },
          {
            subitem: 'Reset pós-emergência',
            item: 'O rearme após parada de emergência não provoca partida automática da máquina',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção da lógica de rearme.',
          },
          {
            subitem: 'Modo de operação',
            item: 'Seletores de modo, comandos bimanuais e controles especiais operam corretamente quando aplicáveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção dos dispositivos de comando aplicáveis.',
          },
        ],
      },
      {
        id: 'nr12-topic-5',
        titulo: 'Sistemas Elétricos, Energias Perigosas e Bloqueio',
        ordem: 5,
        itens: [
          {
            subitem: 'Painel elétrico',
            item: 'Painéis e componentes elétricos estão fechados, identificados, protegidos e sem partes energizadas expostas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção das condições inseguras no sistema elétrico.',
          },
          {
            subitem: 'Aterramento',
            item: 'Sistema de aterramento da máquina está íntegro e compatível com a instalação',
            criticidade: 'alto',
            acao: 'Regularizar o aterramento antes da operação.',
          },
          {
            subitem: 'Cabos e componentes',
            item: 'Cabos, eletrodutos, bornes e conexões estão íntegros, sem aquecimento, improvisos ou danos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção dos componentes elétricos danificados.',
          },
          {
            subitem: 'Bloqueio de energias',
            item: 'Procedimento de bloqueio e etiquetagem contempla todas as energias perigosas da máquina',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até implantação do bloqueio de energias perigosas.',
          },
          {
            subitem: 'Ponto de bloqueio',
            item: 'Dispositivos de seccionamento e pontos de bloqueio estão identificados e acessíveis',
            criticidade: 'alto',
            acao: 'Adequar identificação e acessibilidade dos pontos de bloqueio antes da intervenção.',
          },
        ],
      },
      {
        id: 'nr12-topic-6',
        titulo: 'Operação, Abastecimento e Materiais',
        ordem: 6,
        itens: [
          {
            subitem: 'Posto de operação',
            item: 'Posto de trabalho permite operação segura, boa visibilidade e postura adequada do operador',
            criticidade: 'alto',
            acao: 'Readequar o posto de operação antes da continuidade.',
          },
          {
            subitem: 'Abastecimento',
            item: 'Atividades de abastecimento, alimentação e retirada de material ocorrem sem exposição à zona de perigo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até eliminação da exposição insegura durante abastecimento ou retirada.',
          },
          {
            subitem: 'Materiais projetados',
            item: 'Há controle contra projeção, queda, ruptura ou expulsão de materiais e peças quando aplicável',
            criticidade: 'alto',
            acao: 'Implantar contenção ou proteção adequada antes da operação.',
          },
          {
            subitem: 'Ferramentas e acessórios',
            item: 'Ferramentas, gabaritos, matrizes, facas e acessórios estão íntegros e adequados à operação',
            criticidade: 'alto',
            acao: 'Substituir ou regularizar os acessórios antes da operação.',
          },
          {
            subitem: 'Limpeza operacional',
            item: 'Limpeza durante operação segue procedimento seguro e não expõe trabalhador à zona de perigo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a prática insegura e adequar o método de limpeza.',
          },
        ],
      },
      {
        id: 'nr12-topic-7',
        titulo: 'Manutenção, Ajuste, Inspeção e Setup',
        ordem: 7,
        itens: [
          {
            subitem: 'Manutenção planejada',
            item: 'Manutenção preventiva e corretiva ocorre com procedimento, responsável definido e rastreabilidade',
            criticidade: 'alto',
            acao: 'Regularizar o plano e os registros de manutenção antes da continuidade operacional.',
          },
          {
            subitem: 'Intervenção segura',
            item: 'Ajuste, setup, lubrificação, inspeção e manutenção ocorrem com energias perigosas controladas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a intervenção até controle efetivo das energias perigosas.',
          },
          {
            subitem: 'Peças de reposição',
            item: 'Peças e componentes de reposição são compatíveis com o projeto e com o sistema de segurança da máquina',
            criticidade: 'alto',
            acao: 'Substituir componentes inadequados antes da liberação.',
          },
          {
            subitem: 'Teste pós-manutenção',
            item: 'Testes pós-manutenção verificam segurança funcional antes do retorno da máquina à produção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até execução e registro do teste pós-manutenção.',
          },
          {
            subitem: 'Liberação formal',
            item: 'Retorno à operação após intervenção ocorre com liberação formal do responsável',
            criticidade: 'alto',
            acao: 'Formalizar a liberação técnica antes do retorno à operação.',
          },
        ],
      },
      {
        id: 'nr12-topic-8',
        titulo: 'Capacitação, Autorização e Gestão de Pessoas',
        ordem: 8,
        itens: [
          {
            subitem: 'Capacitação do operador',
            item: 'Operadores e intervenientes receberam capacitação compatível com a máquina, função e riscos envolvidos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até capacitação adequada do trabalhador.',
          },
          {
            subitem: 'Autorização',
            item: 'Operação, setup e manutenção são executados somente por pessoas autorizadas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até definição e controle dos autorizados.',
          },
          {
            subitem: 'Reciclagem',
            item: 'Treinamentos, reciclagens e orientações adicionais estão atualizados quando houver mudança de processo, incidente ou modificação da máquina',
            criticidade: 'alto',
            acao: 'Atualizar a reciclagem antes da continuidade operacional.',
          },
          {
            subitem: 'Supervisão',
            item: 'Trabalhadores novos, terceirizados ou em condição especial contam com supervisão compatível',
            criticidade: 'alto',
            acao: 'Adequar a supervisão antes da execução da atividade.',
          },
        ],
      },
      {
        id: 'nr12-topic-9',
        titulo: 'Ergonomia, Acessos e Sinalização',
        ordem: 9,
        itens: [
          {
            subitem: 'Ergonomia',
            item: 'A operação não impõe postura forçada, esforço excessivo, repetitividade crítica ou alcance inseguro sem controle',
            criticidade: 'alto',
            acao: 'Reavaliar ergonomia e implantar melhorias antes da continuidade.',
          },
          {
            subitem: 'Acessos permanentes',
            item: 'Escadas, plataformas, passarelas e guarda-corpos associados à máquina atendem às condições seguras de acesso',
            criticidade: 'alto',
            acao: 'Interditar o acesso inseguro até correção.',
          },
          {
            subitem: 'Sinalização de segurança',
            item: 'Sinalização de advertência, proibição, emergência e identificação de riscos está íntegra e visível',
            criticidade: 'alto',
            acao: 'Regularizar a sinalização antes da operação.',
          },
          {
            subitem: 'Iluminação de inspeção',
            item: 'Há iluminação suficiente para leitura de sinalização, inspeção e intervenção segura na máquina',
            criticidade: 'medio',
            acao: 'Adequar a iluminação antes das intervenções na máquina.',
          },
        ],
      },
      {
        id: 'nr12-topic-10',
        titulo: 'Emergência, Resposta e Auditoria Operacional',
        ordem: 10,
        itens: [
          {
            subitem: 'Plano de resposta',
            item: 'Existem procedimentos para emergência, falha funcional, aprisionamento, incêndio e evacuação associados à máquina',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até implantação dos procedimentos de resposta à emergência.',
          },
          {
            subitem: 'Resgate e primeiros socorros',
            item: 'Equipe sabe acionar resposta, isolamento, resgate e primeiros socorros em ocorrência com a máquina',
            criticidade: 'alto',
            acao: 'Reforçar treinamentos e meios de resposta antes da continuidade.',
          },
          {
            subitem: 'Incidentes e quase acidentes',
            item: 'Incidentes, quase acidentes e falhas da máquina possuem registro, investigação e ação corretiva implementada',
            criticidade: 'medio',
            acao: 'Formalizar investigação e implantar ações corretivas pendentes.',
          },
          {
            subitem: 'Auditoria operacional',
            item: 'Inspeções de rotina verificam proteções, comandos, bloqueios e comportamento seguro dos operadores',
            criticidade: 'medio',
            acao: 'Implantar ou reforçar a rotina de auditoria operacional.',
          },
          {
            subitem: 'Interdição por desvio grave',
            item: 'Máquina é retirada de uso quando houver desvio grave que comprometa o sistema de segurança',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar imediatamente a máquina até eliminação do desvio grave.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildLotoOperationalTopics(): ChecklistTopicValue[] {
    type LotoItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: LotoItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: LotoItemDefinition[];
    }> = [
      {
        id: 'loto-topic-1',
        titulo: 'Gestão, Escopo e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Procedimento LOTO',
            item: 'Procedimento de bloqueio e etiquetagem está formalizado, aprovado e disponível para a atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até disponibilização do procedimento LOTO aplicável.',
          },
          {
            subitem: 'Escopo da intervenção',
            item: 'Escopo, equipamento, limites físicos e tipo de intervenção estão claramente definidos',
            criticidade: 'alto',
            acao: 'Revisar e formalizar o escopo antes da intervenção.',
          },
          {
            subitem: 'Fontes de energia',
            item: 'Fontes de energia perigosas foram identificadas e documentadas, incluindo elétrica, mecânica, pneumática, hidráulica, térmica, gravitacional e outras aplicáveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até identificação completa das fontes de energia perigosas.',
          },
          {
            subitem: 'Pontos de isolamento',
            item: 'Pontos de isolamento e dispositivos de seccionamento estão identificados e acessíveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até identificação correta dos pontos de isolamento.',
          },
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco contempla energias perigosas, dissipação de energias acumuladas e cenários de reenergização indevida',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até revisão da análise de risco.',
          },
        ],
      },
      {
        id: 'loto-topic-2',
        titulo: 'Pessoas, Papéis e Autorização',
        ordem: 2,
        itens: [
          {
            subitem: 'Trabalhadores autorizados',
            item: 'Somente trabalhadores autorizados executam o bloqueio, a intervenção e a retirada de bloqueios',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até definição e controle dos autorizados.',
          },
          {
            subitem: 'Capacitação',
            item: 'Equipe envolvida recebeu capacitação específica em LOTO compatível com o processo e os equipamentos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até capacitação adequada da equipe.',
          },
          {
            subitem: 'Papéis definidos',
            item: 'Responsáveis por bloquear, supervisionar, testar, intervir e liberar estão formalmente definidos',
            criticidade: 'alto',
            acao: 'Formalizar os papéis antes do início da intervenção.',
          },
          {
            subitem: 'Comunicação com afetados',
            item: 'Trabalhadores afetados e áreas impactadas foram comunicados sobre o bloqueio e a indisponibilidade do equipamento',
            criticidade: 'alto',
            acao: 'Comunicar os afetados antes da execução do bloqueio.',
          },
          {
            subitem: 'Contratadas',
            item: 'Empresas contratadas seguem o procedimento LOTO da contratante ou arranjo formalmente compatibilizado',
            criticidade: 'alto',
            acao: 'Compatibilizar procedimentos e autorizações antes da intervenção.',
          },
        ],
      },
      {
        id: 'loto-topic-3',
        titulo: 'Preparação e Desligamento',
        ordem: 3,
        itens: [
          {
            subitem: 'Condição operacional',
            item: 'Máquina ou sistema foi levado à condição segura de parada antes do isolamento das energias',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até parada segura do equipamento.',
          },
          {
            subitem: 'Sequência de desligamento',
            item: 'Sequência de desligamento segue procedimento técnico aplicável e evita danos ou risco adicional',
            criticidade: 'alto',
            acao: 'Reexecutar o desligamento conforme sequência aprovada.',
          },
          {
            subitem: 'Identificação do equipamento',
            item: 'Equipamento ou sistema alvo do bloqueio está identificado de forma inequívoca',
            criticidade: 'alto',
            acao: 'Regularizar a identificação antes do bloqueio.',
          },
          {
            subitem: 'Interferências',
            item: 'Interdependências com outros equipamentos, utilidades ou sistemas compartilhados foram avaliadas antes do bloqueio',
            criticidade: 'alto',
            acao: 'Revisar interferências e impacto operacional antes da intervenção.',
          },
        ],
      },
      {
        id: 'loto-topic-4',
        titulo: 'Isolamento e Dissipação de Energias',
        ordem: 4,
        itens: [
          {
            subitem: 'Isolamento',
            item: 'Todos os pontos de isolamento necessários foram efetivamente seccionados, fechados, desacoplados ou travados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até isolamento completo das energias perigosas.',
          },
          {
            subitem: 'Energia armazenada',
            item: 'Energia residual ou acumulada foi dissipada, contida, aliviada ou neutralizada antes da intervenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até eliminação ou contenção da energia armazenada.',
          },
          {
            subitem: 'Movimento por gravidade',
            item: 'Partes móveis, suspensas ou com potencial de queda estão calçadas, travadas ou apoiadas de forma segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até neutralização do risco gravitacional.',
          },
          {
            subitem: 'Pressões residuais',
            item: 'Linhas, vasos, acumuladores, cilindros e circuitos pressurizados estão despressurizados ou isolados de forma segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até despressurização ou contenção segura do sistema.',
          },
          {
            subitem: 'Reacúmulo',
            item: 'Há medida de monitoramento ou reavaliação quando houver possibilidade de reacúmulo de energia perigosa',
            criticidade: 'alto',
            acao: 'Implementar monitoramento do reacúmulo antes da continuidade.',
          },
        ],
      },
      {
        id: 'loto-topic-5',
        titulo: 'Dispositivos de Bloqueio e Etiquetagem',
        ordem: 5,
        itens: [
          {
            subitem: 'Cadeado individual',
            item: 'Cada trabalhador autorizado aplicou seu próprio cadeado ou bloqueio pessoal quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até aplicação correta dos bloqueios pessoais.',
          },
          {
            subitem: 'Etiqueta de advertência',
            item: 'Etiqueta de bloqueio está preenchida, legível e identifica responsável, data e motivo do bloqueio',
            criticidade: 'alto',
            acao: 'Regularizar a etiquetagem antes da intervenção.',
          },
          {
            subitem: 'Dispositivo compatível',
            item: 'Dispositivo de bloqueio é compatível com o ponto de isolamento e impede manobra não autorizada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até uso de dispositivo compatível e eficaz.',
          },
          {
            subitem: 'Caixa de grupo',
            item: 'Bloqueio em grupo utiliza caixa de bloqueio, múltipla hasp ou sistema equivalente com controle claro de chaves',
            criticidade: 'alto',
            acao: 'Regularizar o bloqueio em grupo antes da intervenção.',
          },
          {
            subitem: 'Chaves de bloqueio',
            item: 'Chaves dos cadeados de bloqueio permanecem sob controle do trabalhador autorizado ou do sistema formal de grupo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até restabelecimento do controle das chaves.',
          },
          {
            subitem: 'Proibição de improviso',
            item: 'Não há uso de arames, lacres improvisados, fitas ou soluções que não garantam bloqueio efetivo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e substituir os improvisos por dispositivos adequados.',
          },
        ],
      },
      {
        id: 'loto-topic-6',
        titulo: 'Verificação de Energia Zero',
        ordem: 6,
        itens: [
          {
            subitem: 'Tentativa de partida',
            item: 'Foi realizada tentativa controlada de acionamento para verificação da condição de energia zero quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até verificação controlada da condição de energia zero.',
          },
          {
            subitem: 'Teste instrumental',
            item: 'Foram realizados testes instrumentais adequados para confirmar ausência de energia quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a intervenção até confirmação instrumental da condição segura.',
          },
          {
            subitem: 'Verificação funcional',
            item: 'Verificação funcional confirma que a energia não pode ser restabelecida inadvertidamente durante a intervenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até garantia da condição segura de energia zero.',
          },
          {
            subitem: 'Registro da verificação',
            item: 'Resultado da verificação de isolamento e energia zero foi registrado quando exigido pelo procedimento',
            criticidade: 'alto',
            acao: 'Registrar formalmente a verificação antes da continuidade.',
          },
        ],
      },
      {
        id: 'loto-topic-7',
        titulo: 'Intervenção, Controle de Área e Trabalho Seguro',
        ordem: 7,
        itens: [
          {
            subitem: 'Delimitação de área',
            item: 'Área da intervenção está isolada e sinalizada contra acesso indevido',
            criticidade: 'alto',
            acao: 'Isolar a área antes da continuidade da intervenção.',
          },
          {
            subitem: 'Ferramentas e materiais',
            item: 'Ferramentas, peças e materiais estão organizados sem criar risco adicional à intervenção bloqueada',
            criticidade: 'medio',
            acao: 'Organizar a área e os materiais antes da continuidade.',
          },
          {
            subitem: 'Mudança de escopo',
            item: 'Mudanças de escopo ou condição operacional durante a intervenção geram revisão do bloqueio e da análise de risco',
            criticidade: 'alto',
            acao: 'Suspender a atividade e revisar o bloqueio e a análise de risco.',
          },
          {
            subitem: 'Supervisão',
            item: 'Intervenções críticas contam com supervisão compatível com a complexidade e o risco',
            criticidade: 'alto',
            acao: 'Adequar a supervisão antes da continuidade da atividade.',
          },
          {
            subitem: 'Inspeções intermediárias',
            item: 'Durante intervenções longas ou complexas há rechecagem periódica do status dos bloqueios e da condição segura',
            criticidade: 'medio',
            acao: 'Implantar rechecagem periódica antes da continuidade da intervenção.',
          },
        ],
      },
      {
        id: 'loto-topic-8',
        titulo: 'Remoção Temporária para Teste ou Posicionamento',
        ordem: 8,
        itens: [
          {
            subitem: 'Remoção controlada',
            item: 'Remoção temporária de bloqueios para teste, posicionamento ou ajuste segue procedimento formal e controlado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até formalização e controle da remoção temporária.',
          },
          {
            subitem: 'Retirada de pessoas',
            item: 'Antes do teste ou energização temporária, pessoas e ferramentas foram retiradas da zona de risco',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o teste até retirada de pessoas, ferramentas e materiais da zona de risco.',
          },
          {
            subitem: 'Retorno do bloqueio',
            item: 'Após o teste, o bloqueio completo foi reaplicado antes da retomada da intervenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a continuidade da intervenção até reaplicação completa do LOTO.',
          },
          {
            subitem: 'Comunicação',
            item: 'Equipe envolvida foi comunicada sobre a remoção temporária e o posterior retorno do bloqueio',
            criticidade: 'alto',
            acao: 'Regularizar a comunicação antes de repetir o ciclo de teste.',
          },
        ],
      },
      {
        id: 'loto-topic-9',
        titulo: 'Liberação, Retorno à Operação e Restauração',
        ordem: 9,
        itens: [
          {
            subitem: 'Reinstalação de proteções',
            item: 'Proteções, tampas, barreiras, dispositivos de segurança e componentes removidos foram reinstalados corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a liberação até reinstalação correta de todas as proteções e dispositivos.',
          },
          {
            subitem: 'Limpeza final',
            item: 'Área de intervenção foi limpa, organizada e está livre de ferramentas, peças soltas e materiais esquecidos',
            criticidade: 'alto',
            acao: 'Executar limpeza e conferência final antes da liberação.',
          },
          {
            subitem: 'Retirada de bloqueios',
            item: 'Retirada de bloqueios e etiquetas ocorreu somente pelos responsáveis autorizados conforme procedimento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a liberação até regularização da retirada dos bloqueios pelos responsáveis.',
          },
          {
            subitem: 'Aviso de retorno',
            item: 'Trabalhadores afetados foram comunicados antes da reenergização ou retorno à operação',
            criticidade: 'alto',
            acao: 'Comunicar os afetados antes do retorno à operação.',
          },
          {
            subitem: 'Partida controlada',
            item: 'Retorno à operação ocorreu de forma controlada e supervisionada após confirmação de condição segura',
            criticidade: 'alto',
            acao: 'Executar o retorno à operação de forma controlada e supervisionada.',
          },
        ],
      },
      {
        id: 'loto-topic-10',
        titulo: 'Desvios, Emergência e Auditoria',
        ordem: 10,
        itens: [
          {
            subitem: 'Remoção excepcional',
            item: 'Remoção excepcional de bloqueio ausente de seu responsável segue procedimento formal, autorizado e rastreável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a retirada excepcional até atendimento integral do procedimento aplicável.',
          },
          {
            subitem: 'Incidentes e desvios',
            item: 'Incidentes, quase acidentes e desvios relacionados a bloqueio possuem registro, investigação e ação corretiva',
            criticidade: 'medio',
            acao: 'Formalizar a investigação e tratar os desvios pendentes.',
          },
          {
            subitem: 'Plano de emergência',
            item: 'Plano de resposta contempla falha de bloqueio, reenergização indevida e resgate quando aplicável',
            criticidade: 'alto',
            acao: 'Atualizar o plano de resposta antes da continuidade das atividades.',
          },
          {
            subitem: 'Auditoria de rotina',
            item: 'O procedimento LOTO é auditado periodicamente quanto à aderência prática e eficácia dos controles',
            criticidade: 'medio',
            acao: 'Implantar ou reforçar a auditoria periódica do procedimento LOTO.',
          },
          {
            subitem: 'Interdição por falha grave',
            item: 'Equipamento ou atividade é interditado quando houver falha grave no controle de energias perigosas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar imediatamente a atividade até eliminação da falha grave de controle.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildNr35OperationalTopics(): ChecklistTopicValue[] {
    type Nr35ItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: Nr35ItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: Nr35ItemDefinition[];
    }> = [
      {
        id: 'nr35-topic-1',
        titulo: 'Gestão Documental e Planejamento',
        ordem: 1,
        itens: [
          {
            subitem: 'Procedimento operacional',
            item: 'Procedimento de trabalho em altura está formalizado, aprovado e disponível para a atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização do procedimento aplicável.',
          },
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco contempla tarefa, local, interferências, condições impeditivas e medidas de controle',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
          },
          {
            subitem: 'Permissão de trabalho',
            item: 'Permissão de trabalho foi emitida para atividade não rotineira, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão da permissão de trabalho aplicável.',
          },
          {
            subitem: 'Escopo e método',
            item: 'Escopo, sequência de execução, acessos, duração e interface com outras atividades estão definidos',
            criticidade: 'alto',
            acao: 'Revisar o planejamento antes do início da atividade.',
          },
          {
            subitem: 'Condições impeditivas',
            item: 'Condições impeditivas como chuva, vento, iluminação insuficiente e instabilidade estrutural estão definidas e avaliadas',
            criticidade: 'alto',
            acao: 'Suspender a atividade até definição e avaliação das condições impeditivas.',
          },
        ],
      },
      {
        id: 'nr35-topic-2',
        titulo: 'Pessoas, Capacitação e Autorização',
        ordem: 2,
        itens: [
          {
            subitem: 'Trabalhador autorizado',
            item: 'Somente trabalhador autorizado executa a atividade em altura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até substituição ou autorização formal do executante.',
          },
          {
            subitem: 'Capacitação NR-35',
            item: 'Trabalhador possui capacitação válida e compatível com a atividade em altura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até comprovação da capacitação aplicável.',
          },
          {
            subitem: 'Aptidão ocupacional',
            item: 'Aptidão ocupacional do trabalhador para atividade em altura está válida e sem restrições incompatíveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade para trabalhador sem aptidão válida.',
          },
          {
            subitem: 'Supervisão',
            item: 'Supervisão está compatível com o risco, a complexidade e a criticidade da atividade',
            criticidade: 'alto',
            acao: 'Adequar a supervisão antes do início da atividade.',
          },
          {
            subitem: 'DDS e alinhamento',
            item: 'Equipe recebeu alinhamento prévio sobre riscos, método de execução, resgate e interface com outras frentes',
            criticidade: 'alto',
            acao: 'Realizar alinhamento formal da equipe antes da atividade.',
          },
        ],
      },
      {
        id: 'nr35-topic-3',
        titulo: 'Local, Estrutura e Acessos',
        ordem: 3,
        itens: [
          {
            subitem: 'Integridade da estrutura',
            item: 'Estrutura, cobertura, plataforma, piso, telhado ou elemento de apoio foi avaliado quanto à resistência e estabilidade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até avaliação e liberação da estrutura.',
          },
          {
            subitem: 'Acesso seguro',
            item: 'Meio de acesso ao posto de trabalho é seguro, adequado e compatível com a tarefa',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização de acesso seguro.',
          },
          {
            subitem: 'Organização da área',
            item: 'Área de trabalho está organizada, limpa e sem obstáculos que aumentem o risco de queda ou tropeço',
            criticidade: 'alto',
            acao: 'Organizar e limpar a área antes da atividade.',
          },
          {
            subitem: 'Área inferior isolada',
            item: 'Área inferior e entorno estão isolados ou controlados contra circulação de pessoas expostas à queda de materiais',
            criticidade: 'alto',
            acao: 'Isolar a área inferior antes do início da atividade.',
          },
          {
            subitem: 'Iluminação e visibilidade',
            item: 'Condição de iluminação e visibilidade é suficiente para execução segura da atividade',
            criticidade: 'alto',
            acao: 'Adequar a iluminação antes de iniciar ou continuar a atividade.',
          },
        ],
      },
      {
        id: 'nr35-topic-4',
        titulo: 'Sistema de Proteção Contra Quedas',
        ordem: 4,
        itens: [
          {
            subitem: 'Seleção do sistema',
            item: 'Sistema de proteção contra quedas foi selecionado de acordo com a análise de risco e a geometria do local',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até seleção correta do sistema de proteção.',
          },
          {
            subitem: 'Proteção coletiva',
            item: 'Medidas de proteção coletiva foram implantadas antes da adoção exclusiva de proteção individual quando tecnicamente aplicável',
            criticidade: 'alto',
            acao: 'Implantar ou justificar formalmente a medida de proteção coletiva.',
          },
          {
            subitem: 'SPIQ/SPQ compatível',
            item: 'Componentes do sistema são compatíveis entre si e com a atividade executada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até correção da compatibilidade do sistema.',
          },
          {
            subitem: 'Zona livre de queda',
            item: 'Configuração adotada considera a zona livre de queda e impede impacto com nível inferior ou obstáculos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até reconfiguração técnica do sistema.',
          },
          {
            subitem: 'Conexão contínua',
            item: 'Método de trabalho garante proteção contínua durante toda a exposição ao risco de queda',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até garantir conexão contínua e segura.',
          },
        ],
      },
      {
        id: 'nr35-topic-5',
        titulo: 'Ancoragem e Componentes do Sistema',
        ordem: 5,
        itens: [
          {
            subitem: 'Ponto de ancoragem',
            item: 'Ponto de ancoragem é resistente, estável, identificado e compatível com o sistema utilizado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até validação do ponto de ancoragem.',
          },
          {
            subitem: 'Conectores',
            item: 'Conectores e elementos de ligação estão íntegros, travando corretamente e sem risco de carga transversal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até substituição dos componentes defeituosos.',
          },
          {
            subitem: 'Absorção de energia',
            item: 'Elemento de ligação para retenção de queda possui absorvedor de energia quando exigível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até adequação do sistema de retenção de queda.',
          },
          {
            subitem: 'Inspeção dos componentes',
            item: 'Componentes do sistema foram inspecionados antes do uso e não apresentam dano, desgaste ou contaminação',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade e substituir os componentes reprovados.',
          },
          {
            subitem: 'Improvisos',
            item: 'Não há nós, emendas, extensores improvisados ou conexões não previstas pelo fabricante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade e eliminar os improvisos do sistema.',
          },
        ],
      },
      {
        id: 'nr35-topic-6',
        titulo: 'EPI, Ferramentas e Materiais',
        ordem: 6,
        itens: [
          {
            subitem: 'Cinturão e talabarte',
            item: 'Cinturão, talabarte, trava-quedas e demais EPIs estão adequados, identificados e em condição segura de uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até substituição ou aprovação formal dos EPIs.',
          },
          {
            subitem: 'Capacete e jugular',
            item: 'Capacete com jugular e demais EPIs complementares exigidos estão em uso correto',
            criticidade: 'alto',
            acao: 'Adequar o uso dos EPIs antes da atividade.',
          },
          {
            subitem: 'Ferramentas em altura',
            item: 'Ferramentas e materiais estão controlados contra queda acidental por amarração, bolsa ou sistema equivalente',
            criticidade: 'alto',
            acao: 'Controlar ferramentas e materiais antes do início da atividade.',
          },
          {
            subitem: 'Carga transportada',
            item: 'Transporte manual de materiais não compromete equilíbrio, postura e proteção contínua do trabalhador',
            criticidade: 'alto',
            acao: 'Rever o método de transporte de materiais antes da atividade.',
          },
          {
            subitem: 'Adornos e vestimentas',
            item: 'Não há uso de adornos, vestimentas soltas ou condições pessoais que aumentem o risco durante a atividade',
            criticidade: 'medio',
            acao: 'Regularizar a condição pessoal do trabalhador antes da atividade.',
          },
        ],
      },
      {
        id: 'nr35-topic-7',
        titulo: 'Execução da Atividade',
        ordem: 7,
        itens: [
          {
            subitem: 'Postura e posicionamento',
            item: 'Trabalhador executa a atividade em postura estável, sem alcance excessivo e sem exposição desnecessária à borda ou ao vazio',
            criticidade: 'alto',
            acao: 'Readequar o posicionamento e o método de execução.',
          },
          {
            subitem: 'Mudança de nível',
            item: 'Mudanças de nível, transposição de obstáculos e passagem por bordas são realizadas com método seguro e proteção contínua',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até correção do método de transposição.',
          },
          {
            subitem: 'Condição climática',
            item: 'Condições climáticas reais permanecem compatíveis com a execução segura da atividade durante toda a intervenção',
            criticidade: 'alto',
            acao: 'Suspender a atividade diante de condição climática adversa.',
          },
          {
            subitem: 'Interferência simultânea',
            item: 'Atividades simultâneas com risco de interferência foram controladas ou segregadas',
            criticidade: 'alto',
            acao: 'Segregar ou reprogramar as atividades interferentes.',
          },
          {
            subitem: 'Reavaliação dinâmica',
            item: 'Mudanças no cenário de risco geram parada e reavaliação formal da atividade',
            criticidade: 'alto',
            acao: 'Interromper a atividade e revisar a análise de risco.',
          },
        ],
      },
      {
        id: 'nr35-topic-8',
        titulo: 'Emergência, Resgate e Comunicação',
        ordem: 8,
        itens: [
          {
            subitem: 'Plano de resgate',
            item: 'Plano de emergência e resgate está definido, compatível com o local e conhecido pela equipe',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação do plano de resgate aplicável.',
          },
          {
            subitem: 'Recursos de resgate',
            item: 'Recursos, equipamentos e meios de acesso para resgate estão disponíveis e operacionais',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização dos recursos de resgate.',
          },
          {
            subitem: 'Equipe de resposta',
            item: 'Equipe designada para resposta conhece o procedimento e está apta a atuar no tempo necessário',
            criticidade: 'alto',
            acao: 'Adequar a equipe de resposta antes do início da atividade.',
          },
          {
            subitem: 'Comunicação',
            item: 'Há meio de comunicação funcional entre executantes, supervisão e equipe de resposta',
            criticidade: 'alto',
            acao: 'Restabelecer meio de comunicação confiável antes da atividade.',
          },
          {
            subitem: 'Primeiros socorros',
            item: 'Recursos mínimos de primeiros socorros e fluxo de acionamento emergencial estão definidos',
            criticidade: 'medio',
            acao: 'Regularizar os recursos e o fluxo de emergência.',
          },
        ],
      },
      {
        id: 'nr35-topic-9',
        titulo: 'Sinalização, Isolamento e Controle do Entorno',
        ordem: 9,
        itens: [
          {
            subitem: 'Sinalização de risco',
            item: 'Sinalização de advertência está instalada e visível para impedir acesso indevido à área de risco',
            criticidade: 'alto',
            acao: 'Implantar a sinalização antes do início da atividade.',
          },
          {
            subitem: 'Controle de queda de objetos',
            item: 'Há medidas de retenção ou proteção contra queda de ferramentas, materiais e fragmentos',
            criticidade: 'alto',
            acao: 'Instalar proteção ou retenção contra queda de objetos.',
          },
          {
            subitem: 'Trânsito e circulação',
            item: 'Fluxos de pedestres, veículos e equipamentos próximos foram controlados para evitar exposição ao risco',
            criticidade: 'alto',
            acao: 'Controlar o trânsito e a circulação antes da atividade.',
          },
          {
            subitem: 'Interdição física',
            item: 'Barreiras físicas ou controles equivalentes impedem aproximação de pessoas não envolvidas na atividade',
            criticidade: 'alto',
            acao: 'Implantar barreiras físicas ou controle efetivo do entorno.',
          },
          {
            subitem: 'Sinalização noturna',
            item: 'Quando aplicável, a área possui sinalização complementar para condição noturna ou baixa visibilidade',
            criticidade: 'medio',
            acao: 'Reforçar a sinalização para condição de baixa visibilidade.',
          },
        ],
      },
      {
        id: 'nr35-topic-10',
        titulo: 'Desvios, Inspeção e Interdição',
        ordem: 10,
        itens: [
          {
            subitem: 'Inspeção prévia',
            item: 'Inspeção prévia da frente de serviço confirma que as medidas previstas estão implementadas e eficazes',
            criticidade: 'alto',
            acao: 'Executar a inspeção prévia antes da atividade.',
          },
          {
            subitem: 'Registro de desvios',
            item: 'Desvios, incidentes e quase acidentes são registrados e tratados com ação corretiva',
            criticidade: 'medio',
            acao: 'Formalizar o registro e a tratativa dos desvios identificados.',
          },
          {
            subitem: 'Interdição por falha grave',
            item: 'Atividade é interditada imediatamente diante de falha grave de proteção, ancoragem, estrutura ou resgate',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar imediatamente a atividade até eliminação da falha grave.',
          },
          {
            subitem: 'Liberação após correção',
            item: 'Retomada da atividade ocorre somente após correção, reinspeção e nova liberação formal quando aplicável',
            criticidade: 'alto',
            acao: 'Reinspecionar e formalizar a liberação antes da retomada.',
          },
          {
            subitem: 'Auditoria operacional',
            item: 'Atividades críticas em altura são auditadas periodicamente para verificação de aderência ao procedimento',
            criticidade: 'medio',
            acao: 'Implantar ou reforçar auditoria operacional das atividades em altura.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildNr33OperationalTopics(): ChecklistTopicValue[] {
    type Nr33ItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: Nr33ItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: Nr33ItemDefinition[];
    }> = [
      {
        id: 'nr33-topic-1',
        titulo: 'Gestão, Cadastro e Planejamento',
        ordem: 1,
        itens: [
          {
            subitem: 'Cadastro do espaço',
            item: 'Espaço confinado está cadastrado, identificado e com perigos conhecidos formalmente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até cadastro e identificação formal do espaço confinado.',
          },
          {
            subitem: 'Procedimento operacional',
            item: 'Procedimento de entrada, trabalho e saída está formalizado e disponível para a equipe',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até disponibilização do procedimento aplicável.',
          },
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco contempla atmosfera, energias perigosas, soterramento, inundação, aprisionamento e resgate',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
          },
          {
            subitem: 'Condições impeditivas',
            item: 'Condições impeditivas para entrada e permanência foram definidas e avaliadas antes do início da atividade',
            criticidade: 'alto',
            acao: 'Suspender a atividade até definição e avaliação das condições impeditivas.',
          },
          {
            subitem: 'Compatibilização de frentes',
            item: 'Interfaces com outras atividades, utilidades e processos do entorno foram avaliadas e controladas',
            criticidade: 'alto',
            acao: 'Compatibilizar as interfaces antes do início da atividade.',
          },
        ],
      },
      {
        id: 'nr33-topic-2',
        titulo: 'PET e Controle Formal da Entrada',
        ordem: 2,
        itens: [
          {
            subitem: 'Permissão de entrada e trabalho',
            item: 'PET foi emitida, aprovada e está disponível no local da atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até emissão e aprovação da PET.',
          },
          {
            subitem: 'Escopo da PET',
            item: 'PET descreve serviço, local, equipe, período, riscos, controles e critérios de cancelamento',
            criticidade: 'alto',
            acao: 'Revisar e complementar a PET antes da entrada.',
          },
          {
            subitem: 'Validade da PET',
            item: 'PET está dentro da validade e compatível com as condições reais do serviço',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até emissão de PET válida e compatível.',
          },
          {
            subitem: 'Cancelamento por mudança',
            item: 'Mudanças de escopo, condição atmosférica ou operacional geram cancelamento e reemissão da PET',
            criticidade: 'alto',
            acao: 'Cancelar a PET e reavaliar a atividade diante de mudança de condição.',
          },
          {
            subitem: 'Encerramento formal',
            item: 'Saída dos trabalhadores e encerramento da PET são formalizados ao término da atividade',
            criticidade: 'medio',
            acao: 'Regularizar o encerramento formal da PET ao fim da atividade.',
          },
        ],
      },
      {
        id: 'nr33-topic-3',
        titulo: 'Pessoas, Papéis e Capacitação',
        ordem: 3,
        itens: [
          {
            subitem: 'Supervisor de entrada',
            item: 'Supervisor de entrada está designado, capacitado e acompanha o cumprimento dos requisitos da PET',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até designação de supervisor de entrada capacitado.',
          },
          {
            subitem: 'Vigia',
            item: 'Vigia permanece dedicado ao monitoramento externo, sem acúmulo indevido de função durante a entrada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até disponibilização de vigia exclusivo.',
          },
          {
            subitem: 'Trabalhadores autorizados',
            item: 'Entrantes estão autorizados, capacitados e cientes dos riscos, sinais de alerta e procedimentos de saída',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até regularização da autorização e capacitação dos entrantes.',
          },
          {
            subitem: 'Aptidão ocupacional',
            item: 'Equipe possui aptidão ocupacional válida e compatível com trabalho em espaço confinado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada para trabalhadores sem aptidão válida.',
          },
          {
            subitem: 'Alinhamento prévio',
            item: 'Equipe realizou alinhamento prévio sobre riscos, sequência de trabalho, comunicação e resgate',
            criticidade: 'alto',
            acao: 'Realizar alinhamento formal antes da entrada.',
          },
        ],
      },
      {
        id: 'nr33-topic-4',
        titulo: 'Isolamento, Bloqueio e Controle de Energias',
        ordem: 4,
        itens: [
          {
            subitem: 'Isolamento de energias',
            item: 'Fontes de energia elétrica, mecânica, pneumática, hidráulica, térmica e outras foram isoladas de forma segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até isolamento completo das energias perigosas.',
          },
          {
            subitem: 'Bloqueio e etiquetagem',
            item: 'Pontos de bloqueio estão identificados, bloqueados e etiquetados conforme procedimento aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até aplicação correta do bloqueio e etiquetagem.',
          },
          {
            subitem: 'Linhas e tubulações',
            item: 'Linhas, vasos, dutos e conexões com potencial de ingresso de produto, vapor ou fluido estão isolados, cegados ou desconectados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até neutralização do risco de ingresso indevido.',
          },
          {
            subitem: 'Partes móveis',
            item: 'Partes móveis, agitadores, transportadores e mecanismos internos estão travados ou neutralizados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até neutralização dos movimentos perigosos.',
          },
          {
            subitem: 'Verificação do isolamento',
            item: 'Efetividade do isolamento foi verificada antes da autorização para entrada',
            criticidade: 'alto',
            acao: 'Executar e registrar a verificação do isolamento antes da entrada.',
          },
        ],
      },
      {
        id: 'nr33-topic-5',
        titulo: 'Avaliação Atmosférica e Ventilação',
        ordem: 5,
        itens: [
          {
            subitem: 'Teste atmosférico inicial',
            item: 'Atmosfera interna foi testada antes da entrada com instrumento adequado e calibrado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até realização do teste atmosférico inicial.',
          },
          {
            subitem: 'Faixas aceitáveis',
            item: 'Resultados de oxigênio, inflamáveis e contaminantes tóxicos estão dentro dos limites seguros definidos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até restabelecimento de atmosfera segura.',
          },
          {
            subitem: 'Monitoramento contínuo',
            item: 'Há monitoramento contínuo ou periódico da atmosfera conforme risco e procedimento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação do monitoramento exigido.',
          },
          {
            subitem: 'Ventilação',
            item: 'Ventilação natural ou forçada é suficiente para manter atmosfera segura durante toda a atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até adequação da ventilação.',
          },
          {
            subitem: 'Posicionamento da ventilação',
            item: 'Captação, insuflamento e exaustão estão posicionados de forma eficaz e sem recircular contaminantes',
            criticidade: 'alto',
            acao: 'Reposicionar ou corrigir o sistema de ventilação antes da continuidade.',
          },
        ],
      },
      {
        id: 'nr33-topic-6',
        titulo: 'Acesso, Permanência e Comunicação',
        ordem: 6,
        itens: [
          {
            subitem: 'Meio de acesso',
            item: 'Meio de acesso e saída do espaço confinado é seguro, desobstruído e compatível com a atividade e o resgate',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até adequação do acesso e da saída.',
          },
          {
            subitem: 'Controle de entrada e saída',
            item: 'Controle nominal de entrantes e horário de entrada/saída está ativo e atualizado',
            criticidade: 'alto',
            acao: 'Regularizar o controle de entrada e saída antes da continuidade.',
          },
          {
            subitem: 'Comunicação vigia-equipe',
            item: 'Há meio de comunicação funcional e contínuo entre vigia, entrantes e supervisor',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até restabelecimento da comunicação confiável.',
          },
          {
            subitem: 'Quantidade de pessoas',
            item: 'Número de entrantes é compatível com o espaço, a atividade, a ventilação e a capacidade de resgate',
            criticidade: 'alto',
            acao: 'Readequar a quantidade de pessoas autorizadas na entrada.',
          },
          {
            subitem: 'Ordem e limpeza',
            item: 'Interior e entorno do espaço estão organizados, sem obstruções e sem acúmulo indevido de materiais',
            criticidade: 'medio',
            acao: 'Organizar o interior e o entorno antes da continuidade da atividade.',
          },
        ],
      },
      {
        id: 'nr33-topic-7',
        titulo: 'EPI, EPC e Ferramentas',
        ordem: 7,
        itens: [
          {
            subitem: 'EPI adequado',
            item: 'EPIs necessários estão definidos, disponíveis, inspecionados e em uso correto',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até adequação dos EPIs exigidos.',
          },
          {
            subitem: 'Proteção respiratória',
            item: 'Proteção respiratória adequada está definida e implantada quando requerida pela análise de risco',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até adequação da proteção respiratória.',
          },
          {
            subitem: 'Ferramental',
            item: 'Ferramentas, iluminação e equipamentos utilizados são compatíveis com o risco do espaço confinado',
            criticidade: 'alto',
            acao: 'Substituir ou adequar o ferramental antes da continuidade.',
          },
          {
            subitem: 'Risco de ignição',
            item: 'Fontes de ignição foram eliminadas ou controladas quando houver risco de inflamáveis ou atmosfera explosiva',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até eliminação ou controle das fontes de ignição.',
          },
          {
            subitem: 'Queda de materiais',
            item: 'Ferramentas e materiais estão controlados para evitar queda, travamento ou obstrução do acesso e da saída',
            criticidade: 'alto',
            acao: 'Controlar ferramentas e materiais antes da continuidade.',
          },
        ],
      },
      {
        id: 'nr33-topic-8',
        titulo: 'Execução, Mudanças e Trabalhos Associados',
        ordem: 8,
        itens: [
          {
            subitem: 'Mudança de condição',
            item: 'Qualquer mudança de processo, atmosfera, escopo ou comportamento gera parada e reavaliação da entrada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade e reavaliar a entrada diante de mudança de condição.',
          },
          {
            subitem: 'Trabalho a quente associado',
            item: 'Quando houver trabalho a quente, controles adicionais foram implantados e compatibilizados com a PET',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até implantação dos controles adicionais para trabalho a quente.',
          },
          {
            subitem: 'Produtos perigosos',
            item: 'Uso de produtos químicos, limpeza, pintura ou outras atividades com emissão de vapores foi avaliado e controlado',
            criticidade: 'alto',
            acao: 'Adequar os controles para emissão de vapores e contaminantes.',
          },
          {
            subitem: 'Acompanhamento do vigia',
            item: 'Vigia mantém monitoramento ativo da atividade e aciona resposta imediata em caso de desvio ou emergência',
            criticidade: 'alto',
            acao: 'Reforçar o monitoramento do vigia antes da continuidade.',
          },
          {
            subitem: 'Tempo de exposição',
            item: 'Tempo de permanência e pausas foram definidos conforme risco, esforço e condição térmica do ambiente',
            criticidade: 'medio',
            acao: 'Reavaliar o tempo de permanência e pausas da equipe.',
          },
        ],
      },
      {
        id: 'nr33-topic-9',
        titulo: 'Emergência, Resgate e Prontidão',
        ordem: 9,
        itens: [
          {
            subitem: 'Plano de resgate',
            item: 'Plano de emergência e resgate é específico para o espaço confinado e está disponível no local',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até implantação do plano de resgate específico.',
          },
          {
            subitem: 'Equipe de resgate',
            item: 'Equipe de resposta está definida, capacitada e apta para atendimento do cenário previsto',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até disponibilização de equipe de resposta apta.',
          },
          {
            subitem: 'Recursos de resgate',
            item: 'Tripé, guincho, maca, linha de vida, respiradores e demais recursos necessários estão disponíveis e operacionais quando aplicáveis',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até disponibilização dos recursos de resgate exigidos.',
          },
          {
            subitem: 'Acesso ao resgate',
            item: 'Configuração do local permite retirada segura do trabalhador em caso de emergência',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a entrada até adequação do acesso para resgate.',
          },
          {
            subitem: 'Fluxo de acionamento',
            item: 'Fluxo de acionamento emergencial, comunicação e suporte médico está definido e conhecido pela equipe',
            criticidade: 'alto',
            acao: 'Formalizar e comunicar o fluxo de acionamento antes da entrada.',
          },
        ],
      },
      {
        id: 'nr33-topic-10',
        titulo: 'Encerramento, Inspeção e Interdição',
        ordem: 10,
        itens: [
          {
            subitem: 'Inspeção pré-entrada',
            item: 'Checklist pré-entrada confirma implantação dos controles antes da autorização para acesso ao espaço',
            criticidade: 'alto',
            acao: 'Executar a inspeção pré-entrada antes da liberação.',
          },
          {
            subitem: 'Interdição por desvio grave',
            item: 'Entrada é imediatamente interditada diante de falha grave atmosférica, estrutural, de comunicação ou de resgate',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar imediatamente a entrada até eliminação da falha grave.',
          },
          {
            subitem: 'Registro de desvios',
            item: 'Desvios, incidentes, alarmes e quase acidentes são registrados e tratados formalmente',
            criticidade: 'medio',
            acao: 'Formalizar o registro e a tratativa dos desvios identificados.',
          },
          {
            subitem: 'Retorno à condição segura',
            item: 'Espaço é deixado em condição segura, isolamentos são tratados conforme procedimento e a área é entregue formalmente',
            criticidade: 'alto',
            acao: 'Regularizar o encerramento e a entrega segura da área.',
          },
          {
            subitem: 'Auditoria operacional',
            item: 'Entradas em espaços confinados são auditadas periodicamente quanto à aderência ao procedimento e à PET',
            criticidade: 'medio',
            acao: 'Implantar ou reforçar auditoria periódica das entradas em espaço confinado.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildWeldingMachineTopics(): ChecklistTopicValue[] {
    type WeldingMachineItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: WeldingMachineItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: WeldingMachineItemDefinition[];
    }> = [
      {
        id: 'welding-machine-topic-1',
        titulo: 'Identificação e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação do equipamento',
            item: 'Máquina identificada por patrimônio, número de série, tag ou controle interno rastreável',
            criticidade: 'alto',
            acao: 'Regularizar a identificação do equipamento antes do uso.',
          },
          {
            subitem: 'Manual e instruções',
            item: 'Manual do fabricante ou instruções operacionais estão disponíveis para consulta',
            criticidade: 'medio',
            acao: 'Disponibilizar instruções operacionais antes da liberação.',
          },
          {
            subitem: 'Tensão e capacidade',
            item: 'Tensão de alimentação, faixa de corrente e ciclo de trabalho estão identificados e compatíveis com a atividade',
            criticidade: 'alto',
            acao: 'Conferir a compatibilidade elétrica e operacional antes do uso.',
          },
          {
            subitem: 'Registro de inspeção',
            item: 'Equipamento possui registro de inspeção e controle de manutenção disponível',
            criticidade: 'alto',
            acao: 'Regularizar o registro de inspeção e manutenção do equipamento.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-2',
        titulo: 'Condição Geral do Equipamento',
        ordem: 2,
        itens: [
          {
            subitem: 'Carcaça e estrutura',
            item: 'Carcaça, alças, rodízios, pés e estrutura do equipamento estão íntegros e sem deformações críticas',
            criticidade: 'alto',
            acao: 'Retirar de uso até correção da integridade estrutural do equipamento.',
          },
          {
            subitem: 'Sujidade e umidade',
            item: 'Equipamento está limpo, seco e sem acúmulo de óleo, poeira condutiva ou umidade excessiva',
            criticidade: 'alto',
            acao: 'Limpar, secar e reinspecionar o equipamento antes do uso.',
          },
          {
            subitem: 'Ventilação do equipamento',
            item: 'Aberturas de ventilação estão desobstruídas e sem sinais de superaquecimento',
            criticidade: 'alto',
            acao: 'Desobstruir as aberturas e inspecionar a condição térmica do equipamento.',
          },
          {
            subitem: 'Sinais de dano',
            item: 'Não há cheiro de queimado, marcas de arco, trincas, peças soltas ou ruídos anormais no equipamento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o equipamento e encaminhar para inspeção técnica.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-3',
        titulo: 'Alimentação Elétrica e Aterramento',
        ordem: 3,
        itens: [
          {
            subitem: 'Ponto de alimentação',
            item: 'Ponto de alimentação elétrica é compatível com a máquina e está em condição segura de uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até correção do ponto de alimentação.',
          },
          {
            subitem: 'Cabo de alimentação',
            item: 'Cabo de alimentação sem emendas improvisadas, cortes, esmagamentos ou exposição de condutores',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até substituição ou reparo tecnicamente adequado do cabo de alimentação.',
          },
          {
            subitem: 'Plugue e conexão',
            item: 'Plugue, tomada industrial ou borne de alimentação estão íntegros, firmes e sem aquecimento anormal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até correção da conexão elétrica.',
          },
          {
            subitem: 'Aterramento',
            item: 'Aterramento ou condutor de proteção do equipamento está íntegro e funcional quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até regularização do aterramento do equipamento.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-4',
        titulo: 'Cabos de Solda e Conexões',
        ordem: 4,
        itens: [
          {
            subitem: 'Cabos de solda',
            item: 'Cabos de solda estão íntegros, sem emendas improvisadas, ressecamento, queimaduras ou exposição de condutores',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a máquina até substituição dos cabos de solda reprovados.',
          },
          {
            subitem: 'Terminais e conectores',
            item: 'Terminais, engates rápidos e conectores estão firmes, sem folga, corrosão ou aquecimento anormal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até correção dos terminais e conectores.',
          },
          {
            subitem: 'Roteamento dos cabos',
            item: 'Cabos estão posicionados sem risco de esmagamento, abrasão, contato com partes quentes ou passagem de veículos',
            criticidade: 'alto',
            acao: 'Reorganizar o roteamento dos cabos antes da atividade.',
          },
          {
            subitem: 'Fixação mecânica',
            item: 'Cabos estão adequadamente fixados ao equipamento e aos acessórios, sem desprendimento ou torção excessiva',
            criticidade: 'alto',
            acao: 'Reapertar ou substituir as conexões mecânicas dos cabos.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-5',
        titulo: 'Acessórios e Circuito de Soldagem',
        ordem: 5,
        itens: [
          {
            subitem: 'Porta-eletrodo ou tocha',
            item: 'Porta-eletrodo, tocha ou conjunto de soldagem estão íntegros, isolados e em condição segura de uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até substituição ou reparo do acessório de soldagem.',
          },
          {
            subitem: 'Garra de retorno',
            item: 'Garra de retorno (terra) está íntegra, com pressão adequada e contato firme com a peça ou bancada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até correção da garra de retorno.',
          },
          {
            subitem: 'Mangueiras e reguladores',
            item: 'Mangueiras, reguladores e conexões de gás estão íntegros e sem vazamento quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até eliminação do vazamento ou substituição dos componentes de gás.',
          },
          {
            subitem: 'Consumíveis',
            item: 'Eletrodos, arames, bicos, difusores e consumíveis estão compatíveis com o processo e em condição adequada',
            criticidade: 'medio',
            acao: 'Adequar os consumíveis antes do início da soldagem.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-6',
        titulo: 'Comandos, Regulagem e Refrigeração',
        ordem: 6,
        itens: [
          {
            subitem: 'Liga/desliga',
            item: 'Chave geral, botão de acionamento e comandos do equipamento funcionam corretamente',
            criticidade: 'alto',
            acao: 'Retirar de uso até correção dos comandos do equipamento.',
          },
          {
            subitem: 'Regulagem de parâmetros',
            item: 'Corrente, tensão, polaridade e demais parâmetros estão ajustados de forma compatível com o processo',
            criticidade: 'alto',
            acao: 'Revisar a parametrização antes de iniciar a soldagem.',
          },
          {
            subitem: 'Sistema de refrigeração',
            item: 'Ventilador, circulação de ar e sistemas auxiliares de refrigeração funcionam adequadamente',
            criticidade: 'alto',
            acao: 'Bloquear o uso até correção do sistema de refrigeração.',
          },
          {
            subitem: 'Alarmes e proteções',
            item: 'Indicações de falha, proteção térmica e alertas do equipamento estão operantes quando existentes',
            criticidade: 'alto',
            acao: 'Inspecionar e corrigir as proteções internas do equipamento.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-7',
        titulo: 'Condições do Local de Uso',
        ordem: 7,
        itens: [
          {
            subitem: 'Base de apoio',
            item: 'Máquina está apoiada em base estável, seca e compatível com o peso e a operação',
            criticidade: 'alto',
            acao: 'Reposicionar a máquina em base estável e segura.',
          },
          {
            subitem: 'Ventilação do ambiente',
            item: 'Local possui ventilação compatível com dissipação de fumos e calor do processo de soldagem',
            criticidade: 'alto',
            acao: 'Adequar a ventilação local antes da atividade.',
          },
          {
            subitem: 'Segregação de inflamáveis',
            item: 'Materiais inflamáveis, recipientes pressurizados e substâncias combustíveis estão afastados ou protegidos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até segregação adequada dos materiais inflamáveis.',
          },
          {
            subitem: 'Interferência externa',
            item: 'Trânsito de pessoas, cabos energizados expostos e outras interferências do entorno estão controlados',
            criticidade: 'alto',
            acao: 'Controlar as interferências do entorno antes da soldagem.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-8',
        titulo: 'Operação Segura e Inspeção Pré-Uso',
        ordem: 8,
        itens: [
          {
            subitem: 'Inspeção pré-uso',
            item: 'Inspeção pré-uso foi realizada antes do início da atividade e não identificou condição impeditiva',
            criticidade: 'alto',
            acao: 'Realizar a inspeção pré-uso antes da operação.',
          },
          {
            subitem: 'Operador habilitado',
            item: 'Operador está orientado, autorizado e apto a utilizar a máquina de solda',
            criticidade: 'alto',
            acao: 'Regularizar a qualificação e autorização do operador.',
          },
          {
            subitem: 'Proteção da peça e retorno',
            item: 'Ponto de retorno está adequadamente instalado para evitar passagem indevida de corrente por estruturas ou rolamentos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até reposicionamento correto do retorno da solda.',
          },
          {
            subitem: 'Sobrecarga térmica',
            item: 'Operação respeita o ciclo de trabalho do equipamento e não há indício de sobrecarga térmica',
            criticidade: 'alto',
            acao: 'Interromper o uso e ajustar o regime de operação da máquina.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-9',
        titulo: 'Manutenção, Bloqueio e Liberação',
        ordem: 9,
        itens: [
          {
            subitem: 'Manutenção periódica',
            item: 'Manutenção preventiva ou corretiva do equipamento está dentro da rotina definida',
            criticidade: 'medio',
            acao: 'Regularizar a manutenção do equipamento conforme plano definido.',
          },
          {
            subitem: 'Bloqueio por defeito',
            item: 'Equipamento com defeito, dano elétrico ou falha funcional é segregado e identificado como inapto',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o equipamento defeituoso e retirar de circulação.',
          },
          {
            subitem: 'Liberação após reparo',
            item: 'Equipamento reparado somente retorna ao uso após inspeção e liberação formal',
            criticidade: 'alto',
            acao: 'Reinspecionar e liberar formalmente antes do retorno ao uso.',
          },
          {
            subitem: 'Improvisos e adaptações',
            item: 'Não há adaptações improvisadas, pontes, gambiarras ou componentes incompatíveis instalados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o equipamento e remover as adaptações indevidas.',
          },
        ],
      },
      {
        id: 'welding-machine-topic-10',
        titulo: 'Pós-Uso, Transporte e Armazenamento',
        ordem: 10,
        itens: [
          {
            subitem: 'Desligamento ao final',
            item: 'Equipamento é desligado e desenergizado ao final da atividade ou durante interrupções prolongadas',
            criticidade: 'alto',
            acao: 'Desligar e desenergizar corretamente o equipamento ao encerrar a atividade.',
          },
          {
            subitem: 'Acondicionamento dos cabos',
            item: 'Cabos e acessórios são acondicionados sem dobras agressivas, esmagamentos ou contato com superfícies quentes',
            criticidade: 'medio',
            acao: 'Acondicionar corretamente cabos e acessórios após o uso.',
          },
          {
            subitem: 'Transporte do equipamento',
            item: 'Transporte é realizado sem impactos, arraste indevido pelos cabos ou dano aos conectores',
            criticidade: 'medio',
            acao: 'Corrigir o método de transporte do equipamento.',
          },
          {
            subitem: 'Armazenamento',
            item: 'Máquina é armazenada em local seco, protegido e organizado, sem exposição a intempéries',
            criticidade: 'medio',
            acao: 'Adequar o local e a forma de armazenamento da máquina.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildGrinderTopics(): ChecklistTopicValue[] {
    type GrinderItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: GrinderItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: GrinderItemDefinition[];
    }> = [
      {
        id: 'grinder-topic-1',
        titulo: 'Identificação e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação da ferramenta',
            item: 'Lixadeira identificada por patrimônio, número de série, tag ou controle interno rastreável',
            criticidade: 'alto',
            acao: 'Regularizar a identificação da lixadeira antes do uso.',
          },
          {
            subitem: 'Manual do fabricante',
            item: 'Manual do fabricante ou instrução operacional está disponível para consulta',
            criticidade: 'medio',
            acao: 'Disponibilizar a instrução técnica aplicável antes da liberação.',
          },
          {
            subitem: 'Especificação técnica',
            item: 'Tensão, potência, rotação nominal e diâmetro máximo do acessório estão legíveis',
            criticidade: 'alto',
            acao: 'Suspender a liberação até restabelecer a identificação técnica mínima da ferramenta.',
          },
          {
            subitem: 'Registro de inspeção',
            item: 'Registro de inspeção periódica e manutenção está disponível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta até execução e registro da inspeção aplicável.',
          },
        ],
      },
      {
        id: 'grinder-topic-2',
        titulo: 'Condição Geral da Ferramenta',
        ordem: 2,
        itens: [
          {
            subitem: 'Carcaça',
            item: 'Carcaça da lixadeira íntegra, sem trincas, deformações ou partes soltas',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a lixadeira e encaminhar para manutenção ou substituição.',
          },
          {
            subitem: 'Empunhadura principal',
            item: 'Empunhadura principal firme, íntegra e sem folgas',
            criticidade: 'alto',
            acao: 'Retirar de uso até correção da empunhadura principal.',
          },
          {
            subitem: 'Limpeza',
            item: 'Ferramenta limpa e sem acúmulo excessivo de pó, óleo, graxa ou resíduos abrasivos',
            criticidade: 'medio',
            acao: 'Limpar a ferramenta antes do uso e reinspecionar sua condição.',
          },
          {
            subitem: 'Ventilação',
            item: 'Aberturas de ventilação desobstruídas e sem sinais de superaquecimento',
            criticidade: 'alto',
            acao: 'Desobstruir as aberturas e avaliar a condição térmica antes da operação.',
          },
          {
            subitem: 'Danos aparentes',
            item: 'Ausência de amassamentos, impactos, improvisos ou sinais de reparo inadequado',
            criticidade: 'alto',
            fotoObrigatoria: true,
            acao: 'Retirar de uso e submeter a ferramenta à avaliação técnica.',
          },
        ],
      },
      {
        id: 'grinder-topic-3',
        titulo: 'Cabo, Plugue, Bateria e Alimentação',
        ordem: 3,
        itens: [
          {
            subitem: 'Cabo de alimentação',
            item: 'Cabo de alimentação íntegro e sem emendas improvisadas, cortes ou exposição de condutores',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a ferramenta e substituir o cabo por componente adequado.',
          },
          {
            subitem: 'Plugue',
            item: 'Plugue em bom estado, sem pinos danificados, aquecimento ou folga',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar de uso imediatamente e substituir o plugue conforme padrão aplicável.',
          },
          {
            subitem: 'Isolação elétrica',
            item: 'Isolação elétrica sem danos aparentes e sem contato exposto com partes energizadas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta até correção elétrica e nova inspeção.',
          },
          {
            subitem: 'Extensão elétrica',
            item: 'Extensão utilizada está em boas condições e adequada à carga da lixadeira',
            criticidade: 'alto',
            acao: 'Proibir o uso da extensão inadequada e substituir por extensão compatível.',
          },
          {
            subitem: 'Bateria e carregador',
            item: 'Quando aplicável, bateria e carregador estão íntegros, sem trincas, vazamentos ou superaquecimento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta e segregar bateria ou carregador defeituoso para avaliação.',
          },
        ],
      },
      {
        id: 'grinder-topic-4',
        titulo: 'Disco, Rebolo, Lixa e Acessórios',
        ordem: 4,
        itens: [
          {
            subitem: 'Compatibilidade do acessório',
            item: 'Disco, rebolo, lixa ou acessório compatível com o modelo e a rotação da lixadeira',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta até instalação de acessório compatível com o equipamento.',
          },
          {
            subitem: 'Integridade do acessório',
            item: 'Disco, rebolo, lixa ou acessório sem trinca, lasca, empeno, umidade ou desgaste incompatível',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a lixadeira e substituir o acessório reprovado.',
          },
          {
            subitem: 'Validade e armazenamento',
            item: 'Acessórios abrasivos estão dentro da validade aplicável e foram armazenados corretamente',
            criticidade: 'alto',
            acao: 'Substituir o acessório inadequado e revisar o armazenamento.',
          },
          {
            subitem: 'Sentido de montagem',
            item: 'Acessório está montado no sentido correto e de acordo com a orientação do fabricante',
            criticidade: 'alto',
            acao: 'Desmontar e reinstalar corretamente o acessório antes da operação.',
          },
          {
            subitem: 'Chave de aperto',
            item: 'Chave de aperto e acessórios de montagem estão disponíveis e em boas condições',
            criticidade: 'medio',
            acao: 'Disponibilizar ferramenta de montagem adequada antes da liberação.',
          },
        ],
      },
      {
        id: 'grinder-topic-5',
        titulo: 'Proteções e Empunhaduras',
        ordem: 5,
        itens: [
          {
            subitem: 'Guarda de proteção',
            item: 'Guarda de proteção instalada, íntegra e corretamente posicionada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a lixadeira até reinstalação ou substituição da guarda de proteção.',
          },
          {
            subitem: 'Empunhadura auxiliar',
            item: 'Empunhadura auxiliar instalada e firme quando exigida pela operação ou pelo fabricante',
            criticidade: 'alto',
            acao: 'Instalar ou corrigir a empunhadura auxiliar antes do uso.',
          },
          {
            subitem: 'Flanges e porca',
            item: 'Flanges, porca de fixação e superfícies de apoio estão íntegros, limpos e compatíveis com o acessório',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta até correção ou substituição dos componentes de fixação.',
          },
          {
            subitem: 'Proteção removível',
            item: 'Não há retirada indevida, improviso ou adaptação na proteção original da ferramenta',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta e restabelecer a configuração original de proteção.',
          },
        ],
      },
      {
        id: 'grinder-topic-6',
        titulo: 'Gatilho, Comandos e Funcionamento',
        ordem: 6,
        itens: [
          {
            subitem: 'Gatilho',
            item: 'Gatilho de acionamento funciona corretamente, sem travamento indevido ou acionamento involuntário',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta até reparo e reteste funcional.',
          },
          {
            subitem: 'Trava de segurança',
            item: 'Trava de segurança ou sistema equivalente funciona conforme previsto no equipamento',
            criticidade: 'alto',
            acao: 'Retirar de uso até correção do sistema de segurança do acionamento.',
          },
          {
            subitem: 'Partida e rotação',
            item: 'Partida ocorre sem oscilação excessiva, ruído anormal ou vibração incompatível',
            criticidade: 'alto',
            acao: 'Interromper o uso e encaminhar para avaliação técnica.',
          },
          {
            subitem: 'Parada do acessório',
            item: 'Acessório desacelera e para de forma compatível, sem desprendimento ou instabilidade',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de uso até diagnóstico do conjunto rotativo.',
          },
          {
            subitem: 'Ruído e vibração',
            item: 'Ausência de ruído anormal, vibração excessiva ou batimento durante o funcionamento',
            criticidade: 'alto',
            acao: 'Retirar a lixadeira de uso até correção da condição anormal.',
          },
        ],
      },
      {
        id: 'grinder-topic-7',
        titulo: 'Segurança Elétrica e Condições do Local',
        ordem: 7,
        itens: [
          {
            subitem: 'Ponto de alimentação',
            item: 'Ponto de alimentação elétrica está em condição segura e compatível com a ferramenta',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até correção do ponto de alimentação.',
          },
          {
            subitem: 'Atmosfera e inflamáveis',
            item: 'Local não apresenta condição com inflamáveis, explosivos ou poeiras combustíveis incompatíveis com faísca do processo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade até eliminação ou controle da condição perigosa do ambiente.',
          },
          {
            subitem: 'Faíscas e projeções',
            item: 'Direção de faíscas e partículas está controlada para não atingir pessoas, cabos, recipientes ou materiais sensíveis',
            criticidade: 'alto',
            acao: 'Reposicionar a atividade ou implantar barreiras e proteção do entorno.',
          },
          {
            subitem: 'Base e apoio da peça',
            item: 'Peça ou material a ser trabalhado está apoiado ou fixado de forma estável',
            criticidade: 'alto',
            acao: 'Fixar corretamente a peça antes do início da operação.',
          },
          {
            subitem: 'Interferências do entorno',
            item: 'Trânsito de pessoas, cabos no piso e obstáculos do entorno estão controlados',
            criticidade: 'alto',
            acao: 'Organizar e isolar o entorno antes da operação.',
          },
        ],
      },
      {
        id: 'grinder-topic-8',
        titulo: 'Operação Segura e Inspeção Pré-Uso',
        ordem: 8,
        itens: [
          {
            subitem: 'Inspeção pré-uso',
            item: 'Inspeção pré-uso foi realizada antes do início da atividade e não identificou condição impeditiva',
            criticidade: 'alto',
            acao: 'Realizar a inspeção pré-uso antes da operação.',
          },
          {
            subitem: 'Operador autorizado',
            item: 'Operador está orientado, autorizado e apto a utilizar a lixadeira',
            criticidade: 'alto',
            acao: 'Regularizar a qualificação e autorização do operador.',
          },
          {
            subitem: 'Uso compatível',
            item: 'Ferramenta está sendo utilizada somente para a aplicação prevista e com acessório correto',
            criticidade: 'alto',
            acao: 'Interromper o uso inadequado e selecionar ferramenta e acessório compatíveis.',
          },
          {
            subitem: 'Força de aplicação',
            item: 'Operação não exige força excessiva nem pressão incompatível sobre o acessório abrasivo',
            criticidade: 'medio',
            acao: 'Reorientar a técnica de trabalho antes de prosseguir.',
          },
          {
            subitem: 'Partida protegida',
            item: 'Partida é realizada com ferramenta estável, sem contato indevido do acessório com a peça ou superfícies adjacentes',
            criticidade: 'alto',
            acao: 'Corrigir o procedimento de partida antes da operação.',
          },
        ],
      },
      {
        id: 'grinder-topic-9',
        titulo: 'Manutenção, Bloqueio e Liberação',
        ordem: 9,
        itens: [
          {
            subitem: 'Manutenção periódica',
            item: 'Manutenção preventiva ou corretiva está dentro da rotina definida para a ferramenta',
            criticidade: 'medio',
            acao: 'Regularizar a manutenção da lixadeira conforme plano definido.',
          },
          {
            subitem: 'Bloqueio por defeito',
            item: 'Ferramenta com defeito, dano elétrico, falha funcional ou proteção ausente está segregada e identificada como inapta',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta defeituosa e retirar de circulação.',
          },
          {
            subitem: 'Liberação após reparo',
            item: 'Ferramenta reparada somente retorna ao uso após inspeção e liberação formal',
            criticidade: 'alto',
            acao: 'Reinspecionar e liberar formalmente antes do retorno ao uso.',
          },
          {
            subitem: 'Improvisos e adaptações',
            item: 'Não há adaptações improvisadas, pontes, gambiarras ou peças incompatíveis instaladas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta e remover as adaptações indevidas.',
          },
        ],
      },
      {
        id: 'grinder-topic-10',
        titulo: 'Pós-Uso, Transporte e Armazenamento',
        ordem: 10,
        itens: [
          {
            subitem: 'Desligamento ao final',
            item: 'Ferramenta é desligada e desenergizada ao final da atividade ou em interrupções prolongadas',
            criticidade: 'alto',
            acao: 'Desligar e desenergizar corretamente a ferramenta ao encerrar a atividade.',
          },
          {
            subitem: 'Acessório após uso',
            item: 'Disco, rebolo ou acessório é removido, inspecionado ou mantido em condição segura após o uso',
            criticidade: 'medio',
            acao: 'Acondicionar corretamente o acessório após o uso.',
          },
          {
            subitem: 'Transporte',
            item: 'Transporte é realizado sem impactos, arraste pelo cabo ou dano às proteções e acessórios',
            criticidade: 'medio',
            acao: 'Corrigir o método de transporte da ferramenta.',
          },
          {
            subitem: 'Armazenamento',
            item: 'Lixadeira e acessórios são armazenados em local seco, protegido e organizado',
            criticidade: 'medio',
            acao: 'Adequar o local e a forma de armazenamento da ferramenta.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildPemtTopics(): ChecklistTopicValue[] {
    type PemtItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: PemtItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: PemtItemDefinition[];
    }> = [
      {
        id: 'pemt-topic-1',
        titulo: 'Documentação e Liberação',
        ordem: 1,
        itens: [
          {
            subitem: 'Manual',
            item: 'Manual do fabricante disponível para consulta',
            criticidade: 'alto',
            acao: 'Disponibilizar o manual atualizado no local ou em meio digital antes da liberação.',
          },
          {
            subitem: 'Identificação',
            item: 'Equipamento identificado por código, número de patrimônio, série ou frota',
            criticidade: 'alto',
            acao: 'Regularizar a identificação física e sistêmica do equipamento antes do uso.',
          },
          {
            subitem: 'Capacidade',
            item: 'Capacidade máxima de carga identificada e legível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o equipamento até restabelecer a identificação legível da capacidade nominal.',
          },
          {
            subitem: 'Advertências',
            item: 'Sinalizações de segurança e advertência legíveis',
            criticidade: 'alto',
            fotoObrigatoria: true,
            acao: 'Substituir ou recompor as sinalizações obrigatórias antes da liberação.',
          },
          {
            subitem: 'Inspeção periódica',
            item: 'Registro de inspeção periódica atualizado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Executar a inspeção periódica pendente e manter o equipamento bloqueado até aprovação.',
          },
          {
            subitem: 'Manutenção',
            item: 'Registro de manutenção preventiva e corretiva atualizado',
            criticidade: 'alto',
            acao: 'Atualizar a rastreabilidade de manutenção e revisar a condição de liberação.',
          },
          {
            subitem: 'Liberação',
            item: 'Equipamento formalmente liberado para uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir o uso até regularização formal da condição de liberação.',
          },
          {
            subitem: 'Procedimento',
            item: 'Procedimento operacional disponível para a atividade',
            criticidade: 'alto',
            acao: 'Disponibilizar o procedimento aplicável e orientar a equipe antes do início.',
          },
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco elaborada para a atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade e elaborar a análise de risco antes da operação.',
          },
          {
            subitem: 'Permissão de trabalho',
            item: 'Permissão de trabalho emitida quando exigível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação até emissão e validação formal da PT exigida.',
          },
        ],
      },
      {
        id: 'pemt-topic-2',
        titulo: 'Estrutura Geral do Equipamento',
        ordem: 2,
        itens: [
          {
            subitem: 'Chassi',
            item: 'Chassi sem trincas, amassamentos ou deformações',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Retirar o equipamento de operação e encaminhar para avaliação estrutural imediata.',
          },
          {
            subitem: 'Plataforma',
            item: 'Cesto ou plataforma em bom estado estrutural',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear o equipamento até correção estrutural e reinspeção.',
          },
          {
            subitem: 'Guarda-corpo',
            item: 'Guarda-corpo íntegro e firmemente fixado',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Impedir o uso até recomposição integral do sistema de proteção coletiva.',
          },
          {
            subitem: 'Portão de acesso',
            item: 'Portão ou barra de acesso em perfeito estado e fechamento adequado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o equipamento até restabelecer o fechamento seguro do acesso.',
          },
          {
            subitem: 'Corrosão',
            item: 'Ausência de corrosão severa em partes estruturais',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Interditar o equipamento para avaliação estrutural e reparo.',
          },
          {
            subitem: 'Vazamentos',
            item: 'Ausência de vazamentos aparentes',
            criticidade: 'alto',
            fotoObrigatoria: true,
            acao: 'Paralisar a operação, identificar a origem do vazamento e reparar antes da liberação.',
          },
          {
            subitem: 'Limpeza',
            item: 'Equipamento limpo e sem acúmulo excessivo de sujeira',
            criticidade: 'medio',
            acao: 'Executar limpeza segura e reinspecionar o equipamento antes do uso.',
          },
        ],
      },
      {
        id: 'pemt-topic-3',
        titulo: 'Sistema Elétrico e Energização',
        ordem: 3,
        itens: [
          {
            subitem: 'Cabos',
            item: 'Cabos, chicotes e conexões sem danos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear o equipamento e substituir os componentes elétricos danificados.',
          },
          {
            subitem: 'Fios expostos',
            item: 'Ausência de fios expostos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Interditar imediatamente o equipamento até correção elétrica.',
          },
          {
            subitem: 'Painéis',
            item: 'Painéis elétricos fechados e protegidos',
            criticidade: 'alto',
            acao: 'Restabelecer fechamento e proteção do compartimento antes do uso.',
          },
          {
            subitem: 'Bateria',
            item: 'Bateria em boas condições de uso',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Retirar de operação e corrigir o sistema de alimentação antes do uso.',
          },
          {
            subitem: 'Carga',
            item: 'Nível de carga adequado para operação',
            criticidade: 'alto',
            acao: 'Encaminhar o equipamento para recarga antes da liberação.',
          },
          {
            subitem: 'Carregador',
            item: 'Sistema de recarga em condição segura',
            criticidade: 'alto',
            acao: 'Proibir a recarga até regularizar o sistema e substituir componentes avariados.',
          },
          {
            subitem: 'Comandos elétricos',
            item: 'Comandos elétricos respondem normalmente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o equipamento e encaminhar para diagnóstico elétrico ou eletrônico.',
          },
        ],
      },
      {
        id: 'pemt-topic-4',
        titulo: 'Comandos e Testes Funcionais',
        ordem: 4,
        itens: [
          {
            subitem: 'Comando de base',
            item: 'Comandos da base funcionando corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar de operação até reparo e reteste funcional.',
          },
          {
            subitem: 'Comando da plataforma',
            item: 'Comandos da plataforma funcionando corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o equipamento até correção.',
          },
          {
            subitem: 'Emergência',
            item: 'Botão de parada de emergência funcionando',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar o equipamento imediatamente.',
          },
          {
            subitem: 'Descida de emergência',
            item: 'Sistema de descida de emergência funcionando',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a liberação do equipamento até reparo e teste validado.',
          },
          {
            subitem: 'Alarme',
            item: 'Alarme sonoro operacional',
            criticidade: 'alto',
            acao: 'Corrigir o dispositivo antes de liberar o uso em área operacional.',
          },
          {
            subitem: 'Indicadores',
            item: 'Painel e indicadores funcionando corretamente',
            criticidade: 'alto',
            acao: 'Corrigir o sistema de indicação antes do uso.',
          },
          {
            subitem: 'Elevação',
            item: 'Movimento de elevação sem falhas ou ruídos anormais',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Paralisar o equipamento e encaminhar para inspeção técnica.',
          },
          {
            subitem: 'Descida',
            item: 'Movimento de descida sem falhas ou ruídos anormais',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o equipamento até reparo e reteste.',
          },
          {
            subitem: 'Translação',
            item: 'Movimento de deslocamento funcionando corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir uso da função e bloquear o equipamento se a falha comprometer a segurança.',
          },
          {
            subitem: 'Sensores',
            item: 'Sensores e limitadores de segurança operantes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar o equipamento imediatamente.',
          },
        ],
      },
      {
        id: 'pemt-topic-5',
        titulo: 'Rodas, Pneus e Estabilidade',
        ordem: 5,
        itens: [
          {
            subitem: 'Pneus',
            item: 'Pneus ou rodas em boas condições',
            criticidade: 'alto',
            fotoObrigatoria: true,
            acao: 'Retirar de operação até substituição ou reparo.',
          },
          {
            subitem: 'Fixação',
            item: 'Rodas e componentes de fixação firmes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até reaperto técnico ou substituição.',
          },
          {
            subitem: 'Eixos',
            item: 'Eixos sem danos aparentes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar o equipamento até avaliação e reparo.',
          },
          {
            subitem: 'Estabilizadores',
            item: 'Estabilizadores em perfeito estado e funcionamento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até restabelecer a estabilidade prevista pelo fabricante.',
          },
          {
            subitem: 'Nivelamento',
            item: 'Sistema de nivelamento funcionando',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir a operação até correção do sistema.',
          },
          {
            subitem: 'Apoio',
            item: 'Equipamento apoiado corretamente no piso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Reposicionar o equipamento e reavaliar a condição do piso antes da operação.',
          },
        ],
      },
      {
        id: 'pemt-topic-6',
        titulo: 'Dispositivos de Segurança',
        ordem: 6,
        itens: [
          {
            subitem: 'Guarda-corpo',
            item: 'Guarda-corpo completo e sem improvisos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a liberação até recomposição integral do guarda-corpo.',
          },
          {
            subitem: 'Acesso',
            item: 'Sistema de fechamento do acesso funcionando',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir operação até correção do mecanismo de acesso.',
          },
          {
            subitem: 'Ancoragem',
            item: 'Ponto de ancoragem identificado e íntegro',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até restabelecer ponto homologado pelo fabricante.',
          },
          {
            subitem: 'Proteção contra quedas',
            item: 'Sistema de proteção contra quedas conforme fabricante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade e adequar o sistema de retenção conforme especificação técnica.',
          },
          {
            subitem: 'Alça de apoio',
            item: 'Alça de apoio interno íntegra',
            criticidade: 'alto',
            acao: 'Substituir o componente antes da operação.',
          },
          {
            subitem: 'Sensor de inclinação',
            item: 'Sensor de inclinação operante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interditar o equipamento até reparo.',
          },
          {
            subitem: 'Horímetro',
            item: 'Horímetro funcionando',
            criticidade: 'medio',
            acao: 'Corrigir o instrumento e ajustar o controle de manutenção.',
          },
          {
            subitem: 'Bloqueio',
            item: 'Sistema de bloqueio contra uso indevido funcionando',
            criticidade: 'alto',
            acao: 'Restabelecer o controle de acesso antes da liberação.',
          },
        ],
      },
      {
        id: 'pemt-topic-7',
        titulo: 'EPI e Proteção contra Quedas',
        ordem: 7,
        itens: [
          {
            subitem: 'Cinturão',
            item: 'Cinturão de segurança em boas condições',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Substituir imediatamente o EPI e impedir o início da atividade até regularização.',
          },
          {
            subitem: 'Talabarte',
            item: 'Talabarte ou sistema indicado em boas condições',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar o EPI de uso e substituir antes da operação.',
          },
          {
            subitem: 'Conectores',
            item: 'Mosquetões e conectores em bom estado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Substituir imediatamente o componente defeituoso.',
          },
          {
            subitem: 'Conexão correta',
            item: 'Sistema conectado ao ponto correto de ancoragem',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade imediatamente e reconectar conforme orientação do fabricante.',
          },
          {
            subitem: 'Inspeção prévia',
            item: 'EPI inspecionado antes do uso',
            criticidade: 'alto',
            acao: 'Realizar inspeção imediata e substituir qualquer item inadequado.',
          },
          {
            subitem: 'Orientação',
            item: 'Trabalhadores orientados sobre uso correto do EPI',
            criticidade: 'alto',
            acao: 'Realizar orientação imediata antes do início da atividade.',
          },
        ],
      },
      {
        id: 'pemt-topic-8',
        titulo: 'Operador e Equipe',
        ordem: 8,
        itens: [
          {
            subitem: 'Capacitação',
            item: 'Operador capacitado para operar a plataforma',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir a operação por esse trabalhador até regularização formal.',
          },
          {
            subitem: 'Autorização',
            item: 'Operador formalmente autorizado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender o uso e regularizar a autorização formal.',
          },
          {
            subitem: 'Aptidão',
            item: 'Trabalhador apto para a atividade',
            criticidade: 'alto',
            acao: 'Impedir a participação até validação ocupacional, quando aplicável.',
          },
          {
            subitem: 'Orientação da equipe',
            item: 'Equipe orientada sobre riscos e controles da atividade',
            criticidade: 'alto',
            acao: 'Realizar briefing operacional antes do início da tarefa.',
          },
          {
            subitem: 'Emergência',
            item: 'Equipe ciente dos procedimentos de emergência',
            criticidade: 'alto',
            acao: 'Suspender a atividade até alinhamento do plano de resposta.',
          },
          {
            subitem: 'Limites do equipamento',
            item: 'Operador conhece capacidade e limitações da plataforma',
            criticidade: 'alto',
            acao: 'Reforçar a orientação e impedir operação até evidência de entendimento.',
          },
          {
            subitem: 'Uso indevido',
            item: 'Não há uso por pessoa não autorizada',
            criticidade: 'alto',
            acao: 'Restabelecer o bloqueio de acesso e reforçar o controle operacional.',
          },
        ],
      },
      {
        id: 'pemt-topic-9',
        titulo: 'Condições do Local',
        ordem: 9,
        itens: [
          {
            subitem: 'Piso',
            item: 'Piso firme e resistente para suportar o equipamento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Proibir o posicionamento até definição de base segura ou tratamento do piso.',
          },
          {
            subitem: 'Nivelamento',
            item: 'Piso nivelado ou dentro do limite aceitável do fabricante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Reposicionar o equipamento ou suspender a atividade.',
          },
          {
            subitem: 'Desníveis',
            item: 'Ausência de buracos, valas e desníveis críticos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Isolar a área e redefinir trajeto ou posição segura.',
          },
          {
            subitem: 'Obstáculos',
            item: 'Área de circulação desobstruída',
            criticidade: 'alto',
            acao: 'Desobstruir a área antes da movimentação.',
          },
          {
            subitem: 'Afundamento',
            item: 'Ausência de risco de afundamento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a operação e estabilizar ou adequar a base de apoio.',
          },
          {
            subitem: 'Isolamento',
            item: 'Área isolada e sinalizada',
            criticidade: 'alto',
            acao: 'Isolar e sinalizar adequadamente antes de iniciar a atividade.',
          },
          {
            subitem: 'Iluminação',
            item: 'Iluminação adequada para operação segura',
            criticidade: 'alto',
            acao: 'Complementar a iluminação ou suspender a atividade.',
          },
          {
            subitem: 'Clima',
            item: 'Condições climáticas seguras para operação',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender imediatamente a atividade e recolher a plataforma.',
          },
        ],
      },
      {
        id: 'pemt-topic-10',
        titulo: 'Riscos Elétricos e Interferências',
        ordem: 10,
        itens: [
          {
            subitem: 'Rede elétrica',
            item: 'Distância segura de redes elétricas energizadas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a atividade imediatamente e redefinir o método com controle elétrico formal.',
          },
          {
            subitem: 'Obstáculos superiores',
            item: 'Ausência de risco de choque com estruturas aéreas',
            criticidade: 'alto',
            acao: 'Redefinir o posicionamento e limitar a movimentação até eliminar o risco.',
          },
          {
            subitem: 'Interferência lateral',
            item: 'Ausência de interferência lateral perigosa',
            criticidade: 'alto',
            acao: 'Reposicionar o equipamento ou isolar a interferência.',
          },
          {
            subitem: 'Sinalização',
            item: 'Sinalização de risco elétrico instalada quando necessária',
            criticidade: 'alto',
            acao: 'Instalar a sinalização e as barreiras antes da liberação.',
          },
          {
            subitem: 'Suspensão da atividade',
            item: 'Atividade suspensa em condição insegura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Determinar paralisação imediata, isolar o equipamento e revisar a atividade.',
          },
        ],
      },
      {
        id: 'pemt-topic-11',
        titulo: 'Regras de Operação Segura',
        ordem: 11,
        itens: [
          {
            subitem: 'Capacidade',
            item: 'Capacidade máxima da plataforma respeitada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar o excesso de carga e reavaliar a condição antes do uso.',
          },
          {
            subitem: 'Carga útil',
            item: 'Transporte apenas de pessoas, ferramentas e materiais necessários',
            criticidade: 'alto',
            acao: 'Retirar materiais indevidos antes da operação.',
          },
          {
            subitem: 'Improviso',
            item: 'Ausência de improvisos para ganho de altura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper imediatamente a atividade e retirar o improviso.',
          },
          {
            subitem: 'Uso inadequado',
            item: 'Equipamento não utilizado como guindaste',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade e adequar o método de movimentação.',
          },
          {
            subitem: 'Deslocamento',
            item: 'Deslocamento realizado com velocidade compatível',
            criticidade: 'alto',
            acao: 'Interromper o deslocamento e reforçar a regra operacional com o operador.',
          },
          {
            subitem: 'Visibilidade',
            item: 'Operação realizada com visibilidade adequada',
            criticidade: 'alto',
            acao: 'Suspender a atividade ou adicionar apoio operacional e controle adicional.',
          },
          {
            subitem: 'Limites do fabricante',
            item: 'Operação dentro dos limites definidos pelo fabricante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Paralisar a operação e replanejar a atividade conforme limite técnico aplicável.',
          },
          {
            subitem: 'Anormalidade',
            item: 'Paralisação imediata em caso de falha ou anormalidade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o equipamento e abrir ocorrência formal.',
          },
        ],
      },
      {
        id: 'pemt-topic-12',
        titulo: 'Inspeção Pré-Uso Diária',
        ordem: 12,
        itens: [
          {
            subitem: 'Rotina',
            item: 'Inspeção realizada antes do início do turno',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade até execução da inspeção formal.',
          },
          {
            subitem: 'Checklist',
            item: 'Checklist diário preenchido',
            criticidade: 'alto',
            acao: 'Exigir o preenchimento do checklist antes da liberação do turno.',
          },
          {
            subitem: 'Teste funcional',
            item: 'Teste funcional executado antes da liberação',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até execução dos testes mínimos obrigatórios.',
          },
          {
            subitem: 'Comunicação',
            item: 'Falhas comunicadas imediatamente ao responsável',
            criticidade: 'alto',
            acao: 'Registrar e comunicar imediatamente ao responsável pela liberação.',
          },
          {
            subitem: 'Bloqueio',
            item: 'Equipamento bloqueado em caso de defeito',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Aplicar bloqueio imediato e retirar o equipamento da área operacional.',
          },
          {
            subitem: 'Registro da NC',
            item: 'Não conformidade registrada formalmente',
            criticidade: 'alto',
            acao: 'Abrir registro formal da não conformidade imediatamente.',
          },
        ],
      },
      {
        id: 'pemt-topic-13',
        titulo: 'Manutenção e Controle',
        ordem: 13,
        itens: [
          {
            subitem: 'Preventiva',
            item: 'Plano de manutenção preventiva implementado',
            criticidade: 'alto',
            acao: 'Implantar ou regularizar o plano preventivo e reavaliar a liberação.',
          },
          {
            subitem: 'Corretiva',
            item: 'Manutenção corretiva registrada adequadamente',
            criticidade: 'medio',
            acao: 'Regularizar a documentação da intervenção realizada.',
          },
          {
            subitem: 'Qualificação',
            item: 'Manutenção executada por profissional qualificado',
            criticidade: 'alto',
            acao: 'Reavaliar a intervenção e submeter o equipamento à revisão técnica qualificada.',
          },
          {
            subitem: 'Peças',
            item: 'Peças e componentes adequados utilizados na manutenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Substituir por componente adequado e reinspecionar o equipamento.',
          },
          {
            subitem: 'Teste pós-manutenção',
            item: 'Equipamento testado após manutenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a liberação e executar reteste formal.',
          },
          {
            subitem: 'Interdição',
            item: 'Equipamento interditado claramente identificado quando inapto',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Aplicar identificação e bloqueio físico imediatamente.',
          },
        ],
      },
      {
        id: 'pemt-topic-14',
        titulo: 'Finalização e Pós-Uso',
        ordem: 14,
        itens: [
          {
            subitem: 'Recolhimento',
            item: 'Plataforma recolhida ao final da atividade',
            criticidade: 'alto',
            acao: 'Recolher imediatamente a estrutura e revisar a orientação da equipe.',
          },
          {
            subitem: 'Desligamento',
            item: 'Equipamento desligado de forma segura',
            criticidade: 'alto',
            acao: 'Realizar desligamento seguro e reforçar a rotina de encerramento.',
          },
          {
            subitem: 'Estacionamento',
            item: 'Equipamento estacionado em local adequado',
            criticidade: 'alto',
            acao: 'Reposicionar imediatamente em local definido e seguro.',
          },
          {
            subitem: 'Bloqueio contra uso indevido',
            item: 'Acesso ao equipamento bloqueado após uso',
            criticidade: 'alto',
            acao: 'Aplicar controle de acesso e recolher os meios de acionamento.',
          },
          {
            subitem: 'Recarga',
            item: 'Bateria encaminhada para recarga quando necessário',
            criticidade: 'medio',
            acao: 'Encaminhar o equipamento para recarga segura conforme procedimento.',
          },
          {
            subitem: 'Registro',
            item: 'Falhas observadas após uso registradas e comunicadas',
            criticidade: 'alto',
            acao: 'Registrar imediatamente a anomalia e bloquear o equipamento se houver risco.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildPortableDrillTopics(): ChecklistTopicValue[] {
    type PortableDrillItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: PortableDrillItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: PortableDrillItemDefinition[];
    }> = [
      {
        id: 'portable-drill-topic-1',
        titulo: 'Identificação e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação da ferramenta',
            item: 'Ferramenta identificada por código, patrimônio, número de série ou controle interno',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de circulação operacional até regularizar a identificação física e sistêmica.',
          },
          {
            subitem: 'Manual do fabricante',
            item: 'Manual do fabricante disponível para consulta',
            criticidade: 'medio',
            acao: 'Disponibilizar o manual ou instrução técnica antes da continuidade do uso da ferramenta.',
          },
          {
            subitem: 'Especificação da ferramenta',
            item: 'Tensão, potência, rotação e características da ferramenta legíveis',
            criticidade: 'alto',
            acao: 'Suspender a liberação até restabelecer a identificação técnica mínima da ferramenta.',
          },
          {
            subitem: 'Registro de inspeção',
            item: 'Registro de inspeção periódica disponível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta até execução e registro da inspeção aplicável.',
          },
          {
            subitem: 'Registro de manutenção',
            item: 'Histórico de manutenção preventiva e corretiva disponível',
            criticidade: 'alto',
            acao: 'Regularizar o histórico de manutenção e reavaliar a condição de liberação.',
          },
          {
            subitem: 'Liberação para uso',
            item: 'Ferramenta formalmente liberada e sem bloqueio',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Impedir o uso e manter bloqueio imediato até regularização formal da liberação.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-2',
        titulo: 'Condição Geral da Ferramenta',
        ordem: 2,
        itens: [
          {
            subitem: 'Carcaça',
            item: 'Carcaça da ferramenta íntegra e sem trincas',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a ferramenta e encaminhar para manutenção ou substituição.',
          },
          {
            subitem: 'Empunhadura',
            item: 'Empunhadura firme, íntegra e sem folgas',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de uso até correção da empunhadura.',
          },
          {
            subitem: 'Fixações',
            item: 'Parafusos, tampas e componentes externos firmes',
            criticidade: 'alto',
            acao: 'Bloquear a ferramenta até reaperto técnico ou substituição dos componentes.',
          },
          {
            subitem: 'Limpeza',
            item: 'Ferramenta limpa e sem acúmulo excessivo de poeira, óleo ou resíduos',
            criticidade: 'medio',
            acao: 'Limpar a ferramenta antes do uso e reinspecionar sua condição.',
          },
          {
            subitem: 'Ventilação',
            item: 'Aberturas de ventilação desobstruídas',
            criticidade: 'alto',
            acao: 'Limpar e desobstruir antes da operação; bloquear se houver dano permanente.',
          },
          {
            subitem: 'Danos aparentes',
            item: 'Ausência de amassamentos, deformações ou sinais de impacto',
            criticidade: 'alto',
            fotoObrigatoria: true,
            acao: 'Retirar imediatamente de uso e submeter à avaliação técnica.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-3',
        titulo: 'Cabo, Plugue, Bateria e Alimentação',
        ordem: 3,
        itens: [
          {
            subitem: 'Cabo elétrico',
            item: 'Cabo de alimentação íntegro e sem emendas improvisadas',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a ferramenta e substituir o cabo por componente adequado.',
          },
          {
            subitem: 'Plugue',
            item: 'Plugue em bom estado e sem pinos danificados',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar de uso imediatamente e substituir o plugue conforme padrão aplicável.',
          },
          {
            subitem: 'Isolação',
            item: 'Isolação elétrica sem danos aparentes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta até correção elétrica e nova inspeção.',
          },
          {
            subitem: 'Extensão elétrica',
            item: 'Extensão utilizada em boas condições e adequada à carga',
            criticidade: 'alto',
            acao: 'Proibir o uso da extensão e substituir por extensão adequada antes da operação.',
          },
          {
            subitem: 'Bateria',
            item: 'Bateria íntegra, sem trincas, vazamentos ou superaquecimento',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a ferramenta e segregar a bateria para avaliação ou descarte controlado.',
          },
          {
            subitem: 'Nível de carga',
            item: 'Nível de carga suficiente para operação segura',
            criticidade: 'medio',
            acao: 'Encaminhar para recarga antes da liberação operacional.',
          },
          {
            subitem: 'Carregador',
            item: 'Carregador em boas condições e sem improvisos',
            criticidade: 'alto',
            acao: 'Proibir o uso do carregador e substituir por modelo compatível e íntegro.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-4',
        titulo: 'Gatilho, Comandos e Funcionamento',
        ordem: 4,
        itens: [
          {
            subitem: 'Gatilho',
            item: 'Gatilho de acionamento funcionando corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta até reparo e reteste.',
          },
          {
            subitem: 'Reversão',
            item: 'Seletor de reversão funcionando corretamente',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de uso até correção do seletor.',
          },
          {
            subitem: 'Controle de velocidade',
            item: 'Controle de velocidade responde adequadamente',
            criticidade: 'alto',
            acao: 'Encaminhar para manutenção antes da liberação da ferramenta.',
          },
          {
            subitem: 'Seletor de torque',
            item: 'Seletor de torque funcionando e ajustável',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de operação até manutenção do seletor.',
          },
          {
            subitem: 'Modo de operação',
            item: 'Seleção entre modo furadeira, parafusadeira ou impacto operante',
            criticidade: 'alto',
            acao: 'Bloquear o uso na aplicação prevista até correção do seletor de modo.',
          },
          {
            subitem: 'Ruído anormal',
            item: 'Ferramenta não apresenta ruídos anormais durante teste',
            criticidade: 'alto',
            acao: 'Interromper o uso e encaminhar para avaliação técnica imediata.',
          },
          {
            subitem: 'Vibração excessiva',
            item: 'Ausência de vibração excessiva durante o funcionamento',
            criticidade: 'alto',
            acao: 'Retirar a ferramenta de uso até diagnóstico e correção.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-5',
        titulo: 'Mandril, Broca, Bit e Acessórios',
        ordem: 5,
        itens: [
          {
            subitem: 'Mandril',
            item: 'Mandril íntegro e sem folgas excessivas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta até substituição ou reparo do mandril.',
          },
          {
            subitem: 'Chave do mandril',
            item: 'Chave do mandril disponível e em boas condições',
            criticidade: 'medio',
            acao: 'Não liberar o uso até disponibilizar chave adequada em bom estado.',
          },
          {
            subitem: 'Fixação da broca',
            item: 'Broca ou bit firmemente fixado',
            criticidade: 'alto',
            acao: 'Reinstalar corretamente o acessório antes de iniciar a atividade.',
          },
          {
            subitem: 'Integridade da broca',
            item: 'Broca íntegra, afiada e sem empeno',
            criticidade: 'alto',
            acao: 'Substituir a broca antes do uso e segregar a defeituosa.',
          },
          {
            subitem: 'Integridade do bit',
            item: 'Bit íntegro e compatível com o parafuso',
            criticidade: 'medio',
            acao: 'Substituir o bit antes da atividade para evitar perda de controle e dano ao fixador.',
          },
          {
            subitem: 'Compatibilidade do acessório',
            item: 'Broca, bit ou acessório compatível com o material e a ferramenta',
            criticidade: 'alto',
            acao: 'Interromper a atividade e selecionar acessório tecnicamente compatível.',
          },
          {
            subitem: 'Acessório danificado',
            item: 'Ausência de broca, bit ou adaptador danificado',
            criticidade: 'alto',
            acao: 'Segregar o acessório e impedir sua utilização imediatamente.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-6',
        titulo: 'Segurança Elétrica',
        ordem: 6,
        itens: [
          {
            subitem: 'Tomada',
            item: 'Ponto de alimentação em condição segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Não energizar a ferramenta até correção do ponto de alimentação.',
          },
          {
            subitem: 'Partes energizadas expostas',
            item: 'Ausência de partes energizadas expostas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta e encaminhar para reparo elétrico.',
          },
          {
            subitem: 'Umidade',
            item: 'Ferramenta não utilizada em condição de umidade incompatível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade imediatamente e replanejar a execução em condição segura.',
          },
          {
            subitem: 'Cabos no trajeto',
            item: 'Cabo elétrico disposto sem risco de tropeço, esmagamento ou corte',
            criticidade: 'alto',
            acao: 'Reorganizar imediatamente o trajeto do cabo e proteger os pontos críticos.',
          },
          {
            subitem: 'Proximidade de rede energizada',
            item: 'Ausência de risco de contato com partes energizadas próximas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a execução até isolar, desenergizar ou redefinir o método com controle elétrico.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-7',
        titulo: 'EPI e Proteção do Operador',
        ordem: 7,
        itens: [
          {
            subitem: 'Óculos de proteção',
            item: 'Operador utilizando proteção ocular adequada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade até fornecimento e uso correto da proteção ocular.',
          },
          {
            subitem: 'Protetor auricular',
            item: 'Operador utilizando proteção auditiva quando exigida',
            criticidade: 'alto',
            acao: 'Exigir o uso do protetor auricular antes da continuidade da tarefa.',
          },
          {
            subitem: 'Luvas',
            item: 'Luva adequada ao risco disponível e utilizada quando aplicável',
            criticidade: 'alto',
            acao: 'Adequar a seleção da luva conforme análise de risco antes da atividade.',
          },
          {
            subitem: 'Máscara/respirador',
            item: 'Proteção respiratória utilizada quando houver geração de poeira',
            criticidade: 'alto',
            acao: 'Interromper a atividade até implantação da proteção respiratória indicada.',
          },
          {
            subitem: 'Calçado de segurança',
            item: 'Operador utilizando calçado de segurança adequado',
            criticidade: 'alto',
            acao: 'Não iniciar ou interromper a atividade até regularização do calçado.',
          },
          {
            subitem: 'Condição do EPI',
            item: 'EPIs em bom estado de conservação',
            criticidade: 'alto',
            acao: 'Substituir imediatamente o EPI defeituoso antes de prosseguir com a atividade.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-8',
        titulo: 'Operador e Autorização',
        ordem: 8,
        itens: [
          {
            subitem: 'Treinamento/orientação',
            item: 'Operador orientado sobre uso seguro da ferramenta',
            criticidade: 'alto',
            acao: 'Impedir o uso até realização de orientação ou treinamento aplicável.',
          },
          {
            subitem: 'Autorização',
            item: 'Uso da ferramenta por pessoa autorizada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender imediatamente a atividade e restringir o acesso à ferramenta.',
          },
          {
            subitem: 'Aptidão operacional',
            item: 'Operador em condição física e cognitiva adequada para o uso',
            criticidade: 'alto',
            acao: 'Afastar o trabalhador da atividade e reavaliar a execução com substituição adequada.',
          },
          {
            subitem: 'Conhecimento da tarefa',
            item: 'Operador conhece o material a perfurar/parafusar e o acessório correto',
            criticidade: 'alto',
            acao: 'Parar a preparação da atividade e orientar o operador antes do início.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-9',
        titulo: 'Condições do Local de Trabalho',
        ordem: 9,
        itens: [
          {
            subitem: 'Organização',
            item: 'Área de trabalho organizada e sem excesso de materiais soltos',
            criticidade: 'medio',
            acao: 'Organizar o posto de trabalho antes do início da atividade.',
          },
          {
            subitem: 'Iluminação',
            item: 'Iluminação adequada no ponto de trabalho',
            criticidade: 'alto',
            acao: 'Complementar a iluminação ou suspender a atividade até adequação.',
          },
          {
            subitem: 'Superfície de trabalho',
            item: 'Peça ou material firmemente apoiado ou fixado',
            criticidade: 'alto',
            acao: 'Fixar adequadamente a peça antes de iniciar a perfuração ou fixação.',
          },
          {
            subitem: 'Interferências ocultas',
            item: 'Verificação prévia de interferências ocultas antes de furar',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a perfuração até avaliação técnica e liberação da superfície.',
          },
          {
            subitem: 'Terceiros no entorno',
            item: 'Área protegida contra projeção de partículas sobre terceiros',
            criticidade: 'alto',
            acao: 'Isolar e sinalizar o entorno antes de prosseguir com a atividade.',
          },
          {
            subitem: 'Trabalho em altura',
            item: 'Condição de uso segura quando a ferramenta for utilizada em altura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender imediatamente a atividade até implantação das medidas de proteção adequadas.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-10',
        titulo: 'Operação Segura',
        ordem: 10,
        itens: [
          {
            subitem: 'Postura',
            item: 'Operador utiliza postura estável e segura durante a atividade',
            criticidade: 'alto',
            acao: 'Reorientar a postura e reposicionar a atividade antes da continuidade.',
          },
          {
            subitem: 'Uso com as mãos',
            item: 'Ferramenta operada com pegada adequada e, quando necessário, com duas mãos',
            criticidade: 'alto',
            acao: 'Interromper a atividade e ajustar a técnica de empunhadura antes de retomar.',
          },
          {
            subitem: 'Pressão aplicada',
            item: 'Pressão aplicada compatível com a capacidade da ferramenta',
            criticidade: 'medio',
            acao: 'Corrigir a técnica, selecionar acessório adequado e reduzir o esforço aplicado.',
          },
          {
            subitem: 'Acessório correto',
            item: 'Uso do acessório correto para o material trabalhado',
            criticidade: 'alto',
            acao: 'Interromper a atividade e substituir pelo acessório correto.',
          },
          {
            subitem: 'Troca de acessório',
            item: 'Troca de broca ou bit realizada com a ferramenta desligada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper imediatamente a prática e exigir desligamento ou desconexão antes de toda troca.',
          },
          {
            subitem: 'Remoção da chave',
            item: 'Chave do mandril removida antes do acionamento',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o acionamento até remoção da chave e reforço da orientação operacional.',
          },
          {
            subitem: 'Uso inadequado',
            item: 'Ferramenta não utilizada fora da finalidade prevista',
            criticidade: 'alto',
            acao: 'Suspender o uso inadequado imediatamente e substituir pelo recurso correto.',
          },
          {
            subitem: 'Interrupção em anormalidade',
            item: 'Operação interrompida imediatamente em caso de falha, superaquecimento ou ruído anormal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a ferramenta e abrir registro de não conformidade.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-11',
        titulo: 'Inspeção Pré-Uso',
        ordem: 11,
        itens: [
          {
            subitem: 'Rotina de inspeção',
            item: 'Inspeção realizada antes do início da atividade',
            criticidade: 'alto',
            acao: 'Suspender a atividade até realização da inspeção obrigatória.',
          },
          {
            subitem: 'Teste em vazio',
            item: 'Teste funcional em vazio realizado antes da operação',
            criticidade: 'alto',
            acao: 'Não liberar a atividade até execução do teste funcional em vazio.',
          },
          {
            subitem: 'Comunicação de falhas',
            item: 'Falhas identificadas comunicadas ao responsável',
            criticidade: 'alto',
            acao: 'Registrar e comunicar imediatamente a não conformidade ao responsável pela ferramenta.',
          },
          {
            subitem: 'Bloqueio de ferramenta defeituosa',
            item: 'Ferramenta defeituosa retirada de uso e bloqueada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Aplicar bloqueio imediato, segregar fisicamente e encaminhar para avaliação.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-12',
        titulo: 'Manutenção e Armazenamento',
        ordem: 12,
        itens: [
          {
            subitem: 'Manutenção preventiva',
            item: 'Ferramenta submetida a manutenção preventiva conforme critério interno/fabricante',
            criticidade: 'medio',
            acao: 'Programar imediatamente a intervenção preventiva e restringir a ferramenta se houver risco associado.',
          },
          {
            subitem: 'Reparo adequado',
            item: 'Reparos realizados sem improvisos e por pessoa competente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear a ferramenta até revisão técnica adequada do reparo executado.',
          },
          {
            subitem: 'Peças adequadas',
            item: 'Peças, acessórios e componentes compatíveis com a ferramenta',
            criticidade: 'alto',
            acao: 'Suspender a utilização e substituir pelo componente compatível.',
          },
          {
            subitem: 'Armazenamento',
            item: 'Ferramenta armazenada em local seco, protegido e organizado',
            criticidade: 'medio',
            acao: 'Readequar imediatamente o local de armazenamento.',
          },
          {
            subitem: 'Organização dos acessórios',
            item: 'Brocas, bits, baterias e carregadores armazenados de forma adequada',
            criticidade: 'medio',
            acao: 'Organizar e segregar os acessórios antes da próxima utilização.',
          },
        ],
      },
      {
        id: 'portable-drill-topic-13',
        titulo: 'Finalização e Pós-Uso',
        ordem: 13,
        itens: [
          {
            subitem: 'Desligamento',
            item: 'Ferramenta desligada com segurança ao final da atividade',
            criticidade: 'alto',
            acao: 'Realizar desligamento seguro imediato e reforçar a rotina de encerramento.',
          },
          {
            subitem: 'Desconexão',
            item: 'Ferramenta desconectada da tomada ou bateria removida quando necessário',
            criticidade: 'alto',
            acao: 'Desconectar imediatamente da alimentação e revisar a rotina de pós-uso.',
          },
          {
            subitem: 'Limpeza pós-uso',
            item: 'Ferramenta limpa após a atividade',
            criticidade: 'medio',
            acao: 'Executar limpeza adequada antes do armazenamento.',
          },
          {
            subitem: 'Registro de anormalidades',
            item: 'Falhas percebidas durante o uso registradas e comunicadas',
            criticidade: 'alto',
            acao: 'Registrar imediatamente a anomalia e bloquear a ferramenta se houver risco.',
          },
          {
            subitem: 'Guarda segura',
            item: 'Ferramenta devolvida ao local de armazenamento definido',
            criticidade: 'medio',
            acao: 'Recolher imediatamente a ferramenta e devolvê-la ao local de armazenamento controlado.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildSafetyLanyardTopics(): ChecklistTopicValue[] {
    type SafetyLanyardItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: SafetyLanyardItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: SafetyLanyardItemDefinition[];
    }> = [
      {
        id: 'safety-lanyard-topic-1',
        titulo: 'Identificação, CA e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação do EPI',
            item: 'Talabarte identificado por marca, modelo, lote, número de série ou código interno',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte até regularização da identificação e rastreabilidade.',
          },
          {
            subitem: 'Certificado de Aprovação',
            item: 'CA do talabarte identificado e controlado pela organização',
            criticidade: 'alto',
            acao: 'Suspender a liberação do EPI até validação documental e controle interno.',
          },
          {
            subitem: 'Manual do fabricante',
            item: 'Manual/instruções do fabricante disponível para consulta',
            criticidade: 'medio',
            acao: 'Disponibilizar imediatamente as instruções do fabricante antes da continuidade do uso.',
          },
          {
            subitem: 'Marcações obrigatórias',
            item: 'Marcações do fabricante e informações do produto legíveis',
            criticidade: 'alto',
            acao: 'Retirar de uso até avaliação da possibilidade de rastreabilidade e substituição do EPI, se necessário.',
          },
          {
            subitem: 'Compatibilidade documentada',
            item: 'Compatibilidade do talabarte com cinturão, conectores e sistema de ancoragem definida',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear o uso até validação técnica da compatibilidade do sistema completo.',
          },
          {
            subitem: 'Registro de entrega',
            item: 'Fornecimento do talabarte registrado em sistema, ficha ou documento equivalente',
            criticidade: 'alto',
            acao: 'Regularizar o registro antes da continuidade do uso.',
          },
          {
            subitem: 'Registro de inspeção',
            item: 'Controle de inspeções periódicas do talabarte disponível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte até execução e registro da inspeção aplicável.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-2',
        titulo: 'Tipo, Configuração e Finalidade de Uso',
        ordem: 2,
        itens: [
          {
            subitem: 'Tipo do talabarte',
            item: 'Tipo do talabarte identificado corretamente',
            criticidade: 'alto',
            acao: 'Suspender o uso até identificação correta da finalidade do talabarte.',
          },
          {
            subitem: 'Finalidade correta',
            item: 'Talabarte utilizado apenas para a finalidade para a qual foi projetado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper imediatamente o uso e substituir pelo equipamento adequado à finalidade.',
          },
          {
            subitem: 'Uso em retenção de queda',
            item: 'Talabarte para retenção de queda é integrado com absorvedor de energia',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte para essa atividade e substituir por conjunto compatível.',
          },
          {
            subitem: 'Uso em posicionamento',
            item: 'Talabarte de posicionamento utilizado apenas para posicionamento, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper o uso e reconfigurar imediatamente o SPIQ com o componente correto.',
          },
          {
            subitem: 'Configuração do sistema',
            item: 'Configuração do SPIQ compatível com a atividade e com o talabarte selecionado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até revisão completa do sistema.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-3',
        titulo: 'Condição Geral do Talabarte',
        ordem: 3,
        itens: [
          {
            subitem: 'Integridade geral',
            item: 'Talabarte sem danos aparentes e em condição geral adequada',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente o talabarte e encaminhar para inspeção formal de recusa.',
          },
          {
            subitem: 'Sujidade excessiva',
            item: 'Ausência de sujeira, óleo, graxa, tinta ou contaminantes que prejudiquem o EPI',
            criticidade: 'alto',
            acao: 'Retirar de uso até higienização adequada e reavaliação técnica.',
          },
          {
            subitem: 'Sinais de envelhecimento',
            item: 'Ausência de sinais de envelhecimento prematuro ou degradação do material',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e encaminhar para descarte controlado se confirmada a degradação.',
          },
          {
            subitem: 'Contaminação química/biológica',
            item: 'Ausência de sinais de contato com agentes químicos, biológicos ou calor excessivo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Segregar e bloquear imediatamente o talabarte até avaliação técnica e decisão de descarte.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-4',
        titulo: 'Fitas, Corda, Cabo e Partes Flexíveis',
        ordem: 4,
        itens: [
          {
            subitem: 'Fitas ou cordas',
            item: 'Fitas, cordas ou elementos flexíveis sem cortes, rasgos, desfiamentos ou abrasão excessiva',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente o talabarte e retirar de circulação.',
          },
          {
            subitem: 'Queimaduras/fusão',
            item: 'Ausência de marcas de queimadura, fusão, soldagem ou calor excessivo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e encaminhar para descarte controlado.',
          },
          {
            subitem: 'Costuras',
            item: 'Costuras íntegras, firmes e sem fios rompidos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
          },
          {
            subitem: 'Etiquetas',
            item: 'Etiquetas estruturais e de identificação preservadas',
            criticidade: 'alto',
            acao: 'Retirar de uso até avaliação da rastreabilidade e substituição do EPI se necessário.',
          },
          {
            subitem: 'Deformação',
            item: 'Ausência de dobras permanentes, vincos severos ou torções excessivas',
            criticidade: 'alto',
            acao: 'Segregar o talabarte e submeter à inspeção formal antes de qualquer novo uso.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-5',
        titulo: 'Absorvedor de Energia',
        ordem: 5,
        itens: [
          {
            subitem: 'Integridade externa',
            item: 'Absorvedor de energia sem rasgos, danos ou violação da embalagem/capa',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente o conjunto e retirar de uso até decisão técnica.',
          },
          {
            subitem: 'Acionamento',
            item: 'Absorvedor de energia sem sinal de abertura ou acionamento prévio',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e inutilizar o talabarte para descarte controlado, salvo exceção formal do fabricante.',
          },
          {
            subitem: 'Compatibilidade de uso',
            item: 'Absorvedor de energia compatível com a finalidade do talabarte',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Não liberar o conjunto até correção da compatibilidade técnica.',
          },
          {
            subitem: 'Modificação indevida',
            item: 'Ausência de modificações, amarrações ou intervenção no absorvedor',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e condenar o conjunto para descarte.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-6',
        titulo: 'Conectores, Mosquetões e Componentes Metálicos',
        ordem: 6,
        itens: [
          {
            subitem: 'Integridade dos conectores',
            item: 'Conectores íntegros, sem trincas, deformações ou desgaste excessivo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e retirar de circulação.',
          },
          {
            subitem: 'Funcionamento das travas',
            item: 'Travas automáticas ou manuais funcionando corretamente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte até substituição ou descarte do conjunto.',
          },
          {
            subitem: 'Corrosão',
            item: 'Ausência de corrosão crítica em componentes metálicos',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Retirar de uso imediatamente e condenar o componente ou conjunto.',
          },
          {
            subitem: 'Rebarbas e arestas',
            item: 'Ausência de rebarbas, trincas, desgaste ou arestas cortantes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
          },
          {
            subitem: 'Carga transversal',
            item: 'Conector sem risco de posicionamento inadequado ou carga transversal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a montagem e corrigir imediatamente a conexão com elemento compatível.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-7',
        titulo: 'Compatibilidade com Cinturão, Ancoragem e Sistema',
        ordem: 7,
        itens: [
          {
            subitem: 'Engate ao cinturão',
            item: 'Talabarte conectado ao elemento de engate correto do cinturão',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o uso até reconexão correta e validação do sistema.',
          },
          {
            subitem: 'Compatibilidade com ancoragem',
            item: 'Talabarte compatível com o sistema de ancoragem utilizado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade e substituir o ponto ou o conector por solução compatível.',
          },
          {
            subitem: 'Compatibilidade entre elementos',
            item: 'Compatibilidade entre talabarte, cinturão, conectores e demais elementos do SPIQ',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até reconfiguração completa do SPIQ.',
          },
          {
            subitem: 'Extensores/prolongadores',
            item: 'Ausência de conexão indevida com outro talabarte, elemento de ligação ou extensor',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o sistema e desmontar a configuração indevida.',
          },
          {
            subitem: 'Nós e laços',
            item: 'Ausência de nós, laços ou improvisos no talabarte',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e retirar de uso.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-8',
        titulo: 'Posicionamento, Zona Livre e Uso na Atividade',
        ordem: 8,
        itens: [
          {
            subitem: 'Posicionamento do talabarte',
            item: 'Talabarte posicionado de modo a restringir a distância de queda livre',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade e reposicionar imediatamente o sistema.',
          },
          {
            subitem: 'Colisão com nível inferior',
            item: 'Sistema montado para evitar colisão com estrutura inferior, obstáculo ou solo',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até redefinição da zona livre e do sistema.',
          },
          {
            subitem: 'Permanência conectado',
            item: 'Trabalhador permanece conectado durante todo o período de exposição ao risco de queda',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper imediatamente a atividade e restabelecer conexão contínua segura.',
          },
          {
            subitem: 'Comprimento adequado',
            item: 'Comprimento do talabarte compatível com a tarefa e com a análise de risco',
            criticidade: 'alto',
            acao: 'Substituir o talabarte ou reconfigurar a atividade antes do uso.',
          },
          {
            subitem: 'Trabalho em estruturas agressivas',
            item: 'Talabarte protegido contra arestas cortantes, abrasão ou superfícies quentes quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade até implantação de proteção ou substituição da solução técnica.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-9',
        titulo: 'Inspeção Pré-Uso e Inspeção Periódica',
        ordem: 9,
        itens: [
          {
            subitem: 'Inspeção rotineira',
            item: 'Inspeção realizada antes de cada uso',
            criticidade: 'alto',
            acao: 'Suspender a utilização até realização da inspeção prévia obrigatória.',
          },
          {
            subitem: 'Inspeção periódica',
            item: 'Inspeção periódica realizada dentro do prazo estabelecido',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte até nova inspeção periódica válida.',
          },
          {
            subitem: 'Registro de recusa',
            item: 'Inspeções com recusa do talabarte registradas formalmente',
            criticidade: 'alto',
            acao: 'Formalizar a recusa imediatamente e segregar o EPI.',
          },
          {
            subitem: 'Histórico de queda',
            item: 'Talabarte sem registro de retenção de queda sem tratativa formal',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o talabarte e condená-lo para descarte controlado, salvo exceção formal prevista.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-10',
        titulo: 'Treinamento, Orientação e Uso pelo Trabalhador',
        ordem: 10,
        itens: [
          {
            subitem: 'Orientação de uso',
            item: 'Trabalhador orientado quanto ao uso, limitações e inspeção do talabarte',
            criticidade: 'alto',
            acao: 'Impedir o uso até realização de orientação formal.',
          },
          {
            subitem: 'Treinamento de EPI',
            item: 'Treinamento realizado quando as características do EPI exigirem',
            criticidade: 'alto',
            acao: 'Suspender a liberação do EPI até treinamento ou orientação compatível.',
          },
          {
            subitem: 'Uso somente para a finalidade',
            item: 'Trabalhador utiliza o talabarte apenas para a finalidade a que se destina',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper imediatamente o uso inadequado e substituir a solução por sistema correto.',
          },
          {
            subitem: 'Trabalho em altura',
            item: 'Trabalhador autorizado e capacitado para trabalho em altura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade e substituir o trabalhador até regularização.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-11',
        titulo: 'Higienização, Manutenção, Guarda e Transporte',
        ordem: 11,
        itens: [
          {
            subitem: 'Higienização',
            item: 'Talabarte higienizado conforme instruções do fabricante',
            criticidade: 'alto',
            acao: 'Retirar o talabarte de uso até avaliação da integridade e correção do processo.',
          },
          {
            subitem: 'Manutenção periódica',
            item: 'Manutenção periódica realizada quando aplicável',
            criticidade: 'medio',
            acao: 'Regularizar o controle e restringir o uso se houver impacto na segurança do EPI.',
          },
          {
            subitem: 'Guarda',
            item: 'Talabarte armazenado em local seco, limpo, protegido e organizado',
            criticidade: 'alto',
            acao: 'Readequar imediatamente o armazenamento e reinspecionar os talabartes expostos.',
          },
          {
            subitem: 'Transporte',
            item: 'Transporte do talabarte realizado sem causar danos ou contaminação',
            criticidade: 'medio',
            acao: 'Corrigir imediatamente o acondicionamento e reinspecionar o EPI antes do uso.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-12',
        titulo: 'Bloqueio, Substituição e Descarte',
        ordem: 12,
        itens: [
          {
            subitem: 'Substituição',
            item: 'EPI substituído imediatamente quando danificado ou extraviado',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Providenciar substituição imediata e impedir continuidade da atividade sem EPI adequado.',
          },
          {
            subitem: 'Bloqueio físico',
            item: 'Talabarte com defeito segregado e identificado como inapto',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Segregar e bloquear imediatamente o talabarte até descarte ou tratativa formal.',
          },
          {
            subitem: 'Impacto de queda',
            item: 'Talabarte que sofreu impacto de queda retirado de uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e inutilizar para descarte controlado, salvo exceção formal prevista pelo fabricante.',
          },
          {
            subitem: 'Descarte controlado',
            item: 'Descarte realizado de forma controlada e registrada',
            criticidade: 'alto',
            acao: 'Inutilizar fisicamente e registrar formalmente o descarte imediatamente.',
          },
        ],
      },
      {
        id: 'safety-lanyard-topic-13',
        titulo: 'Condições da Atividade e Integração com o SPIQ',
        ordem: 13,
        itens: [
          {
            subitem: 'Análise de risco',
            item: 'Análise de risco contempla seleção do SPIQ e do talabarte',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até revisão formal da análise de risco.',
          },
          {
            subitem: 'Força de impacto',
            item: 'Sistema selecionado para limitar a força de impacto ao trabalhador',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a configuração do SPIQ até adequação técnica do sistema.',
          },
          {
            subitem: 'Zona livre de queda',
            item: 'Sistema adotado considera a zona livre de queda',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Interromper a atividade até reconfiguração técnica compatível com a zona livre disponível.',
          },
          {
            subitem: 'Resgate',
            item: 'Procedimento de emergência e resgate compatível com a atividade',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até implantação do procedimento de resgate aplicável.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildExtensionLadderTopics(): ChecklistTopicValue[] {
    type ExtensionLadderItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: ExtensionLadderItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: ExtensionLadderItemDefinition[];
    }> = [
      {
        id: 'extension-ladder-topic-1',
        titulo: 'Identificação e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação',
            item: 'Escada com identificação visível do fabricante, modelo e elemento de rastreabilidade',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a escada até identificação formal e rastreável do equipamento.',
          },
          {
            subitem: 'Marcação técnica',
            item: 'Escada com marcação técnica aplicável contendo fabricante, rastreabilidade, carga máxima e demais dados exigíveis',
            criticidade: 'alto',
            acao: 'Retirar de uso até regularização da marcação técnica aplicável.',
          },
          {
            subitem: 'Procedimento operacional',
            item: 'Procedimento operacional de uso e manutenção disponível e aplicável à escada extensível',
            criticidade: 'alto',
            acao: 'Suspender a utilização até disponibilização e divulgação do procedimento operacional.',
          },
          {
            subitem: 'Conteúdo do procedimento',
            item: 'Procedimento contempla orientações básicas, número máximo de usuários, carga máxima e limitações de uso',
            criticidade: 'alto',
            acao: 'Revisar o procedimento antes da liberação da escada para uso operacional.',
          },
          {
            subitem: 'Conformidade técnica',
            item: 'Escada certificada, fabricada ou projetada em conformidade com normas técnicas nacionais vigentes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até validação técnica documental da escada.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-2',
        titulo: 'Uso e Aplicação',
        ordem: 2,
        itens: [
          {
            subitem: 'Finalidade de uso',
            item: 'Uso restrito a serviços de pequeno porte e acessos temporários',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o uso e substituir por equipamento de acesso adequado.',
          },
          {
            subitem: 'Seleção do equipamento',
            item: 'Seleção da escada compatível com a tarefa e com execução segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade e redefinir o meio de acesso ou posto de trabalho mais seguro.',
          },
          {
            subitem: 'Número de usuários',
            item: 'Uso por uma pessoa por vez, salvo previsão expressa do fabricante ou projetista',
            criticidade: 'alto',
            acao: 'Interromper imediatamente o uso compartilhado e restabelecer a condição segura.',
          },
          {
            subitem: 'Carga aplicada',
            item: 'Escada selecionada considerando o peso do trabalhador, equipamentos e materiais',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e redimensionar a solução de acesso.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-3',
        titulo: 'Inspeção e Liberação',
        ordem: 3,
        itens: [
          {
            subitem: 'Inspeção inicial',
            item: 'Escada inspecionada no recebimento ou na liberação inicial para uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até execução da inspeção inicial e formalização da liberação.',
          },
          {
            subitem: 'Inspeção pré-uso',
            item: 'Escada inspecionada antes de cada uso',
            criticidade: 'alto',
            acao: 'Suspender a atividade até realização da inspeção pré-uso.',
          },
          {
            subitem: 'Inspeção periódica',
            item: 'Escada submetida à inspeção periódica conforme fabricante ou projetista',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até nova inspeção periódica válida.',
          },
          {
            subitem: 'Liberação após reparo',
            item: 'Escada reparada liberada somente após nova inspeção do responsável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até reinspeção e nova liberação formal.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-4',
        titulo: 'Integridade Estrutural',
        ordem: 4,
        itens: [
          {
            subitem: 'Montantes',
            item: 'Montantes íntegros, sem trincas, empenos, corrosão, deformações ou danos mecânicos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Degraus',
            item: 'Degraus íntegros, firmes, alinhados e sem danos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Sapatas antiderrapantes',
            item: 'Sapatas ou dispositivos antiderrapantes íntegros e funcionais',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente até substituição do componente.',
          },
          {
            subitem: 'Improvisos',
            item: 'Ausência de improvisos, remendos, soldas indevidas, amarrações ou reparos não autorizados',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a escada e encaminhar para avaliação técnica.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-5',
        titulo: 'Estabilidade, Travamento e Fixação',
        ordem: 5,
        itens: [
          {
            subitem: 'Guias e travas',
            item: 'Guias e travas asseguram o travamento entre os lances deslizantes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Limitador de curso',
            item: 'Escada dotada de dispositivo limitador de curso no posicionamento exigido',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a escada.',
          },
          {
            subitem: 'Sobreposição mínima',
            item: 'Mecanismo assegura sobreposição mínima de 1 m entre os lances quando totalmente estendida',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a escada até adequação.',
          },
          {
            subitem: 'Fixação em mais de um ponto',
            item: 'Escada fixada em mais de um ponto quando a condição operacional permitir',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o uso até fixação adequada ou revisão formal do método.',
          },
          {
            subitem: 'Fixação mínima alternativa',
            item: 'Na impossibilidade de fixação em mais de um ponto, escada fixada em pelo menos um ponto resistente e estável, preferencialmente no nível superior',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até correção da fixação.',
          },
          {
            subitem: 'Situação especial sem fixação',
            item: 'Em situação especial sem fixação, há medida que impeça deslocamento da escada e trabalhador permanece conectado a SPIQ independente',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até restabelecimento das medidas de prevenção.',
          },
          {
            subitem: 'Piso e base',
            item: 'Apoio em piso ou base estável, regular e compatível com a carga',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e reposicionar a escada em base segura.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-6',
        titulo: 'Uso Operacional Seguro',
        ordem: 6,
        itens: [
          {
            subitem: 'Portas e circulação',
            item: 'Escada não posicionada próxima a portas, circulação, aberturas ou vãos sem medidas de prevenção',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até implementação das medidas de prevenção.',
          },
          {
            subitem: 'Prolongamento superior',
            item: 'Escada ultrapassa o nível superior em no mínimo 1 m quando utilizada como meio de acesso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até ajuste da posição ou substituição da escada.',
          },
          {
            subitem: 'Três pontos de contato',
            item: 'Trabalhador mantém 3 pontos de contato na subida e na descida',
            criticidade: 'alto',
            acao: 'Interromper imediatamente a atividade, orientar o trabalhador e reavaliar o método.',
          },
          {
            subitem: 'Posto de trabalho',
            item: 'Escada utilizada como posto de trabalho somente quando a tarefa pode ser executada com segurança',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e substituir por meio de acesso ou posto de trabalho compatível.',
          },
          {
            subitem: 'Proteção contra quedas',
            item: 'Quando não for possível manter 3 pontos de contato no posto de trabalho, há sistema de proteção contra quedas compatível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-7',
        titulo: 'Gestão da Atividade',
        ordem: 7,
        itens: [
          {
            subitem: 'Análise de risco',
            item: 'AR elaborada contemplando o uso da escada, o tipo de acesso mais adequado e as condições impeditivas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até emissão ou revisão da análise de risco.',
          },
          {
            subitem: 'Permissão de trabalho',
            item: 'PT emitida para atividade não rotineira, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até emissão da PT.',
          },
          {
            subitem: 'Trabalhador autorizado',
            item: 'Trabalhador formalmente autorizado para atividade em altura com escada de uso individual',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade e substituir o executante.',
          },
          {
            subitem: 'Capacitação',
            item: 'Trabalhador capacitado em NR-35 e orientado quanto ao uso seguro da escada de uso individual',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até capacitação adequada.',
          },
          {
            subitem: 'Aptidão',
            item: 'Trabalhador com aptidão ocupacional compatível com trabalho em altura, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade para o trabalhador não apto.',
          },
          {
            subitem: 'Condições impeditivas',
            item: 'Condições impeditivas definidas no procedimento e na análise de risco e conhecidas pela equipe',
            criticidade: 'alto',
            acao: 'Suspender a atividade até revisão documental e alinhamento da equipe.',
          },
          {
            subitem: 'Plano de emergência e resgate',
            item: 'Atividade possui plano de emergência e resgate compatível, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até implantação do plano de emergência e resgate.',
          },
        ],
      },
      {
        id: 'extension-ladder-topic-8',
        titulo: 'Bloqueio e Interdição',
        ordem: 8,
        itens: [
          {
            subitem: 'Retirada de uso por defeito',
            item: 'Escada é retirada de uso ao apresentar defeitos ou imperfeições que comprometam o desempenho',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e segregar fisicamente a escada.',
          },
          {
            subitem: 'Identificação de interdição',
            item: 'Escada interditada identificada de forma visível como inapta ao uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Aplicar bloqueio e identificação visível de interdição imediatamente.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildStepLadderTopics(): ChecklistTopicValue[] {
    type StepLadderItemDefinition = {
      subitem: string;
      item: string;
      criticidade?: 'critico' | 'alto' | 'medio' | 'baixo';
      bloqueia?: boolean;
      observacaoObrigatoria?: boolean;
      fotoObrigatoria?: boolean;
      acao?: string;
    };

    const createTopicItems = (
      items: StepLadderItemDefinition[],
    ): ChecklistItemValue[] =>
      items.map((definition) => ({
        item: `${definition.subitem} - ${definition.item}`,
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        criticidade: definition.criticidade,
        bloqueia_operacao_quando_nc: definition.bloqueia,
        exige_observacao_quando_nc:
          definition.observacaoObrigatoria ?? Boolean(definition.bloqueia),
        exige_foto_quando_nc: definition.fotoObrigatoria,
        acao_corretiva_imediata: definition.acao,
      }));

    const topics: Array<{
      id: string;
      titulo: string;
      ordem: number;
      itens: StepLadderItemDefinition[];
    }> = [
      {
        id: 'step-ladder-topic-1',
        titulo: 'Identificação e Documentação',
        ordem: 1,
        itens: [
          {
            subitem: 'Identificação',
            item: 'Escada com identificação visível do fabricante, modelo e elemento de rastreabilidade',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a escada até identificação formal e rastreável do equipamento.',
          },
          {
            subitem: 'Marcação técnica',
            item: 'Escada com marcação técnica aplicável contendo fabricante, rastreabilidade, peso, carga máxima e demais dados exigíveis',
            criticidade: 'alto',
            acao: 'Retirar de uso até regularização da marcação técnica aplicável.',
          },
          {
            subitem: 'Procedimento operacional',
            item: 'Procedimento operacional de uso e manutenção disponível e aplicável à escada de abrir',
            criticidade: 'alto',
            acao: 'Suspender a utilização até disponibilização e divulgação do procedimento operacional.',
          },
          {
            subitem: 'Conteúdo do procedimento',
            item: 'Procedimento contempla orientações básicas, número máximo de usuários, carga máxima e limitações de uso',
            criticidade: 'alto',
            acao: 'Revisar o procedimento antes da liberação da escada para uso operacional.',
          },
          {
            subitem: 'Conformidade técnica',
            item: 'Escada certificada, fabricada ou projetada em conformidade com normas técnicas nacionais vigentes',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até validação técnica documental da escada.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-2',
        titulo: 'Uso e Aplicação',
        ordem: 2,
        itens: [
          {
            subitem: 'Finalidade de uso',
            item: 'Uso restrito a serviços de pequeno porte e acessos temporários',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente o uso e substituir por equipamento de acesso adequado.',
          },
          {
            subitem: 'Seleção do equipamento',
            item: 'Seleção da escada compatível com a tarefa e com execução segura',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Suspender a atividade e redefinir o meio de acesso ou posto de trabalho mais seguro.',
          },
          {
            subitem: 'Número de usuários',
            item: 'Uso por uma pessoa por vez, salvo previsão expressa do fabricante ou projetista',
            criticidade: 'alto',
            acao: 'Interromper imediatamente o uso compartilhado e restabelecer a condição segura.',
          },
          {
            subitem: 'Carga aplicada',
            item: 'Carga aplicada compatível com a capacidade máxima informada pelo fabricante ou projetista',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e redimensionar a solução de acesso.',
          },
          {
            subitem: 'Comprimento máximo',
            item: 'Comprimento da escada dentro do limite normativo aplicável quando fechada',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e substituir por solução tecnicamente adequada.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-3',
        titulo: 'Inspeção e Liberação',
        ordem: 3,
        itens: [
          {
            subitem: 'Inspeção inicial',
            item: 'Escada inspecionada no recebimento ou na liberação inicial para uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até execução da inspeção inicial e formalização da liberação.',
          },
          {
            subitem: 'Inspeção pré-uso',
            item: 'Escada inspecionada antes de cada uso',
            criticidade: 'alto',
            acao: 'Suspender a atividade até realização da inspeção pré-uso.',
          },
          {
            subitem: 'Inspeção periódica',
            item: 'Escada submetida à inspeção periódica conforme fabricante ou procedimento interno',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até nova inspeção periódica válida.',
          },
          {
            subitem: 'Liberação após reparo',
            item: 'Escada reparada liberada somente após nova inspeção do responsável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até reinspeção e nova liberação formal.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-4',
        titulo: 'Integridade Estrutural',
        ordem: 4,
        itens: [
          {
            subitem: 'Montantes',
            item: 'Montantes íntegros, sem trincas, empenos, corrosão, deformações ou danos mecânicos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Degraus',
            item: 'Degraus íntegros, firmes, alinhados e sem danos',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Articuladores e dobradiças',
            item: 'Articuladores, dobradiças, travas e limitadores em perfeito estado de conservação e funcionamento',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente e retirar a escada de uso.',
          },
          {
            subitem: 'Sapatas antiderrapantes',
            item: 'Sapatas ou dispositivos antiderrapantes íntegros e funcionais',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente até substituição do componente.',
          },
          {
            subitem: 'Limpeza e contaminação',
            item: 'Escada limpa e sem óleo, graxa, tinta ou contaminantes que comprometam aderência, inspeção ou estabilidade',
            criticidade: 'alto',
            acao: 'Retirar de uso até limpeza adequada e reavaliação da condição de segurança.',
          },
          {
            subitem: 'Improvisos',
            item: 'Ausência de improvisos, remendos, soldas indevidas, amarrações ou reparos não autorizados',
            criticidade: 'critico',
            bloqueia: true,
            fotoObrigatoria: true,
            acao: 'Bloquear imediatamente a escada e encaminhar para avaliação técnica.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-5',
        titulo: 'Estabilidade e Posicionamento',
        ordem: 5,
        itens: [
          {
            subitem: 'Limitadores de abertura',
            item: 'Limitadores de abertura operantes na abertura máxima',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a escada.',
          },
          {
            subitem: 'Posição de uso',
            item: 'Escada utilizada somente na abertura máxima e nas posições indicadas pelo fabricante',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e corrigir o posicionamento ou retirar de uso.',
          },
          {
            subitem: 'Piso e base',
            item: 'Piso estável, nivelado e compatível com o uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e reposicionar a escada em base segura.',
          },
          {
            subitem: 'Interferências do entorno',
            item: 'Escada posicionada sem interferência de portas, circulação, desníveis, obstáculos ou risco de impacto lateral',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente até eliminação das interferências e controle da área.',
          },
          {
            subitem: 'Ferramentas e materiais',
            item: 'Ferramentas e materiais não comprometem a estabilidade da escada',
            criticidade: 'alto',
            acao: 'Interromper a atividade e reconfigurar o método de trabalho.',
          },
          {
            subitem: 'Materiais apoiados',
            item: 'Materiais apoiados na escada protegidos contra queda acidental, quando aplicável',
            criticidade: 'alto',
            acao: 'Suspender a atividade até implantação de contenção ou retirada do material da escada.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-6',
        titulo: 'Uso Operacional Seguro',
        ordem: 6,
        itens: [
          {
            subitem: 'Três pontos de contato',
            item: 'Trabalhador mantém 3 pontos de contato na subida e na descida',
            criticidade: 'alto',
            acao: 'Interromper imediatamente a atividade, orientar o trabalhador e reavaliar o método.',
          },
          {
            subitem: 'Posto de trabalho',
            item: 'Escada utilizada como posto de trabalho somente quando a tarefa pode ser executada com segurança',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e substituir por meio de acesso ou posto de trabalho compatível.',
          },
          {
            subitem: 'Proteção contra quedas',
            item: 'Quando não for possível manter 3 pontos de contato no posto de trabalho, há sistema de proteção contra quedas compatível',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade.',
          },
          {
            subitem: 'Postura e alcance',
            item: 'Trabalhador executa a tarefa sem projeção excessiva do tronco, sem alcance lateral crítico e sem perder o equilíbrio',
            criticidade: 'alto',
            acao: 'Interromper a atividade e readequar posicionamento, método ou equipamento.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-7',
        titulo: 'Gestão da Atividade',
        ordem: 7,
        itens: [
          {
            subitem: 'Análise de risco',
            item: 'AR elaborada contemplando o uso da escada, o tipo de acesso mais adequado e as condições impeditivas',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até emissão ou revisão da análise de risco.',
          },
          {
            subitem: 'Permissão de trabalho',
            item: 'PT emitida para atividade não rotineira, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até emissão da PT.',
          },
          {
            subitem: 'Trabalhador autorizado',
            item: 'Trabalhador formalmente autorizado para atividade em altura com escada de uso individual',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade e substituir o executante.',
          },
          {
            subitem: 'Capacitação',
            item: 'Trabalhador capacitado em NR-35 e orientado quanto ao uso seguro da escada de uso individual',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até capacitação adequada.',
          },
          {
            subitem: 'Aptidão',
            item: 'Trabalhador com aptidão ocupacional compatível com trabalho em altura, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade para o trabalhador não apto.',
          },
          {
            subitem: 'Condições impeditivas',
            item: 'Condições impeditivas definidas no procedimento e na análise de risco e conhecidas pela equipe',
            criticidade: 'alto',
            acao: 'Suspender a atividade até revisão documental e alinhamento da equipe.',
          },
          {
            subitem: 'Plano de emergência e resgate',
            item: 'Atividade possui plano de emergência e resgate compatível, quando aplicável',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente a atividade até implantação do plano de emergência e resgate.',
          },
        ],
      },
      {
        id: 'step-ladder-topic-8',
        titulo: 'Bloqueio, Interdição e Pós-Uso',
        ordem: 8,
        itens: [
          {
            subitem: 'Retirada de uso por defeito',
            item: 'Escada é retirada de uso ao apresentar defeitos ou imperfeições que comprometam o desempenho',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Bloquear imediatamente e segregar fisicamente a escada.',
          },
          {
            subitem: 'Identificação de interdição',
            item: 'Escada interditada identificada de forma visível como inapta ao uso',
            criticidade: 'critico',
            bloqueia: true,
            acao: 'Aplicar bloqueio e identificação visível de interdição imediatamente.',
          },
          {
            subitem: 'Armazenamento e transporte',
            item: 'Escada armazenada e transportada sem causar danos à estrutura e sem exposição a agentes agressivos',
            criticidade: 'medio',
            acao: 'Corrigir o acondicionamento e reinspecionar a escada antes do próximo uso.',
          },
        ],
      },
    ];

    return topics.map((topic) => ({
      id: topic.id,
      titulo: topic.titulo,
      ordem: topic.ordem,
      itens: createTopicItems(topic.itens),
    }));
  }

  private buildNr24PresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - NR24',
      descricao:
        'Modelo padrão do sistema para verificação de condições de vivência e higiene ocupacional conforme NR24.',
      categoria: 'Operacional',
      periodicidade: 'Conforme rotina',
      nivel_risco_padrao: 'Médio',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildNr24OperationalTopics(),
      }),
    };
  }

  private buildNr10PresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - NR10',
      descricao:
        'Modelo padrão do sistema para verificação operacional de conformidade em segurança com instalações e serviços em eletricidade conforme NR-10.',
      categoria: 'Operacional',
      periodicidade: 'Por atividade',
      nivel_risco_padrao: 'Alto',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildNr10OperationalTopics(),
      }),
    };
  }

  private buildNr12PresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - NR12',
      descricao:
        'Modelo padrão do sistema para verificação operacional de conformidade em segurança no trabalho em máquinas e equipamentos conforme NR-12.',
      categoria: 'Operacional',
      periodicidade: 'Por atividade',
      nivel_risco_padrao: 'Alto',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildNr12OperationalTopics(),
      }),
    };
  }

  private buildLotoPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - LOTO',
      descricao:
        'Modelo padrão do sistema para verificação operacional de bloqueio e etiquetagem de energias perigosas.',
      categoria: 'Operacional',
      periodicidade: 'Por intervenção',
      nivel_risco_padrao: 'Alto',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildLotoOperationalTopics(),
      }),
    };
  }

  private buildNr35PresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - NR35',
      descricao:
        'Modelo padrão do sistema para verificação operacional de conformidade em trabalho em altura conforme NR-35.',
      categoria: 'Operacional',
      periodicidade: 'Por atividade',
      nivel_risco_padrao: 'Alto',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildNr35OperationalTopics(),
      }),
    };
  }

  private buildNr33PresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist Operacional - NR33',
      descricao:
        'Modelo padrão do sistema para verificação operacional de conformidade em entrada e trabalho em espaço confinado conforme NR-33.',
      categoria: 'Operacional',
      periodicidade: 'Por atividade',
      nivel_risco_padrao: 'Alto',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildNr33OperationalTopics(),
      }),
    };
  }

  private buildWeldingMachinePresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Máquina de Solda',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, integridade, segurança elétrica, operação, bloqueio e pós-uso de máquina de solda.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Máquina de Solda',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildWeldingMachineTopics(),
      }),
    };
  }

  private buildGrinderPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Lixadeira',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, integridade, segurança elétrica, operação, bloqueio e pós-uso de lixadeira.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Lixadeira',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildGrinderTopics(),
      }),
    };
  }

  private buildPemtPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Plataforma Elevatória Elétrica (PEMT)',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, operação segura, manutenção e bloqueio de plataforma elevatória elétrica.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Plataforma Elevatória Elétrica (PEMT)',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildPemtTopics(),
      }),
    };
  }

  private buildPortableDrillPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Furadeira/Parafusadeira Portátil',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, controle de risco elétrico, manutenção, bloqueio e pós-uso de furadeira/parafusadeira portátil.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Furadeira/Parafusadeira Portátil',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildPortableDrillTopics(),
      }),
    };
  }

  private buildSafetyLanyardPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Talabarte de Segurança',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, compatibilidade, conservação, higienização, bloqueio e descarte de talabarte de segurança.',
      categoria: 'EPI',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Talabarte de Segurança',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildSafetyLanyardTopics(),
      }),
    };
  }

  private buildExtensionLadderPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Escada Extensível',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, integridade, uso seguro, acesso temporário, bloqueio e interdição de escada extensível de uso individual.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Escada Extensível',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildExtensionLadderTopics(),
      }),
    };
  }

  private buildStepLadderPresetTemplateDefinition(): PresetChecklistTemplateDefinition {
    return {
      titulo: 'Checklist - Escada de Abrir',
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, integridade, estabilidade, uso seguro, bloqueio e interdição de escada de abrir de uso individual.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Escada de Abrir',
      itens: this.resolveChecklistItemsForPersistence({
        topicos: this.buildStepLadderTopics(),
      }),
    };
  }

  constructor(
    @InjectRepository(Checklist)
    private checklistsRepository: Repository<Checklist>,
    private tenantService: TenantService,
    private dataSource: DataSource,
    @Inject(forwardRef(() => MailService))
    private mailService: MailService,
    private signaturesService: SignaturesService,
    private notificationsGateway: NotificationsGateway,
    private readonly documentStorageService: DocumentStorageService,
    private usersService: UsersService,
    private sitesService: SitesService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentRegistryService: DocumentRegistryService,
    private readonly fileParserService: FileParserService,
    private readonly configService: ConfigService,
    private readonly integrationResilienceService: IntegrationResilienceService,
    private readonly openAiCircuitBreaker: OpenAiCircuitBreakerService,
  ) {}

  private readonly checklistListSelect: FindOptionsSelect<Checklist> = {
    id: true,
    titulo: true,
    descricao: true,
    equipamento: true,
    maquina: true,
    data: true,
    status: true,
    company_id: true,
    site_id: true,
    inspetor_id: true,
    is_modelo: true,
    created_at: true,
    updated_at: true,
    pdf_file_key: true,
    pdf_folder_path: true,
    pdf_original_name: true,
    company: {
      id: true,
      razao_social: true,
    } as FindOptionsSelect<Company>,
    site: {
      id: true,
      nome: true,
    },
    inspetor: {
      id: true,
      nome: true,
    },
  };

  private assertChecklistExecutionRequirements(
    checklist: Pick<Checklist, 'is_modelo' | 'site_id' | 'inspetor_id'>,
  ) {
    if (checklist.is_modelo) {
      return;
    }

    if (!checklist.site_id) {
      throw new BadRequestException(
        'Checklist operacional exige obra/setor vinculado.',
      );
    }

    if (!checklist.inspetor_id) {
      throw new BadRequestException(
        'Checklist operacional exige inspetor responsável.',
      );
    }
  }

  private assertChecklistDocumentMutable(
    checklist: Pick<Checklist, 'is_modelo' | 'pdf_file_key'>,
  ) {
    if (
      typeof this.tenantService.isSuperAdmin === 'function' &&
      this.tenantService.isSuperAdmin()
    ) {
      return;
    }

    if (checklist.is_modelo) {
      return;
    }

    if (checklist.pdf_file_key) {
      throw new BadRequestException(
        'Checklist com PDF final emitido. Edição bloqueada. Gere um novo checklist para alterar o documento.',
      );
    }
  }

  private async assertChecklistReadyForFinalPdf(
    checklist: Pick<
      Checklist,
      'id' | 'is_modelo' | 'site_id' | 'inspetor_id' | 'pdf_file_key'
    >,
  ) {
    if (checklist.is_modelo) {
      throw new BadRequestException(
        'Modelos de checklist não podem ser emitidos como documento final.',
      );
    }

    this.assertChecklistExecutionRequirements(checklist);
    this.assertChecklistDocumentMutable(checklist);

    const signatures = await this.signaturesService.findByDocument(
      checklist.id,
      'CHECKLIST',
    );

    if (!signatures.length) {
      throw new BadRequestException(
        'Checklist precisa de ao menos uma assinatura antes da emissão do PDF final.',
      );
    }
  }

  private logChecklistEvent(
    event: string,
    checklist: Pick<Checklist, 'id' | 'company_id'> | null,
    extra?: Record<string, unknown>,
  ) {
    this.logger.log({
      event,
      checklistId: checklist?.id ?? null,
      companyId: checklist?.company_id ?? this.tenantService.getTenantId(),
      requestId: RequestContext.getRequestId(),
      actorId: RequestContext.getUserId(),
      ...extra,
    });
  }

  private getInlineImageByteLength(imageData: string): number {
    const trimmed = imageData.trim();
    const base64 = trimmed.includes(',')
      ? trimmed.split(',')[1] || ''
      : trimmed;
    const normalized = base64.replace(/\s+/g, '');

    if (!normalized) {
      return 0;
    }

    const padding = normalized.endsWith('==')
      ? 2
      : normalized.endsWith('=')
        ? 1
        : 0;

    return Math.floor((normalized.length * 3) / 4) - padding;
  }

  private encodeBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private decodeBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private buildGovernedChecklistPhotoReference(
    payload: GovernedChecklistPhotoReferencePayload,
  ): string {
    return `${GOVERNED_CHECKLIST_PHOTO_REF_PREFIX}${this.encodeBase64Url(JSON.stringify(payload))}`;
  }

  private parseGovernedChecklistPhotoReference(
    value?: string | null,
  ): GovernedChecklistPhotoReferencePayload | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (
      !normalized ||
      !normalized.startsWith(GOVERNED_CHECKLIST_PHOTO_REF_PREFIX)
    ) {
      return null;
    }

    const encodedPayload = normalized.slice(
      GOVERNED_CHECKLIST_PHOTO_REF_PREFIX.length,
    );
    if (!encodedPayload) {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decodeBase64Url(encodedPayload));
    } catch {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      (parsed as GovernedChecklistPhotoReferencePayload).v !== 1 ||
      (parsed as GovernedChecklistPhotoReferencePayload).kind !==
        'governed-storage' ||
      ((parsed as GovernedChecklistPhotoReferencePayload).scope !==
        'equipment' &&
        (parsed as GovernedChecklistPhotoReferencePayload).scope !== 'item') ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).fileKey !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).originalName !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).mimeType !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).uploadedAt !==
        'string'
    ) {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    return parsed as GovernedChecklistPhotoReferencePayload;
  }

  private normalizeInlineImage(
    imageData: unknown,
    fieldLabel: string,
  ): string | undefined {
    if (typeof imageData !== 'string') {
      return undefined;
    }

    const trimmed = imageData.trim();
    if (!trimmed) {
      return undefined;
    }

    if (/^javascript:/i.test(trimmed)) {
      throw new BadRequestException(`${fieldLabel} possui URL inválida.`);
    }

    if (!trimmed.startsWith('data:image/')) {
      return trimmed;
    }

    const matchesDataImage = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
      trimmed,
    );
    if (!matchesDataImage) {
      throw new BadRequestException(`${fieldLabel} possui formato inválido.`);
    }

    const byteLength = this.getInlineImageByteLength(trimmed);
    if (byteLength > ChecklistsService.MAX_INLINE_IMAGE_BYTES) {
      throw new BadRequestException(
        `${fieldLabel} excede o limite de ${Math.floor(
          ChecklistsService.MAX_INLINE_IMAGE_BYTES / 1024 / 1024,
        )} MB.`,
      );
    }

    return trimmed;
  }

  private normalizeChecklistPhotoReference(
    imageData: unknown,
    fieldLabel: string,
    options?: {
      allowedGovernedReferences?: Set<string>;
    },
  ): string | undefined {
    if (typeof imageData !== 'string') {
      return undefined;
    }

    const normalized = imageData.trim();
    if (!normalized) {
      return undefined;
    }

    const governedPayload =
      this.parseGovernedChecklistPhotoReference(normalized);
    if (governedPayload) {
      if (!options?.allowedGovernedReferences?.has(normalized)) {
        throw new BadRequestException(
          `${fieldLabel} deve ser enviado pelo endpoint governado de fotos do checklist.`,
        );
      }
      return normalized;
    }

    return this.normalizeInlineImage(imageData, fieldLabel);
  }

  private getAllowedGovernedChecklistPhotoReferences(
    checklist: Pick<Checklist, 'foto_equipamento' | 'itens'>,
  ): Set<string> {
    return new Set(
      this.getGovernedChecklistPhotoEntries(checklist).map(
        (entry) => entry.reference,
      ),
    );
  }

  private getGovernedChecklistPhotoEntries(
    checklist: Pick<Checklist, 'foto_equipamento' | 'itens'>,
  ): Array<{
    reference: string;
    payload: GovernedChecklistPhotoReferencePayload;
    scope: 'equipment' | 'item';
    itemIndex: number | null;
    photoIndex: number | null;
  }> {
    const entries: Array<{
      reference: string;
      payload: GovernedChecklistPhotoReferencePayload;
      scope: 'equipment' | 'item';
      itemIndex: number | null;
      photoIndex: number | null;
    }> = [];

    if (typeof checklist.foto_equipamento === 'string') {
      const payload = this.parseGovernedChecklistPhotoReference(
        checklist.foto_equipamento,
      );
      if (payload) {
        entries.push({
          reference: checklist.foto_equipamento,
          payload,
          scope: 'equipment',
          itemIndex: null,
          photoIndex: null,
        });
      }
    }

    (Array.isArray(checklist.itens) ? checklist.itens : []).forEach(
      (item, itemIndex) => {
        (Array.isArray(item?.fotos) ? item.fotos : []).forEach(
          (photo, photoIndex) => {
            const payload = this.parseGovernedChecklistPhotoReference(photo);
            if (!payload) {
              return;
            }
            entries.push({
              reference: photo,
              payload,
              scope: 'item',
              itemIndex,
              photoIndex,
            });
          },
        );
      },
    );

    return entries;
  }

  private buildChecklistAlphabeticLabel(index: number): string {
    let value = index + 1;
    let label = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }

    return label;
  }

  private normalizeChecklistSubitems(
    subitems: unknown,
  ): ChecklistSubitemValue[] {
    if (!Array.isArray(subitems)) {
      return [];
    }

    return subitems
      .map((subitem, index) => {
        const current =
          subitem && typeof subitem === 'object'
            ? (subitem as Record<string, unknown>)
            : {};
        const texto =
          typeof current.descricao === 'string'
            ? current.descricao.trim()
            : typeof current.texto === 'string'
              ? current.texto.trim()
              : typeof current.item === 'string'
                ? current.item.trim()
                : '';

        if (!texto) {
          return null;
        }

        const normalized: ChecklistSubitemValue = {
          texto,
          ordem:
            typeof current.ordem === 'number' && Number.isFinite(current.ordem)
              ? current.ordem
              : index + 1,
          status:
            typeof current.status === 'string' || typeof current.status === 'boolean'
              ? (current.status as ChecklistSubitemValue['status'])
              : undefined,
          resposta: current.resposta,
          observacao:
            typeof current.observacao === 'string'
              ? current.observacao.trim()
              : '',
        };

        if (typeof current.id === 'string' && current.id.trim()) {
          normalized.id = current.id.trim();
        }

        return normalized;
      })
      .filter((value): value is ChecklistSubitemValue => value !== null);
  }

  private normalizeChecklistBarrierType(
    value: unknown,
  ): ChecklistItemValue['barreira_tipo'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized || !CHECKLIST_BARRIER_TYPE_SET.has(normalized)) {
      return undefined;
    }

    return normalized as ChecklistItemValue['barreira_tipo'];
  }

  private normalizeChecklistCriticality(
    value: unknown,
  ): ChecklistItemValue['criticidade'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized || !CHECKLIST_ITEM_CRITICALITY_SET.has(normalized)) {
      return undefined;
    }

    return normalized as ChecklistItemValue['criticidade'];
  }

  private normalizeChecklistPositiveNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }

    return value;
  }

  private classifyChecklistItemAssessment(
    item: Record<string, unknown>,
  ): 'rompido' | 'degradado' | 'pendente' | 'integro' {
    const assessmentStatuses = this.getChecklistAssessmentStatuses(item);

    if (!assessmentStatuses.length) {
      return 'pendente';
    }

    let hasApplicableStatus = false;

    for (const status of assessmentStatuses) {
      if (
        status === 'nok' ||
        status === 'nao' ||
        status === false ||
        status === 'Não Conforme'
      ) {
        const isCritical =
          this.normalizeChecklistCriticality(item.criticidade) === 'critico';
        const blocksOperation =
          typeof item.bloqueia_operacao_quando_nc === 'boolean'
            ? item.bloqueia_operacao_quando_nc
            : false;
        return isCritical || blocksOperation ? 'rompido' : 'degradado';
      }

      if (
        status !== undefined &&
        status !== null &&
        status !== '' &&
        status !== 'Pendente'
      ) {
        hasApplicableStatus = true;
      }
    }

    return hasApplicableStatus ? 'integro' : 'pendente';
  }

  private normalizeChecklistItemValue(
    item: unknown,
    options?: {
      topicoId?: string;
      topicoTitulo?: string;
      topicoDescricao?: string;
      ordemTopico?: number;
      ordemItem?: number;
      barreiraTipo?: ChecklistItemValue['barreira_tipo'];
      pesoBarreira?: number;
      limiteRuptura?: number;
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue | null {
    const current =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};
    const itemTitle =
      typeof current.item === 'string' ? current.item.trim() : '';

    if (!itemTitle) {
      return null;
    }

    const normalizedItem: ChecklistItemValue = {
      id:
        typeof current.id === 'string' && current.id.trim()
          ? current.id.trim()
          : undefined,
      item: itemTitle,
      topico_id:
        typeof current.topico_id === 'string' && current.topico_id.trim()
          ? current.topico_id.trim()
          : options?.topicoId,
      topico_titulo:
        typeof current.topico_titulo === 'string' &&
        current.topico_titulo.trim()
          ? current.topico_titulo.trim()
          : options?.topicoTitulo,
      topico_descricao:
        typeof current.topico_descricao === 'string' &&
        current.topico_descricao.trim()
          ? current.topico_descricao.trim()
          : options?.topicoDescricao,
      ordem_topico:
        typeof current.ordem_topico === 'number' &&
        Number.isFinite(current.ordem_topico)
          ? current.ordem_topico
          : options?.ordemTopico,
      ordem_item:
        typeof current.ordem_item === 'number' &&
        Number.isFinite(current.ordem_item)
          ? current.ordem_item
          : options?.ordemItem,
      tipo_resposta:
        typeof current.tipo_resposta === 'string'
          ? (current.tipo_resposta as ChecklistItemValue['tipo_resposta'])
          : 'sim_nao_na',
      obrigatorio:
        typeof current.obrigatorio === 'boolean'
          ? current.obrigatorio
          : Boolean(current.obrigatorio ?? true),
      peso:
        typeof current.peso === 'number' && Number.isFinite(current.peso)
          ? current.peso
          : 1,
      barreira_tipo:
        this.normalizeChecklistBarrierType(current.barreira_tipo) ??
        options?.barreiraTipo,
      peso_barreira:
        this.normalizeChecklistPositiveNumber(current.peso_barreira) ??
        options?.pesoBarreira,
      limite_ruptura:
        this.normalizeChecklistPositiveNumber(current.limite_ruptura) ??
        options?.limiteRuptura,
      criticidade: this.normalizeChecklistCriticality(current.criticidade),
      bloqueia_operacao_quando_nc:
        typeof current.bloqueia_operacao_quando_nc === 'boolean'
          ? current.bloqueia_operacao_quando_nc
          : undefined,
      exige_foto_quando_nc:
        typeof current.exige_foto_quando_nc === 'boolean'
          ? current.exige_foto_quando_nc
          : undefined,
      exige_observacao_quando_nc:
        typeof current.exige_observacao_quando_nc === 'boolean'
          ? current.exige_observacao_quando_nc
          : undefined,
      acao_corretiva_imediata:
        typeof current.acao_corretiva_imediata === 'string' &&
        current.acao_corretiva_imediata.trim()
          ? current.acao_corretiva_imediata.trim()
          : undefined,
      subitens: this.normalizeChecklistSubitems(current.subitens),
    };

    if (options?.resetExecutionState) {
      normalizedItem.status =
        normalizedItem.tipo_resposta === 'conforme'
          ? ('ok' as ChecklistItemValue['status'])
          : ('sim' as ChecklistItemValue['status']);
      normalizedItem.resposta = '';
      normalizedItem.observacao = '';
      normalizedItem.fotos = [];
    } else {
      normalizedItem.status =
        typeof current.status === 'string' || typeof current.status === 'boolean'
          ? (current.status as ChecklistItemValue['status'])
          : 'ok';
      normalizedItem.resposta = current.resposta ?? '';
      normalizedItem.observacao =
        typeof current.observacao === 'string' ? current.observacao : '';
      normalizedItem.fotos = Array.isArray(current.fotos)
        ? current.fotos.filter((value): value is string => typeof value === 'string')
        : [];
    }

    return normalizedItem;
  }

  private normalizeChecklistItems(
    items: unknown,
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item, index) =>
        this.normalizeChecklistItemValue(item, {
          ...options,
          ordemItem: index + 1,
        }),
      )
      .filter((value): value is ChecklistItemValue => value !== null)
      .map((item, index) => ({
        ...item,
        fotos: Array.isArray(item.fotos)
          ? item.fotos
              .map((photo) =>
                this.normalizeChecklistPhotoReference(
                  photo,
                  `Foto do item ${index + 1} do checklist`,
                  {
                    allowedGovernedReferences: options?.allowedGovernedReferences,
                  },
                ),
              )
              .filter((photo): photo is string => Boolean(photo))
          : [],
      }));
  }

  private flattenChecklistTopics(
    topicos: unknown,
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    if (!Array.isArray(topicos)) {
      return [];
    }

    return topicos.flatMap((topico, topicoIndex) => {
      const current =
        topico && typeof topico === 'object'
          ? (topico as Record<string, unknown>)
          : {};
      const topicoId =
        typeof current.id === 'string' && current.id.trim()
          ? current.id.trim()
          : `topic-${topicoIndex + 1}`;
      const topicoTitulo =
        typeof current.titulo === 'string' && current.titulo.trim()
          ? current.titulo.trim()
          : `Tópico ${topicoIndex + 1}`;
      const topicoDescricao =
        typeof current.descricao === 'string' && current.descricao.trim()
          ? current.descricao.trim()
          : undefined;
      const barreiraTipo = this.normalizeChecklistBarrierType(
        current.barreira_tipo,
      );
      const pesoBarreira = this.normalizeChecklistPositiveNumber(
        current.peso_barreira,
      );
      const limiteRuptura = this.normalizeChecklistPositiveNumber(
        current.limite_ruptura,
      );
      const topicItems = Array.isArray(current.itens)
        ? current.itens
        : Array.isArray(current.items)
          ? current.items
          : [];

      return topicItems
        .map((item, itemIndex) =>
          this.normalizeChecklistItemValue(item, {
            ...options,
            topicoId,
            topicoTitulo,
            topicoDescricao,
            ordemTopico:
              typeof current.ordem === 'number' && Number.isFinite(current.ordem)
                ? current.ordem
                : topicoIndex + 1,
            ordemItem: itemIndex + 1,
            barreiraTipo,
            pesoBarreira,
            limiteRuptura,
          }),
        )
        .filter((value): value is ChecklistItemValue => value !== null);
    });
  }

  private buildChecklistTopicMetadataMap(topicos: unknown) {
    if (!Array.isArray(topicos)) {
      return new Map<
        string,
        {
          titulo?: string;
          descricao?: string;
          ordem?: number;
          barreira_tipo?: ChecklistItemValue['barreira_tipo'];
          peso_barreira?: number;
          limite_ruptura?: number;
        }
      >();
    }

    const metadata = new Map<
      string,
      {
        titulo?: string;
        descricao?: string;
        ordem?: number;
        barreira_tipo?: ChecklistItemValue['barreira_tipo'];
        peso_barreira?: number;
        limite_ruptura?: number;
      }
    >();

    topicos.forEach((topico, index) => {
      const current =
        topico && typeof topico === 'object'
          ? (topico as Record<string, unknown>)
          : {};
      const topicoId =
        typeof current.id === 'string' && current.id.trim()
          ? current.id.trim()
          : '';

      if (!topicoId) {
        return;
      }

      metadata.set(topicoId, {
        titulo:
          typeof current.titulo === 'string' && current.titulo.trim()
            ? current.titulo.trim()
            : undefined,
        descricao:
          typeof current.descricao === 'string' && current.descricao.trim()
            ? current.descricao.trim()
            : undefined,
        ordem:
          typeof current.ordem === 'number' && Number.isFinite(current.ordem)
            ? current.ordem
            : index + 1,
        barreira_tipo: this.normalizeChecklistBarrierType(current.barreira_tipo),
        peso_barreira: this.normalizeChecklistPositiveNumber(
          current.peso_barreira,
        ),
        limite_ruptura: this.normalizeChecklistPositiveNumber(
          current.limite_ruptura,
        ),
      });
    });

    return metadata;
  }

  private resolveChecklistItemsForPersistence(
    input: {
      itens?: unknown;
      topicos?: unknown;
    },
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    const hasTopics = Array.isArray(input.topicos) && input.topicos.length > 0;
    const topicMetadata = this.buildChecklistTopicMetadataMap(input.topicos);

    if (hasTopics) {
      const flattened = this.flattenChecklistTopics(input.topicos, options);
      if (flattened.length > 0) {
        return flattened;
      }
    }

    return this.normalizeChecklistItems(input.itens, options).map((item) => {
      const topic =
        typeof item.topico_id === 'string' ? topicMetadata.get(item.topico_id) : undefined;

      if (!topic) {
        return item;
      }

      return {
        ...item,
        topico_titulo: item.topico_titulo || topic.titulo,
        topico_descricao: item.topico_descricao || topic.descricao,
        ordem_topico:
          typeof item.ordem_topico === 'number' ? item.ordem_topico : topic.ordem,
        barreira_tipo: item.barreira_tipo ?? topic.barreira_tipo,
        peso_barreira: item.peso_barreira ?? topic.peso_barreira,
        limite_ruptura: item.limite_ruptura ?? topic.limite_ruptura,
      };
    });
  }

  private buildChecklistTopicsFromItems(
    items: ChecklistItemValue[] | undefined,
  ): ChecklistTopicValue[] {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }

    const topics = new Map<
      string,
      ChecklistTopicValue & { __firstSeen: number }
    >();

    items.forEach((item, index) => {
      const title =
        typeof item.topico_titulo === 'string' && item.topico_titulo.trim()
          ? item.topico_titulo.trim()
          : 'Itens do checklist';
      const id =
        typeof item.topico_id === 'string' && item.topico_id.trim()
          ? item.topico_id.trim()
          : `topic-${title.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'legacy'}`;
      const existing = topics.get(id);
      const nextItem = {
        ...item,
        subitens: this.normalizeChecklistSubitems(item.subitens),
      };

      if (!existing) {
        topics.set(id, {
          id,
          titulo: title,
          descricao:
            typeof item.topico_descricao === 'string' &&
            item.topico_descricao.trim()
              ? item.topico_descricao.trim()
              : undefined,
          ordem:
            typeof item.ordem_topico === 'number' && Number.isFinite(item.ordem_topico)
              ? item.ordem_topico
              : undefined,
          barreira_tipo: this.normalizeChecklistBarrierType(item.barreira_tipo),
          peso_barreira: this.normalizeChecklistPositiveNumber(item.peso_barreira),
          limite_ruptura: this.normalizeChecklistPositiveNumber(item.limite_ruptura),
          itens: [nextItem],
          __firstSeen: index,
        });
        return;
      }

      if (existing.titulo === 'Itens do checklist' && title !== existing.titulo) {
        existing.titulo = title;
      }
      if (
        !existing.descricao &&
        typeof item.topico_descricao === 'string' &&
        item.topico_descricao.trim()
      ) {
        existing.descricao = item.topico_descricao.trim();
      }
      if (!existing.barreira_tipo) {
        existing.barreira_tipo = this.normalizeChecklistBarrierType(
          item.barreira_tipo,
        );
      }
      if (typeof existing.peso_barreira !== 'number') {
        existing.peso_barreira = this.normalizeChecklistPositiveNumber(
          item.peso_barreira,
        );
      }
      if (typeof existing.limite_ruptura !== 'number') {
        existing.limite_ruptura = this.normalizeChecklistPositiveNumber(
          item.limite_ruptura,
        );
      }
      existing.itens.push(nextItem);
      if (
        typeof existing.ordem !== 'number' &&
        typeof item.ordem_topico === 'number' &&
        Number.isFinite(item.ordem_topico)
      ) {
        existing.ordem = item.ordem_topico;
      }
    });

    return Array.from(topics.values())
      .sort((a, b) => {
        const aOrder = typeof a.ordem === 'number' ? a.ordem : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.ordem === 'number' ? b.ordem : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.__firstSeen - b.__firstSeen;
      })
      .map(({ __firstSeen, ...topic }) => ({
        ...(() => {
          const sortedItems = topic.itens.sort((a, b) => {
          const aOrder =
            typeof a.ordem_item === 'number'
              ? a.ordem_item
              : Number.MAX_SAFE_INTEGER;
          const bOrder =
            typeof b.ordem_item === 'number'
              ? b.ordem_item
              : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
          });
          const classifiedItems = sortedItems.map((item) =>
            this.classifyChecklistItemAssessment(item as Record<string, unknown>),
          );
          const controlesRompidos = classifiedItems.filter(
            (status) => status === 'rompido',
          ).length;
          const controlesDegradados = classifiedItems.filter(
            (status) => status === 'degradado',
          ).length;
          const controlesPendentes = classifiedItems.filter(
            (status) => status === 'pendente',
          ).length;
          const limiteRuptura =
            typeof topic.limite_ruptura === 'number' && topic.limite_ruptura > 0
              ? topic.limite_ruptura
              : 1;
          const statusBarreira =
            controlesRompidos >= limiteRuptura
              ? 'rompida'
              : controlesDegradados > 0 || controlesPendentes > 0
                ? 'degradada'
                : 'integra';
          const bloqueiaOperacao =
            statusBarreira === 'rompida' ||
            sortedItems.some((item) => {
              if (!item.bloqueia_operacao_quando_nc) {
                return false;
              }
              return (
                this.classifyChecklistItemAssessment(
                  item as Record<string, unknown>,
                ) === 'rompido'
              );
            });

          return {
            ...topic,
            status_barreira: statusBarreira,
            controles_rompidos: controlesRompidos,
            controles_degradados: controlesDegradados,
            controles_pendentes: controlesPendentes,
            bloqueia_operacao: bloqueiaOperacao,
            itens: sortedItems,
          };
        })(),
      }));
  }

  private toChecklistResponse(checklist: Checklist): ChecklistResponseDto {
    const topicos = this.buildChecklistTopicsFromItems(
      Array.isArray(checklist.itens) ? checklist.itens : [],
    );
    return plainToClass(ChecklistResponseDto, {
      ...checklist,
      topicos,
    });
  }

  private async cleanupGovernedChecklistPhotoFiles(
    checklistId: string,
    removedEntries: Array<{
      payload: GovernedChecklistPhotoReferencePayload;
    }>,
  ): Promise<void> {
    await Promise.all(
      removedEntries.map(async ({ payload }) => {
        try {
          await this.documentStorageService.deleteFile(payload.fileKey);
          this.logChecklistEvent('checklist_photo_removed_from_storage', null, {
            checklistId,
            fileKey: payload.fileKey,
            originalName: payload.originalName,
          });
        } catch (error) {
          this.logChecklistEvent(
            'checklist_photo_storage_cleanup_failed',
            null,
            {
              checklistId,
              fileKey: payload.fileKey,
              originalName: payload.originalName,
              errorMessage: error instanceof Error ? error.message : 'unknown',
            },
          );
        }
      }),
    );
  }

  private buildChecklistMaterialSnapshot(
    checklist: Pick<
      Checklist,
      | 'titulo'
      | 'descricao'
      | 'equipamento'
      | 'maquina'
      | 'foto_equipamento'
      | 'data'
      | 'site_id'
      | 'inspetor_id'
      | 'itens'
      | 'categoria'
      | 'periodicidade'
      | 'nivel_risco_padrao'
      | 'auditado_por_id'
      | 'data_auditoria'
      | 'resultado_auditoria'
      | 'notas_auditoria'
    >,
  ): string {
    return JSON.stringify({
      titulo: checklist.titulo ?? '',
      descricao: checklist.descricao ?? '',
      equipamento: checklist.equipamento ?? '',
      maquina: checklist.maquina ?? '',
      foto_equipamento: checklist.foto_equipamento ?? '',
      data:
        checklist.data instanceof Date
          ? checklist.data.toISOString()
          : checklist.data
            ? new Date(checklist.data).toISOString()
            : '',
      site_id: checklist.site_id ?? '',
      inspetor_id: checklist.inspetor_id ?? '',
      itens: this.cloneChecklistItems(checklist.itens),
      categoria: checklist.categoria ?? '',
      periodicidade: checklist.periodicidade ?? '',
      nivel_risco_padrao: checklist.nivel_risco_padrao ?? '',
      auditado_por_id: checklist.auditado_por_id ?? '',
      data_auditoria:
        checklist.data_auditoria instanceof Date
          ? checklist.data_auditoria.toISOString()
          : checklist.data_auditoria
            ? new Date(checklist.data_auditoria).toISOString()
            : '',
      resultado_auditoria: checklist.resultado_auditoria ?? '',
      notas_auditoria: checklist.notas_auditoria ?? '',
    });
  }

  private async resetChecklistSignatures(
    checklist: Pick<Checklist, 'id' | 'company_id' | 'is_modelo'>,
    reason: string,
  ): Promise<boolean> {
    if (checklist.is_modelo) {
      return false;
    }

    const removedCount = await this.signaturesService.removeByDocumentSystem(
      checklist.id,
      'CHECKLIST',
    );

    if (removedCount > 0) {
      this.logChecklistEvent('checklist_signatures_reset', checklist, {
        reason,
        removedCount,
      });
      return true;
    }

    return false;
  }

  private async buildChecklistPhotoAccessResponse(
    checklistId: string,
    input: {
      scope: 'equipment' | 'item';
      itemIndex: number | null;
      photoIndex: number | null;
      payload: GovernedChecklistPhotoReferencePayload;
    },
  ): Promise<ChecklistPhotoAccessResponse> {
    let url: string | null = null;
    let availability: ChecklistPhotoAccessAvailability = 'ready';
    let message: string | null = null;

    try {
      url = await this.documentStorageService.getPresignedDownloadUrl(
        input.payload.fileKey,
      );
    } catch (error) {
      availability = 'registered_without_signed_url';
      message =
        'A foto governada foi localizada, mas a URL assinada não está disponível no momento.';
      this.logChecklistEvent('checklist_photo_access_degraded', null, {
        checklistId,
        scope: input.scope,
        itemIndex: input.itemIndex,
        photoIndex: input.photoIndex,
        fileKey: input.payload.fileKey,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      });
    }

    this.logChecklistEvent('checklist_photo_access_checked', null, {
      checklistId,
      scope: input.scope,
      itemIndex: input.itemIndex,
      photoIndex: input.photoIndex,
      availability,
      fileKey: input.payload.fileKey,
    });

    return {
      entityId: checklistId,
      scope: input.scope,
      itemIndex: input.itemIndex,
      photoIndex: input.photoIndex,
      hasGovernedPhoto: true,
      availability,
      fileKey: input.payload.fileKey,
      originalName: input.payload.originalName,
      mimeType: input.payload.mimeType,
      url,
      degraded: availability !== 'ready',
      message,
    };
  }

  private sanitizeChecklistItems(
    items: UpdateChecklistDto['itens'],
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ) {
    return this.normalizeChecklistItems(items, options);
  }

  private deriveChecklistStatus(
    input: Pick<Checklist, 'is_modelo'> & {
      status?: string | null;
      itens?: unknown;
    },
  ): Checklist['status'] {
    if (input.is_modelo) {
      if (
        input.status === 'Conforme' ||
        input.status === 'Não Conforme' ||
        input.status === 'Pendente'
      ) {
        return input.status;
      }
      return 'Pendente';
    }

    const items = Array.isArray(input.itens) ? input.itens : [];
    if (!items.length) {
      return 'Pendente';
    }

    let hasPending = false;
    let hasNonConformity = false;

    for (const rawItem of items) {
      const item =
        rawItem && typeof rawItem === 'object'
          ? (rawItem as Record<string, unknown>)
          : {};
      const assessmentStatuses = this.getChecklistAssessmentStatuses(item);

      for (const status of assessmentStatuses) {
        if (
          status === 'nok' ||
          status === 'nao' ||
          status === false ||
          status === 'Não Conforme'
        ) {
          hasNonConformity = true;
          break;
        }

        if (
          status === undefined ||
          status === null ||
          status === '' ||
          status === 'Pendente'
        ) {
          hasPending = true;
        }
      }

      if (hasNonConformity) {
        break;
      }
    }

    if (hasNonConformity) {
      return 'Não Conforme';
    }

    if (hasPending) {
      return 'Pendente';
    }

    return 'Conforme';
  }

  private getChecklistAssessmentStatuses(
    item: Record<string, unknown>,
  ): unknown[] {
    const subitems = Array.isArray(item.subitens) ? item.subitens : [];
    const subitemStatuses = subitems
      .map((subitem) =>
        subitem && typeof subitem === 'object'
          ? (subitem as Record<string, unknown>).status
          : undefined,
      )
      .filter((status) => status !== undefined);

    if (subitemStatuses.length > 0) {
      return subitemStatuses;
    }

    return [item.status];
  }

  private async validateChecklistRelations(checklist: {
    company_id?: string | null;
    site_id?: string | null;
    inspetor_id?: string | null;
    auditado_por_id?: string | null;
  }) {
    if (!checklist.company_id) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa do checklist.',
      );
    }

    if (checklist.site_id) {
      await this.sitesService.findOne(checklist.site_id);
    }

    if (checklist.inspetor_id) {
      await this.usersService.findOne(checklist.inspetor_id);
    }

    if (checklist.auditado_por_id) {
      await this.usersService.findOne(checklist.auditado_por_id);
    }
  }

  private cloneChecklistItems(
    items: Checklist['itens'] | undefined,
    options?: { resetExecutionState?: boolean },
  ) {
    return this.normalizeChecklistItems(items, options);
  }

  private buildChecklistFromTemplate(
    template: Checklist,
    fillData: UpdateChecklistDto,
  ): Checklist {
    const checklistData: DeepPartial<Checklist> = {
      titulo: fillData.titulo ?? template.titulo,
      descricao: fillData.descricao ?? template.descricao,
      equipamento: fillData.equipamento ?? template.equipamento,
      maquina: fillData.maquina ?? template.maquina,
      foto_equipamento:
        fillData.foto_equipamento ?? template.foto_equipamento ?? undefined,
      data: fillData.data ?? template.data,
      status: fillData.status ?? 'Pendente',
      company_id: template.company_id,
      site_id: fillData.site_id ?? undefined,
      inspetor_id: fillData.inspetor_id ?? undefined,
      itens:
        (Array.isArray(fillData.topicos) && fillData.topicos.length > 0) ||
        fillData.itens !== undefined
          ? this.resolveChecklistItemsForPersistence(
              {
                itens: fillData.itens,
                topicos: fillData.topicos,
              },
              {
                resetExecutionState: true,
              },
            )
          : this.normalizeChecklistItems(
              Array.isArray(template.itens) ? template.itens : undefined,
              {
                resetExecutionState: true,
              },
            ),
      is_modelo: false,
      template_id: template.id,
      ativo: fillData.ativo ?? true,
      categoria: fillData.categoria ?? template.categoria,
      periodicidade: fillData.periodicidade ?? template.periodicidade,
      nivel_risco_padrao:
        fillData.nivel_risco_padrao ?? template.nivel_risco_padrao,
      auditado_por_id: fillData.auditado_por_id ?? undefined,
      data_auditoria: fillData.data_auditoria ?? undefined,
      resultado_auditoria: template.resultado_auditoria ?? undefined,
      notas_auditoria: template.notas_auditoria ?? undefined,
    };

    return this.checklistsRepository.create(checklistData);
  }

  private getChecklistDocumentDate(
    checklist: Pick<Checklist, 'data' | 'created_at'>,
  ): Date {
    const candidate = checklist.data
      ? new Date(checklist.data)
      : checklist.created_at
        ? new Date(checklist.created_at)
        : new Date();

    return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  }

  private buildChecklistDocumentCode(
    checklist: Pick<Checklist, 'id' | 'data' | 'created_at'>,
  ) {
    const year = this.getChecklistDocumentDate(checklist).getFullYear();
    const reference = String(checklist.id || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();
    return `CHK-${year}-${reference}`;
  }

  private resolvePdfImage(imageData: string): {
    data: string;
    format: 'PNG' | 'JPEG';
  } {
    const normalized = imageData.trim();
    const dataUriMatch = normalized.match(
      /^data:image\/(png|jpeg|jpg);base64,(.+)$/i,
    );

    if (dataUriMatch) {
      const format = dataUriMatch[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
      return { data: dataUriMatch[2], format };
    }

    return {
      data: normalized.split(',')[1] || normalized,
      format: 'PNG',
    };
  }

  private async resolveChecklistPdfImage(imageData: string): Promise<{
    data: string;
    format: 'PNG' | 'JPEG';
  }> {
    const governedPhoto = this.parseGovernedChecklistPhotoReference(imageData);
    if (!governedPhoto) {
      return this.resolvePdfImage(imageData);
    }

    const buffer = await this.documentStorageService.downloadFileBuffer(
      governedPhoto.fileKey,
    );
    const base64 = buffer.toString('base64');
    const isPng =
      governedPhoto.mimeType === 'image/png' ||
      governedPhoto.originalName.toLowerCase().endsWith('.png');

    return {
      data: base64,
      format: isPng ? 'PNG' : 'JPEG',
    };
  }

  async create(
    createChecklistDto: CreateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.log(`Criando checklist para empresa: ${tenantId}`);

    const checklist = this.checklistsRepository.create({
      ...createChecklistDto,
      company_id: tenantId || createChecklistDto.company_id,
      foto_equipamento: this.normalizeChecklistPhotoReference(
        createChecklistDto.foto_equipamento,
        'Foto do equipamento',
      ),
      itens: this.resolveChecklistItemsForPersistence({
        itens: createChecklistDto.itens,
        topicos: createChecklistDto.topicos,
      }),
    });
    checklist.status = this.deriveChecklistStatus(checklist);
    this.assertChecklistExecutionRequirements(checklist);
    await this.validateChecklistRelations(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);
    this.logChecklistEvent('checklist_created', saved, {
      isTemplate: saved.is_modelo,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
    });
    return this.toChecklistResponse(saved);
  }

  async findAll(options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    take?: number;
    select?: (keyof Checklist)[];
  }): Promise<ChecklistResponseDto[]> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.debug(`Buscando checklists para empresa: ${tenantId}`);

    const filter: { company_id?: string; is_modelo?: boolean } = {};
    if (tenantId) {
      filter.company_id = tenantId;
    }
    if (options?.onlyTemplates) {
      filter.is_modelo = true;
    } else if (options?.excludeTemplates) {
      filter.is_modelo = false;
    }

    const results = await this.checklistsRepository.find({
      where: { ...filter, deleted_at: IsNull() },
      ...(options?.select?.length
        ? { select: options.select }
        : { relations: ['company', 'site', 'inspetor', 'auditado_por'] }),
      order: { created_at: 'DESC' },
      ...(options?.take !== undefined && { take: options.take }),
    });
    return results.map((c) => this.toChecklistResponse(c));
  }

  async findPaginated(options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<ChecklistResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.debug(
      `Buscando checklists paginados para empresa: ${tenantId}`,
    );

    const filter: { company_id?: string; is_modelo?: boolean } = {};
    if (tenantId) {
      filter.company_id = tenantId;
    }
    if (options?.onlyTemplates) {
      filter.is_modelo = true;
    } else if (options?.excludeTemplates) {
      filter.is_modelo = false;
    }

    const { page, limit, skip } = normalizeOffsetPagination(
      { page: options?.page, limit: options?.limit },
      { defaultLimit: 20, maxLimit: 100 },
    );

    const [rows, total] = await this.checklistsRepository.findAndCount({
      where: { ...filter, deleted_at: IsNull() },
      // LISTING: evitar relations pesadas no endpoint de listagem.
      select: this.checklistListSelect,
      relations: ['company', 'site', 'inspetor'],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const data = rows.map((c) => this.toChecklistResponse(c));
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<ChecklistResponseDto> {
    const checklist = await this.findOneEntity(id);
    return this.toChecklistResponse(checklist);
  }

  async findOneEntity(id: string): Promise<Checklist> {
    const tenantId = this.tenantService.getTenantId();
    const checklist = await this.checklistsRepository.findOne({
      where: tenantId
        ? { id, company_id: tenantId, deleted_at: IsNull() }
        : { id, deleted_at: IsNull() },
      relations: ['company', 'site', 'inspetor', 'auditado_por'],
    });
    if (!checklist) {
      throw new NotFoundException(`Checklist com ID ${id} não encontrado`);
    }
    return checklist;
  }

  async update(
    id: string,
    updateChecklistDto: UpdateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const checklist = await this.findOneEntity(id);
    this.assertChecklistDocumentMutable(checklist);
    const allowedGovernedPhotoReferences =
      this.getAllowedGovernedChecklistPhotoReferences(checklist);
    const previousPhotoEntries =
      this.getGovernedChecklistPhotoEntries(checklist);
    const previousMaterialSnapshot =
      this.buildChecklistMaterialSnapshot(checklist);

    if (updateChecklistDto.titulo !== undefined) {
      checklist.titulo = updateChecklistDto.titulo;
    }
    if (updateChecklistDto.descricao !== undefined) {
      checklist.descricao = updateChecklistDto.descricao;
    }
    if (updateChecklistDto.equipamento !== undefined) {
      checklist.equipamento = updateChecklistDto.equipamento;
    }
    if (updateChecklistDto.maquina !== undefined) {
      checklist.maquina = updateChecklistDto.maquina;
    }
    if (updateChecklistDto.foto_equipamento !== undefined) {
      checklist.foto_equipamento =
        this.normalizeChecklistPhotoReference(
          updateChecklistDto.foto_equipamento,
          'Foto do equipamento',
          {
            allowedGovernedReferences: allowedGovernedPhotoReferences,
          },
        ) ?? '';
    }
    if (updateChecklistDto.data !== undefined) {
      checklist.data = new Date(updateChecklistDto.data);
    }
    if (updateChecklistDto.site_id !== undefined) {
      checklist.site_id = updateChecklistDto.site_id;
    }
    if (updateChecklistDto.inspetor_id !== undefined) {
      checklist.inspetor_id = updateChecklistDto.inspetor_id;
    }
    if (
      updateChecklistDto.itens !== undefined ||
      updateChecklistDto.topicos !== undefined
    ) {
      checklist.itens = this.resolveChecklistItemsForPersistence(
        {
          itens: updateChecklistDto.itens,
          topicos: updateChecklistDto.topicos,
        },
        {
          allowedGovernedReferences: allowedGovernedPhotoReferences,
        },
      );
    }
    if (updateChecklistDto.is_modelo !== undefined) {
      checklist.is_modelo = updateChecklistDto.is_modelo;
    }
    if (updateChecklistDto.ativo !== undefined) {
      checklist.ativo = updateChecklistDto.ativo;
    }
    if (updateChecklistDto.categoria !== undefined) {
      checklist.categoria = updateChecklistDto.categoria;
    }
    if (updateChecklistDto.periodicidade !== undefined) {
      checklist.periodicidade = updateChecklistDto.periodicidade;
    }
    if (updateChecklistDto.nivel_risco_padrao !== undefined) {
      checklist.nivel_risco_padrao = updateChecklistDto.nivel_risco_padrao;
    }
    if (updateChecklistDto.auditado_por_id !== undefined) {
      checklist.auditado_por_id = updateChecklistDto.auditado_por_id;
    }
    if (updateChecklistDto.data_auditoria) {
      checklist.data_auditoria = new Date(updateChecklistDto.data_auditoria);
    }

    checklist.status = this.deriveChecklistStatus({
      ...checklist,
      status: updateChecklistDto.status ?? checklist.status,
    });
    this.assertChecklistExecutionRequirements(checklist);
    await this.validateChecklistRelations(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);
    const nextPhotoEntries = this.getGovernedChecklistPhotoEntries(saved);
    const nextPhotoReferences = new Set(
      nextPhotoEntries.map((entry) => entry.reference),
    );
    const removedPhotoEntries = previousPhotoEntries.filter(
      (entry) => !nextPhotoReferences.has(entry.reference),
    );
    if (removedPhotoEntries.length > 0) {
      await this.cleanupGovernedChecklistPhotoFiles(
        saved.id,
        removedPhotoEntries,
      );
    }
    const materialChanged =
      previousMaterialSnapshot !== this.buildChecklistMaterialSnapshot(saved);
    const signaturesReset = materialChanged
      ? await this.resetChecklistSignatures(saved, 'material_update')
      : false;

    try {
      this.notificationsGateway.sendToCompany(
        checklist.company_id,
        'checklist:updated',
        { id: checklist.id },
      );
    } catch (e) {
      this.logger.error(
        'Falha ao enviar notificação de checklist atualizado',
        e,
      );
    }

    this.logChecklistEvent('checklist_updated', saved, {
      isTemplate: saved.is_modelo,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
      signaturesReset,
      removedGovernedPhotos: removedPhotoEntries.length,
    });

    return this.toChecklistResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const checklist = await this.findOneEntity(id);
    const governedPhotoEntries =
      this.getGovernedChecklistPhotoEntries(checklist);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: checklist.company_id,
      module: 'checklist',
      entityId: checklist.id,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Checklist).softDelete(checklist.id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    if (governedPhotoEntries.length > 0) {
      await this.cleanupGovernedChecklistPhotoFiles(
        checklist.id,
        governedPhotoEntries,
      );
    }
    await this.resetChecklistSignatures(checklist, 'checklist_removed');
  }

  async attachEquipmentPhoto(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ChecklistPhotoAttachResponse> {
    const checklist = await this.findOneEntity(id);
    this.assertChecklistDocumentMutable(checklist);

    const currentEquipmentPhoto =
      typeof checklist.foto_equipamento === 'string'
        ? checklist.foto_equipamento
        : null;
    const previousGovernedPhoto = currentEquipmentPhoto
      ? this.parseGovernedChecklistPhotoReference(currentEquipmentPhoto)
      : null;
    const sanitizedOriginalName = originalName?.trim() || 'foto-equipamento';
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      'checklist-photos',
      checklist.id,
      sanitizedOriginalName,
    );

    await this.documentStorageService.uploadFile(fileKey, buffer, mimeType);

    try {
      const photoReference = this.buildGovernedChecklistPhotoReference({
        v: 1,
        kind: 'governed-storage',
        scope: 'equipment',
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        uploadedAt: new Date().toISOString(),
        sizeBytes: buffer.byteLength,
      });

      checklist.foto_equipamento = photoReference;
      const saved = await this.checklistsRepository.save(checklist);
      const signaturesReset = await this.resetChecklistSignatures(
        saved,
        'equipment_photo_updated',
      );

      if (
        previousGovernedPhoto &&
        previousGovernedPhoto.fileKey !== fileKey &&
        currentEquipmentPhoto
      ) {
        await this.cleanupGovernedChecklistPhotoFiles(saved.id, [
          {
            payload: previousGovernedPhoto,
          },
        ]);
      }

      this.logChecklistEvent('checklist_equipment_photo_uploaded', saved, {
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        signaturesReset,
      });

      return {
        entityId: saved.id,
        scope: 'equipment',
        itemIndex: null,
        photoIndex: null,
        storageMode: 'governed-storage',
        degraded: false,
        message: 'Foto do equipamento anexada ao checklist com governança.',
        photoReference,
        photo: {
          fileKey,
          originalName: sanitizedOriginalName,
          mimeType,
        },
        signaturesReset,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        'checklists.attachEquipmentPhoto',
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async attachItemPhoto(
    id: string,
    itemIndex: number,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ChecklistPhotoAttachResponse> {
    const checklist = await this.findOneEntity(id);
    this.assertChecklistDocumentMutable(checklist);

    if (!Array.isArray(checklist.itens) || !checklist.itens[itemIndex]) {
      throw new BadRequestException('Item do checklist não encontrado.');
    }

    const sanitizedOriginalName = originalName?.trim() || 'foto-item';
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      'checklist-photos',
      checklist.id,
      sanitizedOriginalName,
    );

    await this.documentStorageService.uploadFile(fileKey, buffer, mimeType);

    try {
      const items = this.cloneChecklistItems(checklist.itens);
      const targetItem = items[itemIndex];
      const nextPhotos = Array.isArray(targetItem.fotos)
        ? [...targetItem.fotos]
        : [];
      const photoReference = this.buildGovernedChecklistPhotoReference({
        v: 1,
        kind: 'governed-storage',
        scope: 'item',
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        uploadedAt: new Date().toISOString(),
        sizeBytes: buffer.byteLength,
      });

      nextPhotos.push(photoReference);
      targetItem.fotos = nextPhotos;
      checklist.itens = items;
      const saved = await this.checklistsRepository.save(checklist);
      const signaturesReset = await this.resetChecklistSignatures(
        saved,
        'item_photo_added',
      );
      const photoIndex = nextPhotos.length - 1;

      this.logChecklistEvent('checklist_item_photo_uploaded', saved, {
        itemIndex,
        photoIndex,
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        signaturesReset,
      });

      return {
        entityId: saved.id,
        scope: 'item',
        itemIndex,
        photoIndex,
        storageMode: 'governed-storage',
        degraded: false,
        message: 'Foto do item anexada ao checklist com governança.',
        photoReference,
        photo: {
          fileKey,
          originalName: sanitizedOriginalName,
          mimeType,
        },
        signaturesReset,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        'checklists.attachItemPhoto',
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async getEquipmentPhotoAccess(
    id: string,
  ): Promise<ChecklistPhotoAccessResponse> {
    const checklist = await this.findOneEntity(id);
    const governedPhoto = this.parseGovernedChecklistPhotoReference(
      checklist.foto_equipamento,
    );

    if (!governedPhoto) {
      throw new NotFoundException(
        'O checklist não possui foto do equipamento em armazenamento governado.',
      );
    }

    return this.buildChecklistPhotoAccessResponse(checklist.id, {
      scope: 'equipment',
      itemIndex: null,
      photoIndex: null,
      payload: governedPhoto,
    });
  }

  async getItemPhotoAccess(
    id: string,
    itemIndex: number,
    photoIndex: number,
  ): Promise<ChecklistPhotoAccessResponse> {
    const checklist = await this.findOneEntity(id);
    const item = Array.isArray(checklist.itens)
      ? checklist.itens[itemIndex]
      : null;
    const photo =
      item && Array.isArray(item.fotos) ? item.fotos[photoIndex] : undefined;
    const governedPhoto = this.parseGovernedChecklistPhotoReference(photo);

    if (!governedPhoto) {
      throw new NotFoundException(
        'A foto do item não está em armazenamento governado.',
      );
    }

    return this.buildChecklistPhotoAccessResponse(checklist.id, {
      scope: 'item',
      itemIndex,
      photoIndex,
      payload: governedPhoto,
    });
  }

  async sendEmail(id: string, to: string) {
    const checklist = await this.findOneEntity(id);
    const access = await this.getPdfAccess(id);
    if (!access.hasFinalPdf || !access.fileKey) {
      this.logChecklistEvent(
        'checklist_email_blocked_without_final_pdf',
        checklist,
        {
          recipient: to,
        },
      );
      throw new BadRequestException(
        'Emita o PDF final governado antes de enviar este checklist por e-mail.',
      );
    }

    try {
      const result = await this.mailService.sendStoredDocument(
        checklist.id,
        'CHECKLIST',
        to,
        checklist.company_id,
      );
      this.logChecklistEvent('checklist_email_sent', checklist, {
        reusedFinalPdf: true,
        recipient: to,
        artifactType: result.artifactType,
        fallbackUsed: result.fallbackUsed,
      });
      return result;
    } catch (error) {
      this.logChecklistEvent(
        'checklist_email_failed_official_pdf_unavailable',
        checklist,
        {
          recipient: to,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
      );
      throw error;
    }
  }

  async generatePdf(checklist: Checklist): Promise<Buffer> {
    // ALERTA DE PERFORMANCE: A geração de PDFs é uma tarefa síncrona e intensiva em CPU.
    // Em um ambiente com alta concorrência, isso pode bloquear o event loop do Node.js
    // e degradar a performance da aplicação.
    // RECOMENDAÇÃO: Mover esta lógica para um job em background (ex: usando BullMQ)
    // para não impactar a responsividade da API.
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const tableTheme = createBackendPdfTableTheme();
    drawBackendPdfHeader(doc, {
      title: 'CHECKLIST SST',
      subtitle: checklist.titulo,
      metaRight: [
        `Data: ${new Date(checklist.data).toLocaleDateString('pt-BR')}`,
        `Status: ${checklist.status || 'Pendente'}`,
      ],
    });

    doc.setFontSize(10);
    doc.setTextColor(...backendPdfTheme.text);
    doc.text(
      `Data: ${new Date(checklist.data).toLocaleDateString('pt-BR')}`,
      16,
      41,
    );
    doc.text(`Inspetor: ${checklist.inspetor?.nome || 'N/A'}`, 16, 47);
    doc.text(`Obra/Setor: ${checklist.site?.nome || 'N/A'}`, 16, 53);
    if (checklist.equipamento)
      doc.text(`Equipamento: ${checklist.equipamento}`, 16, 59);
    if (checklist.maquina) doc.text(`Máquina: ${checklist.maquina}`, 16, 65);

    let currentY = 74;
    if (checklist.foto_equipamento) {
      try {
        const { data: imgData, format } = await this.resolveChecklistPdfImage(
          checklist.foto_equipamento,
        );
        drawBackendSectionTitle(doc, currentY - 10, 'Evidência do equipamento');
        doc.setFillColor(...backendPdfTheme.surface);
        doc.setDrawColor(...backendPdfTheme.border);
        doc.roundedRect(16, currentY - 4, 64, 64, 2, 2, 'FD');
        doc.addImage(imgData, format, 18, currentY - 2, 60, 60);
        currentY += 70;
      } catch (e) {
        this.logger.error('Erro ao adicionar imagem do equipamento:', e);
      }
    }

    const topicsForPdf = this.buildChecklistTopicsFromItems(
      Array.isArray(checklist.itens) ? checklist.itens : [],
    );

    const normalizePdfStatus = (status: unknown): string => {
      if (status === true || status === 'ok' || status === 'sim') {
        return 'Conforme';
      }
      if (status === false || status === 'nok' || status === 'nao') {
        return 'Não Conforme';
      }
      if (status === 'na') {
        return 'N/A';
      }
      return typeof status === 'string' && status.trim()
        ? status
        : 'N/A';
    };

    const renderTopicTable = (topic: ChecklistTopicValue) => {
      const rows = (topic.itens || []).map((item, index) => {
        const itemNumber =
          typeof item.ordem_item === 'number' && Number.isFinite(item.ordem_item)
            ? item.ordem_item
            : index + 1;
        const subitemsText = Array.isArray(item.subitens) && item.subitens.length
          ? item.subitens
              .map((subitem, subIndex) => {
                const label =
                  typeof subitem.ordem === 'number' && Number.isFinite(subitem.ordem)
                    ? this.buildChecklistAlphabeticLabel(subitem.ordem - 1)
                    : this.buildChecklistAlphabeticLabel(subIndex);
                const subitemStatus = normalizePdfStatus(subitem.status);
                const suffix =
                  subitem.status === undefined || subitem.status === null
                    ? ''
                    : ` — ${subitemStatus}`;
                return `${label}) ${subitem.texto}${suffix}`;
              })
              .join('\n')
          : '';
        const itemText = `${itemNumber}. ${item.item}`;
        return [
          subitemsText ? `${itemText}\n${subitemsText}` : itemText,
          normalizePdfStatus(item.status),
          item.observacao || '',
        ];
      });

      return rows;
    };

    const renderTopicSection = (topic: ChecklistTopicValue) => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      const barrierLabel =
        topic.status_barreira === 'rompida'
          ? 'Barreira rompida'
          : topic.status_barreira === 'degradada'
            ? 'Barreira degradada'
            : topic.status_barreira === 'integra'
              ? 'Barreira íntegra'
              : null;
      drawBackendSectionTitle(
        doc,
        currentY - 6,
        barrierLabel ? `${topic.titulo} - ${barrierLabel}` : topic.titulo,
      );
      currentY += 2;

      if (topic.descricao) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(90, 99, 118);
        const wrappedDescription = doc.splitTextToSize(topic.descricao, 180);
        doc.text(wrappedDescription, 14, currentY);
        currentY += wrappedDescription.length * 4 + 2;
      }

      autoTable(doc, {
        startY: currentY,
        head: [['Item', 'Status', 'Observação']],
        body: renderTopicTable(topic),
        ...tableTheme,
        styles: {
          ...tableTheme.styles,
          fontSize: 8.5,
          cellPadding: 2.2,
          valign: 'top',
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body' && hookData.column.index === 0) {
            hookData.cell.styles.fontStyle = 'normal';
          }
        },
      });

      currentY = getBackendLastTableY(doc, currentY) + 6;
    };

    if (topicsForPdf.length) {
      topicsForPdf.forEach((topic) => renderTopicSection(topic));
    } else {
      autoTable(doc, {
        startY: currentY,
        head: [['Item', 'Status', 'Observação']],
        body: [],
        ...tableTheme,
      });
    }

    const signatures = await this.signaturesService.findByDocument(
      checklist.id,
      'CHECKLIST',
    );
    if (signatures.length > 0) {
      const finalY = getBackendLastTableY(doc, 150);
      let currentSigY = finalY + 20;

      if (currentSigY > 250) {
        doc.addPage();
        currentSigY = 20;
      }
      drawBackendSectionTitle(doc, currentSigY - 4, 'Assinaturas');
      doc.setFontSize(12);
      doc.setTextColor(...backendPdfTheme.text);
      doc.text('Assinaturas', 16, currentSigY + 2);
      currentSigY += 10;

      for (const sig of signatures) {
        if (currentSigY + 40 > 280) {
          doc.addPage();
          currentSigY = 20;
        }
        doc.setFontSize(10);
        doc.text(
          `Assinado por: ${sig.user?.nome || 'Usuário'} em ${new Date(sig.created_at).toLocaleString('pt-BR')}`,
          16,
          currentSigY,
        );
        currentSigY += 5;
        if (sig.signature_data) {
          try {
            const { data: imgData, format } = this.resolvePdfImage(
              sig.signature_data,
            );
            doc.addImage(imgData, format, 16, currentSigY, 50, 20);
            currentSigY += 25;
          } catch (e) {
            this.logger.error('Erro ao adicionar imagem de assinatura:', e);
            currentSigY += 10;
          }
        } else {
          currentSigY += 10;
        }
      }
    }

    applyBackendPdfFooter(doc);

    return Buffer.from(doc.output('arraybuffer'));
  }

  async createWeldingMachineTemplate() {
    const title = 'Checklist de Máquina de Solda';
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa para criar o template.',
      );
    }

    const existing = await this.checklistsRepository.findOne({
      where: { titulo: title, is_modelo: true, company_id: companyId },
    });
    if (existing) {
      this.logger.warn(
        `Template "${title}" já existe para a empresa ${companyId}.`,
      );
      return existing;
    }

    const items: ChecklistItemValue[] = [
      {
        item: '1. CONDIÇÕES GERAIS: Carcaça da máquina íntegra',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '1. CONDIÇÕES GERAIS: Cabos de alimentação sem cortes ou emendas',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '2. SEGURANÇA ELÉTRICA: Aterramento adequado',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '3. SEGURANÇA OPERACIONAL: Porta-eletrodo em bom estado',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '3. SEGURANÇA OPERACIONAL: Área livre de materiais inflamáveis',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '4. EPI DO OPERADOR: Máscara de solda adequada',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '4. EPI DO OPERADOR: Luvas de raspa',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '5. ORGANIZAÇÃO E AMBIENTE: Cabos organizados (sem risco de tropeço)',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
    ];

    // CORREÇÃO: Removida a lógica de fallback com queries SQL. A criação de templates agora depende do contexto do tenant.
    // Para templates globais, uma estratégia diferente (ex: company_id nulo) deveria ser implementada.
    const checklist = this.checklistsRepository.create({
      titulo: title,
      descricao: 'Inspeção de segurança e operacional para máquina de solda.',
      equipamento: 'Máquina de Solda',
      data: new Date(),
      status: 'Pendente',
      company_id: companyId,
      itens: items,
      is_modelo: true,
      categoria: 'Equipamento',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Alto',
      ativo: true,
    });

    return this.checklistsRepository.save(checklist);
  }

  async createPresetTemplates() {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa para criar os templates.',
      );
    }

    const presetTemplates = [
      ...this.checklistTemplatesByActivity,
      this.buildNr24PresetTemplateDefinition(),
      this.buildNr10PresetTemplateDefinition(),
      this.buildNr12PresetTemplateDefinition(),
      this.buildLotoPresetTemplateDefinition(),
      this.buildNr35PresetTemplateDefinition(),
      this.buildNr33PresetTemplateDefinition(),
      this.buildWeldingMachinePresetTemplateDefinition(),
      this.buildGrinderPresetTemplateDefinition(),
      this.buildPemtPresetTemplateDefinition(),
      this.buildPortableDrillPresetTemplateDefinition(),
      this.buildSafetyLanyardPresetTemplateDefinition(),
      this.buildExtensionLadderPresetTemplateDefinition(),
      this.buildStepLadderPresetTemplateDefinition(),
    ];

    const existingTemplates = await this.checklistsRepository.find({
      where: { company_id: companyId, is_modelo: true },
      select: ['titulo'],
    });
    const existingTitles = new Set(
      existingTemplates.map((item) => item.titulo),
    );

    const templatesToCreate = presetTemplates
      .filter((template) => !existingTitles.has(template.titulo))
      .map((template) =>
        this.checklistsRepository.create({
          ...template,
          data: new Date(),
          status: 'Pendente',
          company_id: companyId,
          is_modelo: true,
          ativo: true,
        }),
      );

    if (templatesToCreate.length === 0) {
      return {
        created: 0,
        skipped: presetTemplates.length,
        templates: existingTemplates,
      };
    }

    const saved = await this.checklistsRepository.save(templatesToCreate);
    return {
      created: saved.length,
      skipped: presetTemplates.length - saved.length,
      templates: saved,
    };
  }

  async fillFromTemplate(
    templateId: string,
    fillData: UpdateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const template = await this.findOneEntity(templateId);
    if (!template.is_modelo) {
      throw new BadRequestException(
        'O checklist especificado não é um template',
      );
    }

    const newChecklist = this.buildChecklistFromTemplate(template, fillData);
    newChecklist.foto_equipamento =
      this.normalizeChecklistPhotoReference(
        newChecklist.foto_equipamento,
        'Foto do equipamento',
      ) ?? '';
    newChecklist.status = this.deriveChecklistStatus(newChecklist);
    this.assertChecklistExecutionRequirements(newChecklist);
    await this.validateChecklistRelations(newChecklist);
    const saved = await this.checklistsRepository.save(newChecklist);

    try {
      this.notificationsGateway.sendToCompany(
        saved.company_id,
        'checklist:created',
        { id: saved.id, titulo: saved.titulo },
      );
    } catch (e) {
      this.logger.error('Falha ao enviar notificação de checklist criado', e);
    }

    this.logChecklistEvent('checklist_filled_from_template', saved, {
      templateId: template.id,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
    });

    return this.toChecklistResponse(saved);
  }

  async savePdfToStorage(id: string): Promise<{
    fileKey: string;
    folderPath: string;
    fileUrl: string | null;
    url: string | null;
    originalName: string;
    entityId: string;
    hasFinalPdf: true;
    availability: 'ready' | 'registered_without_signed_url';
    message: string;
  }> {
    const checklist = await this.findOneEntity(id);
    await this.assertChecklistReadyForFinalPdf(checklist);
    const pdfBuffer = await this.generatePdf(checklist);

    const documentDate = this.getChecklistDocumentDate(checklist);
    const year = documentDate.getFullYear();
    const weekNumber = String(getIsoWeekNumber(documentDate) || 1).padStart(
      2,
      '0',
    );
    const folderPath = `checklists/${checklist.company_id}/${year}/week-${weekNumber}`;
    const fileName = `checklist-${checklist.id}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      `checklists/${year}/week-${weekNumber}`,
      checklist.id,
      fileName,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      pdfBuffer,
      'application/pdf',
    );
    try {
      let fileUrl: string | null = null;
      let availability: 'ready' | 'registered_without_signed_url' = 'ready';
      let message = 'PDF final do checklist emitido com sucesso.';

      try {
        fileUrl =
          await this.documentStorageService.getPresignedDownloadUrl(fileKey);
      } catch (urlError) {
        availability = 'registered_without_signed_url';
        message =
          'PDF final emitido e registrado, mas a URL assinada não está disponível no momento.';
        this.logger.warn({
          event: 'checklist_pdf_presigned_url_unavailable',
          checklistId: checklist.id,
          companyId: checklist.company_id,
          requestId: RequestContext.getRequestId(),
          error:
            urlError instanceof Error ? urlError.message : String(urlError),
        });
      }

      await this.documentGovernanceService.registerFinalDocument({
        companyId: checklist.company_id,
        module: 'checklist',
        entityId: checklist.id,
        title: checklist.titulo,
        documentDate,
        fileKey,
        folderPath,
        originalName: fileName,
        mimeType: 'application/pdf',
        createdBy: RequestContext.getUserId() || undefined,
        fileBuffer: pdfBuffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Checklist).update(
            { id: checklist.id },
            {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: fileName,
            },
          );
        },
      });

      this.logChecklistEvent('checklist_pdf_finalized', checklist, {
        fileKey,
        folderPath,
        availability,
      });

      return {
        entityId: checklist.id,
        fileKey,
        folderPath,
        originalName: fileName,
        fileUrl,
        url: fileUrl,
        hasFinalPdf: true,
        availability,
        message,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `checklist:${checklist.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const checklist = await this.findOneEntity(id);
    await this.assertChecklistReadyForFinalPdf(checklist);

    const documentDate = this.getChecklistDocumentDate(checklist);
    const year = documentDate.getFullYear();
    const weekNumber = String(getIsoWeekNumber(documentDate) || 1).padStart(
      2,
      '0',
    );
    const folderPath = `checklists/${checklist.company_id}/${year}/week-${weekNumber}`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      `checklists/${year}/week-${weekNumber}`,
      checklist.id,
      file.originalname,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: checklist.company_id,
        module: 'checklist',
        entityId: checklist.id,
        title: checklist.titulo,
        documentDate,
        documentCode: this.buildChecklistDocumentCode(checklist),
        fileKey,
        folderPath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdBy: userId || RequestContext.getUserId() || undefined,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Checklist).update(
            { id: checklist.id },
            {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: file.originalname,
            },
          );
        },
      });

      this.logChecklistEvent('checklist_pdf_attached', checklist, {
        fileKey,
        folderPath,
        originalName: file.originalname,
      });

      return {
        fileKey,
        folderPath,
        originalName: file.originalname,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `checklist:${checklist.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async getPdfAccess(id: string): Promise<ChecklistPdfAccessResponse> {
    const checklist = await this.findOneEntity(id);
    if (!checklist.pdf_file_key) {
      const response: ChecklistPdfAccessResponse = {
        entityId: checklist.id,
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'O checklist ainda não possui PDF final emitido.',
      };
      this.logChecklistEvent('checklist_pdf_access_checked', checklist, {
        availability: response.availability,
      });
      return response;
    }

    let url: string | null = null;
    let availability: ChecklistPdfAccessAvailability = 'ready';
    let message = 'PDF final do checklist disponível para acesso.';
    try {
      url = await this.documentStorageService.getSignedUrl(
        checklist.pdf_file_key,
      );
      if (!url) {
        availability = 'registered_without_signed_url';
        message =
          'PDF final registrado, mas a URL assinada não está disponível no momento.';
      }
    } catch {
      url = null;
      availability = 'registered_without_signed_url';
      message =
        'PDF final registrado, mas a URL assinada não está disponível no momento.';
    }

    const response: ChecklistPdfAccessResponse = {
      entityId: checklist.id,
      fileKey: checklist.pdf_file_key,
      folderPath: checklist.pdf_folder_path,
      originalName: checklist.pdf_original_name,
      url,
      hasFinalPdf: true,
      availability,
      message,
    };

    this.logChecklistEvent('checklist_pdf_access_checked', checklist, {
      availability: response.availability,
      hasUrl: Boolean(response.url),
    });

    return response;
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    const effectiveWhere =
      'deleted_at' in where ? where : { ...where, deleted_at: IsNull() };
    return this.checklistsRepository.count({
      where: tenantId
        ? { ...effectiveWhere, company_id: tenantId }
        : effectiveWhere,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments(
      'checklist',
      filters,
    );
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'checklist',
      'Checklist',
      filters,
    );
  }

  async importFromWord(
    fileBuffer: Buffer,
    mimetype: string,
    originalname: string,
  ): Promise<ChecklistResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.log(`Importando checklist do Word para empresa: ${tenantId}`);

    // 1. Extrair texto do arquivo Word/PDF
    const rawText = await this.fileParserService.extractText(
      fileBuffer,
      mimetype,
      originalname,
    );

    if (!rawText || rawText.trim().length < 10) {
      throw new BadRequestException(
        'O arquivo não contém texto suficiente para extrair um checklist.',
      );
    }

    // 2. Enviar para GPT e estruturar como checklist
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    let structured: {
      titulo: string;
      descricao: string;
      categoria: string;
      periodicidade: string;
      nivel_risco_padrao: string;
      itens: Array<{
        item: string;
        tipo_resposta: string;
        obrigatorio: boolean;
      }>;
    };

    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY não configurada — usando stub de importação',
      );
      structured = {
        titulo:
          originalname.replace(/\.(docx?|pdf)$/i, '').trim() ||
          'Checklist Importado',
        descricao:
          'Modelo importado de arquivo. Edite os itens conforme necessário.',
        categoria: 'SST',
        periodicidade: 'Por tarefa',
        nivel_risco_padrao: 'Médio',
        itens: rawText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 3)
          .slice(0, 30)
          .map((line) => ({
            item: line,
            tipo_resposta: 'sim_nao_na',
            obrigatorio: true,
          })),
      };
    } else {
      const systemPrompt = `Você é um especialista em segurança do trabalho (SST/NR).
Analise o texto extraído de um documento Word e estruture-o como um checklist de inspeção SST.
Retorne SOMENTE um JSON válido, sem markdown, sem explicações adicionais.
Formato obrigatório:
{
  "titulo": "título do checklist (curto, descritivo)",
  "descricao": "descrição do propósito do checklist",
  "categoria": "SST|Qualidade|Equipamento|Atividade Crítica|Manutenção",
  "periodicidade": "Diário|Semanal|Mensal|Por tarefa|Por turno|Por entrada",
  "nivel_risco_padrao": "Baixo|Médio|Alto|Crítico",
  "itens": [
    {
      "item": "descrição do item a verificar",
      "tipo_resposta": "sim_nao_na|conforme|texto|sim_nao",
      "obrigatorio": true
    }
  ]
}
Regras:
- Extraia apenas itens que são verificações concretas (não cabeçalhos ou rodapés)
- Prefira tipo_resposta "sim_nao_na" para verificações binárias
- Use "texto" para itens que pedem descrição ou observação
- Limite a no máximo 50 itens`;

      const userPrompt = `Texto extraído do documento "${originalname}":\n\n${rawText.slice(0, 6000)}`;

      const response = await requestOpenAiChatCompletionResponse({
        apiKey,
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 4000,
        },
        configService: this.configService,
        integration: this.integrationResilienceService,
        circuitBreaker: this.openAiCircuitBreaker,
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Erro ao processar com IA: ${response.status} ${response.statusText}`,
        );
      }

      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = json.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('JSON não encontrado na resposta');
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const parsedItems = Array.isArray(parsed.itens) ? parsed.itens : [];

        structured = {
          titulo:
            typeof parsed.titulo === 'string' && parsed.titulo.trim()
              ? parsed.titulo.trim()
              : originalname.replace(/\.(docx?|pdf)$/i, '').trim() ||
                'Checklist Importado',
          descricao:
            typeof parsed.descricao === 'string' ? parsed.descricao : '',
          categoria:
            typeof parsed.categoria === 'string' ? parsed.categoria : 'SST',
          periodicidade:
            typeof parsed.periodicidade === 'string'
              ? parsed.periodicidade
              : 'Por tarefa',
          nivel_risco_padrao:
            typeof parsed.nivel_risco_padrao === 'string'
              ? parsed.nivel_risco_padrao
              : 'Médio',
          itens: parsedItems
            .map((item) => {
              const current =
                item && typeof item === 'object'
                  ? (item as Record<string, unknown>)
                  : null;
              if (!current || typeof current.item !== 'string') {
                return null;
              }
              return {
                item: current.item,
                tipo_resposta:
                  typeof current.tipo_resposta === 'string'
                    ? current.tipo_resposta
                    : 'sim_nao_na',
                obrigatorio: current.obrigatorio !== false,
              };
            })
            .filter(
              (
                item,
              ): item is {
                item: string;
                tipo_resposta: string;
                obrigatorio: boolean;
              } => item !== null,
            ),
        };
      } catch {
        throw new BadRequestException(
          'Não foi possível interpretar a resposta da IA. Tente novamente ou ajuste o arquivo.',
        );
      }
    }

    if (!structured.itens?.length) {
      throw new BadRequestException(
        'Nenhum item de checklist foi identificado no documento.',
      );
    }

    // 3. Criar checklist como modelo (is_modelo = true)
    const checklist = this.checklistsRepository.create({
      titulo: structured.titulo || 'Checklist Importado',
      descricao: structured.descricao,
      categoria: structured.categoria || 'SST',
      periodicidade: structured.periodicidade || 'Por tarefa',
      nivel_risco_padrao: structured.nivel_risco_padrao || 'Médio',
      itens: structured.itens.map((item, idx) => ({
        id: `item-${idx + 1}`,
        item: item.item,
        tipo_resposta: (item.tipo_resposta ||
          'sim_nao_na') as ChecklistItemValue['tipo_resposta'],
        obrigatorio: item.obrigatorio !== false,
        status: 'ok' as ChecklistItemValue['status'],
        peso: 1,
        observacao: '',
      })) as ChecklistItemValue[],
      is_modelo: true,
      status: 'Pendente',
      data: new Date().toISOString().split('T')[0],
      company_id: tenantId || '',
    });

    const saved = await this.checklistsRepository.save(checklist);
    this.logger.log(
      `Checklist importado do Word salvo como modelo: ${saved.id}`,
    );
    return this.toChecklistResponse(saved);
  }

  /** Validação pública por código de documento (ex.: CHK-2026-XXXXXXXX) */
  async validateByCode(
    code: string,
    companyId: string,
  ): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
  }> {
    const normalized = code.trim().toUpperCase();

    if (!normalized.startsWith('CHK-')) {
      return {
        valid: false,
        message: 'Código inválido ou expirado.',
      };
    }

    const validation = await this.documentRegistryService.validatePublicCode({
      code: normalized,
      companyId,
      expectedModule: 'checklist',
    });

    if (!validation.valid) {
      return {
        valid: false,
        code: normalized,
        message: validation.message,
      };
    }

    return {
      valid: true,
      code: normalized,
    };
  }

  async validateByCodeLegacy(code: string): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
  }> {
    const normalized = code.trim().toUpperCase();
    if (!normalized.startsWith('CHK-')) {
      return {
        valid: false,
        message: 'Código inválido ou expirado.',
      };
    }

    return this.documentRegistryService.validateLegacyPublicCode({
      code: normalized,
      expectedModule: 'checklist',
    });
  }
}
