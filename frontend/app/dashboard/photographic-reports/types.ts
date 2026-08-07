import type {
  PhotographicReportAreaStatus,
  PhotographicReportShift,
  PhotographicReportStatus,
  PhotographicReportTone,
} from '@/services/photographicReportsService';
import type { ProcessedMobileImage } from '@/lib/images/process-mobile-image';

export type WizardStep = 1 | 2 | 3;

export type ReportFormState = {
  client_id: string;
  project_id: string;
  client_name: string;
  project_name: string;
  unit_name: string;
  location: string;
  activity_type: string;
  report_tone: PhotographicReportTone;
  area_status: PhotographicReportAreaStatus;
  shift: PhotographicReportShift;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  responsible_name: string;
  contractor_company: string;
  general_observations: string;
  ai_summary: string;
  final_conclusion: string;
  status: PhotographicReportStatus;
};

export type PendingPhoto = {
  id: string;
  original: File;
  processed?: ProcessedMobileImage;
  previewUrl?: string;
  status: 'processing' | 'ready' | 'error' | 'cancelled';
  error?: string;
};
