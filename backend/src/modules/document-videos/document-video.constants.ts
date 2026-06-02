export const GOVERNED_VIDEO_ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
] as const;

export const GOVERNED_VIDEO_MAX_FILE_SIZE_BYTES = 75 * 1024 * 1024;

export const GOVERNED_VIDEO_ACCEPT_HINT =
  '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime';
