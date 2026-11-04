/**
 * Type definitions for PrismDesk Media Vault (Node.js fs Physical Sync Edition)
 */

// Dynamic SectionId: includes default 6 sections and user-created categories
export type SectionId = string;

export type ThemeMode = 'light' | 'dark';

export interface SectionConfig {
  id: SectionId;
  name: string;
  enName: string;
  dirName?: string; // Physical directory name under vaultRootPath
  description: string;
  iconName: string;
  badgeColor: string;
  accentColor: string;
  mediaCategory: 'image' | 'video' | 'all';
  isBuiltin?: boolean;
}

export interface FolderItem {
  id: string;
  sectionId: SectionId;
  name: string;
  dirName?: string;
  folderPath?: string;
  description?: string;
  coverUrl?: string;
  coverFileName?: string;
  coverDataUrl?: string;
  coverSourceFilePath?: string;
  clearCover?: boolean;
  createdAt: number;
  itemCount?: number;
}

export interface MediaItem {
  id: string;
  folderId: string;
  sectionId: SectionId;
  name: string;
  filePath?: string;
  type: 'image' | 'video';
  url: string;
  size: number;
  sizeFormatted: string;
  dimensions?: string;
  duration?: number;
  durationFormatted?: string;
  createdAt: number;
  tags?: string[];
}

export interface ClipboardState {
  action: 'copy' | 'cut';
  items: MediaItem[];
}

export interface SecurityConfig {
  isPasswordSet: boolean;
  passwordHash: string;
  hint: string;
  isLocked: boolean;
}

export type ViewMode = 'compact' | 'normal' | 'spacious';
export type SortOption = 
  | 'date-desc' 
  | 'date-asc' 
  | 'name-asc' 
  | 'name-desc' 
  | 'size-desc' 
  | 'size-asc';
