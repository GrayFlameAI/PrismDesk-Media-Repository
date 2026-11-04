import { SectionConfig } from '../types';

export const SECTIONS: SectionConfig[] = [
  {
    id: 'materials',
    name: '素材图区域',
    enName: 'Raw Materials',
    dirName: 'materials',
    description: '原始素材图片、设计原件、构图参考与元素资产',
    iconName: 'Image',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#0284c7',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'finished',
    name: '成品图区域',
    enName: 'Finished Works',
    dirName: 'finished',
    description: '定稿海报、电商详情图、KV 视觉与发布级视觉成稿',
    iconName: 'Sparkles',
    badgeColor: 'text-sky-800 bg-sky-100/70 border-sky-300/80',
    accentColor: '#0369a1',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'upscaled',
    name: '二次放大图片区域',
    enName: 'Upscaled Images',
    dirName: 'upscaled',
    description: '超分高清重绘、AI 放大 4K/8K 增强图与精修细节特写',
    iconName: 'Maximize2',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#0ea5e9',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'video_assets',
    name: '视频素材区域',
    enName: 'Video Assets',
    dirName: 'video_assets',
    description: '实拍镜头、转场特写、背景动态与 B-Roll 空镜视频片段',
    iconName: 'Film',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#38bdf8',
    mediaCategory: 'video',
    isBuiltin: true,
  },
  {
    id: 'generated_videos',
    name: '生成视频素材区域',
    enName: 'Generated Videos',
    dirName: 'generated_videos',
    description: 'AI 生成动态视频、特效镜头、运镜合成与动作演化素材',
    iconName: 'Activity',
    badgeColor: 'text-sky-800 bg-sky-100/60 border-sky-200',
    accentColor: '#0284c7',
    mediaCategory: 'video',
    isBuiltin: true,
  },
  {
    id: 'masterpieces',
    name: '成品区域',
    enName: 'Final Deliverables',
    dirName: 'masterpieces',
    description: '最终定稿成片、代表作合集、高光混剪与全套商业交付成品',
    iconName: 'Crown',
    badgeColor: 'text-sky-900 bg-sky-100 border-sky-300',
    accentColor: '#0369a1',
    mediaCategory: 'all',
    isBuiltin: true,
  },
];

export const DEFAULT_INITIAL_FOLDERS = [
  // 素材图区域 (Raw Materials)
  { id: 'f-mat-1', sectionId: 'materials', name: '纹理背景与环境材质', description: '高质感背景、光影与渐变素材', createdAt: Date.now() - 86400000 * 5 },
  { id: 'f-mat-2', sectionId: 'materials', name: '人物肖像与主体抠图', description: '无损透明底、人像模特与手势参考', createdAt: Date.now() - 86400000 * 4 },
  
  // 成品图区域 (Finished Works)
  { id: 'f-fin-1', sectionId: 'finished', name: '2026 商业视觉发布系列', description: '最终交付商业全套宣传主图', createdAt: Date.now() - 86400000 * 3 },
  { id: 'f-fin-2', sectionId: 'finished', name: '电商大促活动 KV 定稿', description: '首页焦点图与各端适配版面', createdAt: Date.now() - 86400000 * 2 },

  // 二次放大图片区域 (Upscaled Images)
  { id: 'f-ups-1', sectionId: 'upscaled', name: '8K 超清细节增强图', description: 'Topaz / AI 细节放大原图', createdAt: Date.now() - 86400000 * 3 },

  // 视频素材区域 (Video Assets)
  { id: 'f-vid-1', sectionId: 'video_assets', name: '实拍镜头与空镜素材库', description: '4K 运镜实拍、转场特写与 B-Roll 空镜', createdAt: Date.now() - 86400000 * 2 },

  // 生成视频素材区域 (Generated Videos)
  { id: 'f-gen-1', sectionId: 'generated_videos', name: 'AI 生成动态视频与特效', description: 'Sora / Runway / Veo 生成视频素材片段', createdAt: Date.now() - 86400000 * 1 },

  // 成品区域 (Final Deliverables)
  { id: 'f-mas-1', sectionId: 'masterpieces', name: '个人年度代表作精选集', description: '最终定稿视频与最具影响力核心成品', createdAt: Date.now() },
];
