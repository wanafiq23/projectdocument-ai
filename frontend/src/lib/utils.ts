export const uid = () => crypto.randomUUID();
export const MAX_DOCUMENT_FILES = 10;
export const MAX_DOCUMENT_FILE_SIZE = 50 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = new Set(['PDF', 'DOCX', 'TXT']);

export function validDocumentFiles(files: File[], report: (message: string) => void) {
  if (files.length > MAX_DOCUMENT_FILES) report(`Choose up to ${MAX_DOCUMENT_FILES} files at a time.`);
  return files.slice(0, MAX_DOCUMENT_FILES).filter(file => {
    const extension = file.name.split('.').pop()?.toUpperCase();
    if (!extension || !DOCUMENT_EXTENSIONS.has(extension)) {
      report(`${file.name}: choose a PDF, DOCX, or TXT file.`);
      return false;
    }
    if (!file.size || file.size > MAX_DOCUMENT_FILE_SIZE) {
      report(`${file.name}: files must be nonempty and no larger than 50 MB.`);
      return false;
    }
    return true;
  });
}

export const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const formatDate = (value: string, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return 'No due date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric' });
};
export const initials = (name: string) => name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
export const fileSize = (size: number) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
export const slug = (text: string) => text.toLowerCase().replaceAll(' ', '-');
