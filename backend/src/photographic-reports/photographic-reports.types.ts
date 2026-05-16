import {
  PhotographicReportAreaStatus,
  PhotographicReportShift,
  PhotographicReportStatus,
  PhotographicReportTone,
} from './entities/photographic-report.entity';
import { PhotographicReportExportType } from './entities/photographic-report-export.entity';

export type PhotographicReportDayResponse = {
  id: string;
  report_id: string;
  activity_date: string;
  day_summary: string | null;
  created_at: string;
  updated_at: string;
  image_count?: number;
};

export type PhotographicReportImageResponse = {
  id: string;
  report_id: string;
  report_day_id: string | null;
  image_url: string;
  download_url: string | null;
  image_order: number;
  manual_caption: string | null;
  ai_title: string | null;
  ai_description: string | null;
  ai_positive_points: string[] | null;
  ai_technical_assessment: string | null;
  ai_condition_classification: string | null;
  ai_recommendations: string[] | null;
  created_at: string;
  updated_at: string;
  day?: PhotographicReportDayResponse | null;
};

export type PhotographicReportExportResponse = {
  id: string;
  report_id: string;
  export_type: PhotographicReportExportType;
  file_url: string;
  download_url: string | null;
  generated_by: string | null;
  generated_at: string;
};

export type PhotographicReportListItemResponse = {
  id: string;
  company_id: string;
  client_id: string | null;
  project_id: string | null;
  client_name: string;
  project_name: string;
  unit_name: string | null;
  location: string | null;
  activity_type: string;
  report_tone: PhotographicReportTone;
  area_status: PhotographicReportAreaStatus;
  shift: PhotographicReportShift;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  responsible_name: string;
  contractor_company: string;
  general_observations: string | null;
  ai_summary: string | null;
  final_conclusion: string | null;
  status: PhotographicReportStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  day_count: number;
  image_count: number;
  export_count: number;
  last_exported_at: string | null;
};

export type PhotographicReportResponse = PhotographicReportListItemResponse & {
  days: PhotographicReportDayResponse[];
  images: PhotographicReportImageResponse[];
  exports: PhotographicReportExportResponse[];
};
