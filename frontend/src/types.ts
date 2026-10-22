export type ProjectStatus = 'In Progress' | 'Planning' | 'Completed';
export type TaskStatus = 'To Do' | 'In Progress' | 'Done';
export type Priority = 'Low' | 'Medium' | 'High';
type LegacyProjectColor = 'sage' | 'lavender' | 'peach' | 'blue';

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  color?: LegacyProjectColor;
  status: ProjectStatus;
  dueDate: string;
  createdAt: string;
  members: string[];
}
export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  type: 'PDF' | 'DOCX' | 'TXT';
  size: number;
  uploadedAt: string;
  content: string;
  processingStatus: 'ready' | 'empty' | 'failed';
  processingError: string | null;
  indexingStatus: 'not_indexed' | 'not_configured' | 'indexing' | 'indexed' | 'failed';
  indexingError: string | null;
}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  assignee: string;
}
export interface Citation {
  sourceId?: string;
  page?: number | null;
  chunk?: number;
  documentId: string;
  name: string;
  location: string;
  excerpt: string;
}
export interface ChatMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  toolsUsed?: string[];
  mode?: string;
  createdAt: string;
}
export interface WorkspaceData {
  projects: Project[];
  documents: ProjectDocument[];
  tasks: Task[];
}
