export type ChatMode = 'documents' | 'summary' | 'data' | 'agent';

export const modeOptions: { value: ChatMode; label: string; help: string }[] = [
  { value: 'documents', label: 'Documents', help: 'Searches your uploaded documents.' },
  { value: 'summary', label: 'Summarise', help: 'Creates a summary of one document.' },
  { value: 'data', label: 'Tasks and project', help: 'Answers questions about tasks, deadlines, and progress.' },
  { value: 'agent', label: 'Everything', help: 'Uses both documents and project information.' },
];
