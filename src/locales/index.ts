import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { SectionId, SectionConfig, FolderItem } from '../types';

export type Language = 'zh' | 'en';

export const STORAGE_LANG_KEY = 'prismdesk_lang';

export function getInitialLanguage(): Language {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(STORAGE_LANG_KEY);
      if (saved === 'zh' || saved === 'en') {
        return saved;
      }
      const sysLang = (window.navigator.language || '').toLowerCase();
      if (sysLang.startsWith('en')) {
        return 'en';
      }
    } catch {}
  }
  return 'zh';
}

// 6 Default Built-in Sections Bilingual Dictionary
export const SECTION_TRANSLATIONS: Record<
  string,
  {
    zh: { name: string; subtitle: string; description: string };
    en: { name: string; subtitle: string; description: string };
  }
> = {
  materials: {
    zh: {
      name: '素材图区域',
      subtitle: 'Raw Materials',
      description: '原始素材图片、设计原件、构图参考与元素资产',
    },
    en: {
      name: 'Raw Materials',
      subtitle: '素材图区域',
      description: 'Original source images, design elements, composition references & raw assets',
    },
  },
  finished: {
    zh: {
      name: '成品图区域',
      subtitle: 'Finished Works',
      description: '定稿海报、电商详情图、KV 视觉与发布级视觉成稿',
    },
    en: {
      name: 'Finished Works',
      subtitle: '成品图区域',
      description: 'Finalized posters, e-commerce visuals, key visuals & production-ready artwork',
    },
  },
  upscaled: {
    zh: {
      name: '二次放大图片区域',
      subtitle: 'Upscaled Images',
      description: '超分高清重绘、AI 放大 4K/8K 增强图与精修细节特写',
    },
    en: {
      name: 'Upscaled Images',
      subtitle: '二次放大图片区域',
      description: 'Super-resolution redraws, AI-upscaled 4K/8K enhanced images & retouched details',
    },
  },
  video_assets: {
    zh: {
      name: '视频素材区域',
      subtitle: 'Video Assets',
      description: '实拍镜头、转场特写、背景动态与 B-Roll 空镜视频片段',
    },
    en: {
      name: 'Video Assets',
      subtitle: '视频素材区域',
      description: 'Live-action footage, transition shots, motion backgrounds & B-Roll video clips',
    },
  },
  generated_videos: {
    zh: {
      name: '生成视频素材区域',
      subtitle: 'Generated Videos',
      description: 'AI 生成动态视频、特效镜头、运镜合成与动作演化素材',
    },
    en: {
      name: 'Generated Videos',
      subtitle: '生成视频素材区域',
      description: 'AI-generated motion videos, VFX shots, camera synthesis & animation clips',
    },
  },
  masterpieces: {
    zh: {
      name: '成品区域',
      subtitle: 'Final Deliverables',
      description: '最终定稿成片、代表作合集、高光混剪与全套商业交付成品',
    },
    en: {
      name: 'Final Deliverables',
      subtitle: '成品区域',
      description: 'Master edits, signature portfolios, highlight reels & full commercial deliverables',
    },
  },
};

export const BUILTIN_FOLDER_TRANSLATIONS: Record<
  string,
  {
    zhName: string;
    enName: string;
    zhDesc: string;
    enDesc: string;
    altZhDescs?: string[];
  }
> = {
  '纹理背景与环境材质': {
    zhName: '纹理背景与环境材质',
    enName: 'Textures & Environment Materials',
    zhDesc: '高质感背景、光影与渐变素材',
    enDesc: 'High-texture backgrounds, lighting & gradient assets',
    altZhDescs: ['高动态范围渐变素材 · 适用海报与主视觉底图'],
  },
  '人物肖像与主体抠图': {
    zhName: '人物肖像与主体抠图',
    enName: 'Portraits & Subject Cutouts',
    zhDesc: '无损透明底、人像模特与手势参考',
    enDesc: 'Lossless transparent cutouts, portrait models & pose references',
    altZhDescs: ['无损细节人像参考 · 商业摄影原片归档'],
  },
  '2026 商业视觉发布系列': {
    zhName: '2026 商业视觉发布系列',
    enName: '2026 Commercial Release Series',
    zhDesc: '最终交付商业全套宣传主图',
    enDesc: 'Final delivered commercial campaign key visuals',
    altZhDescs: ['已全渠道过审定稿 · 商业发布级成图'],
  },
  '电商大促活动 KV 定稿': {
    zhName: '电商大促活动 KV 定稿',
    enName: 'E-Commerce Campaign Key Visuals',
    zhDesc: '首页焦点图与各端适配版面',
    enDesc: 'Homepage hero banners & multi-platform layouts',
  },
  '8K 超清细节增强图': {
    zhName: '8K 超清细节增强图',
    enName: '8K Ultra-HD Detail Enhancements',
    zhDesc: 'Topaz / AI 细节放大原图',
    enDesc: 'Topaz & AI super-resolution upscaled masters',
    altZhDescs: ['AI 4x 超分辨无损放大 · 纤毫毕现'],
  },
  '实拍镜头与空镜素材库': {
    zhName: '实拍镜头与空镜素材库',
    enName: 'Live Footage & B-Roll Library',
    zhDesc: '4K 运镜实拍、转场特写与 B-Roll 空镜',
    enDesc: '4K camera movement shots, transitions & B-Roll footage',
    altZhDescs: ['B-Roll 高帧率实拍空镜与转场素材'],
  },
  'AI 生成动态视频与特效': {
    zhName: 'AI 生成动态视频与特效',
    enName: 'AI Motion Videos & VFX Clips',
    zhDesc: 'Sora / Runway / Veo 生成视频素材片段',
    enDesc: 'Sora, Runway & Veo generative video sequences',
    altZhDescs: ['生成式视频特效镜头 · 60fps 序列参考'],
  },
  '个人年度代表作精选集': {
    zhName: '个人年度代表作精选集',
    enName: 'Annual Signature Masterpieces',
    zhDesc: '最终定稿视频与最具影响力核心成品',
    enDesc: 'Finalized master videos & flagship commercial deliverables',
    altZhDescs: ['PrismDesk 成品区域殿堂级典藏作品'],
  },
  '默认素材夹': {
    zhName: '默认素材夹',
    enName: 'Default Assets',
    zhDesc: '新建分类默认归档文件夹',
    enDesc: 'Default archive folder for new media directory',
  },
};

export const UI_DICTIONARY = {
  zh: {
    // Document & App Branding
    'app.docTitle': 'PrismDesk 媒体宝库 - 创意设计与视频素材中心',
    'app.name': 'PrismDesk',
    'app.editionBadge': '本地物理同步版',

    // TitleBar
    'titlebar.searchPlaceholder': '全局搜索全库物理图片、视频名称或标签 (Ctrl + F)...',
    'titlebar.clearSearch': '清除搜索',
    'titlebar.localFolder': '本地目录',
    'titlebar.localFolderTitle': '在资源管理器打开物理根目录: {path}',
    'titlebar.lock': '锁定',
    'titlebar.lockTitleSet': '点击立即锁定应用 (输入密码方可进入)',
    'titlebar.lockTitleUnset': '点击设置保护密码并锁定',
    'titlebar.themeLightTitle': '切换至黑夜模式 (Dark Mode)',
    'titlebar.themeDarkTitle': '切换至白天模式 (Light Mode)',
    'titlebar.langSwitchTitle': 'Switch Language to English (切换中/英文)',
    'titlebar.settingsTitle': '本地物理目录切换与密码设置',
    'titlebar.minimize': '最小化窗口',
    'titlebar.maximize': '最大化 / 还原窗口',
    'titlebar.close': '关闭应用',

    // Sidebar (Dynamic Media Directories & Tree-View Subfolders)
    'sidebar.sectionsHeader': '媒体目录',
    'sidebar.addCategoryBtn': '+ 新建',
    'sidebar.addCategoryTitle': '新建自定义媒体目录分类',
    'sidebar.rightClickHint': '点击展开子文件夹树 · 右键可修改名称或删除此媒体目录',
    'sidebar.treeExpand': '展开子目录树',
    'sidebar.treeCollapse': '折叠子目录树',
    'sidebar.noSubfolders': '暂无子文件夹',
    'sidebar.newSubfolderHere': '+ 新建子文件夹',
    'sidebar.ctxRename': '修改名称',
    'sidebar.ctxDelete': '删除',
    'sidebar.folderCountUnit': '{count} 夹',
    'sidebar.folderCountTitle': '{count} 个物理文件夹',
    'sidebar.itemCountUnit': '{count} 件',
    'sidebar.itemCountTitle': '{count} 个媒体文件',
    'sidebar.storageTitle': '点击在 Windows 资源管理器中打开本地物理根目录：\n{path}',
    'sidebar.storageLabel': '本地存储缓存',
    'sidebar.storageUnset': '点击配置本地目录',
    'sidebar.openExplorer': '打开目录 →',
    'sidebar.passwordEnabled': '密码保护已启用',
    'sidebar.passwordDisabled': '未设置开机密码',
    'sidebar.lockNow': '立即锁屏',

    // Global Search Results View
    'globalSearch.title': '全库全局搜索结果：「{query}」',
    'globalSearch.subtitle': '跨所有媒体目录与物理子文件夹实时检索 · 共匹配 {mediaCount} 件素材、{folderCount} 个子文件夹',
    'globalSearch.clearBtn': '退出全局搜索',
    'globalSearch.matchedFolders': '匹配的物理子文件夹 ({count})',
    'globalSearch.matchedMedia': '匹配的图片与视频素材 ({count})',
    'globalSearch.emptyTitle': '全库未找到与「{query}」匹配的媒体或文件夹',
    'globalSearch.emptyDesc': '请尝试更换关键词，或点击右上角按钮退出搜索返回目录视图。',
    'globalSearch.locateFolder': '所属目录：{section} / {folder}',

    // Category Create / Rename / Delete Modals
    'categoryModal.createTitle': '新建媒体目录分类',
    'categoryModal.renameTitle': '修改媒体目录名称',
    'categoryModal.subtitle': '配置将保存至 .prism_categories.json 并同步本地硬盘文件夹',
    'categoryModal.nameLabel': '媒体目录名称',
    'categoryModal.namePlaceholder': '例如：3D 渲染资产库、音效与配乐参考',
    'categoryModal.descLabel': '目录说明 (选填)',
    'categoryModal.descPlaceholder': '简要说明该媒体目录存放的资产类型',
    'categoryModal.cancel': '取消',
    'categoryModal.confirmCreate': '创建目录',
    'categoryModal.confirmRename': '保存修改',
    'deleteCategoryModal.title': '确认删除媒体目录「{name}」？',
    'deleteCategoryModal.desc': '删除后将通过 shell.trashItem 将该分类对应的本地硬盘文件夹安全移入系统回收站（可在回收站中还原）。',
    'deleteCategoryModal.cancel': '取消',
    'deleteCategoryModal.confirm': '移入回收站并删除',

    // MediaCard Custom Context Menu & Rename / Move Modals
    'mediaCtx.rename': '修改名称',
    'mediaCtx.copy': '复制 (本地路径)',
    'mediaCtx.moveTo': '移动到...',
    'mediaCtx.delete': '删除 (移入回收站)',
    'mediaCtx.setCover': '设为当前文件夹封面',
    'mediaCtx.openLightbox': '全屏放大预览',
    'mediaRenameModal.title': '修改媒体文件名称',
    'mediaRenameModal.subtitle': '将调用 fs.renameSync 同步修改电脑硬盘上的物理文件名',
    'mediaRenameModal.label': '新文件名称',
    'mediaRenameModal.cancel': '取消',
    'mediaRenameModal.confirm': '确认修改',
    'mediaMoveModal.title': '移动文件至其他媒体目录',
    'mediaMoveModal.subtitle': '正在移动「{name}」· 请选择目标媒体目录与子文件夹 (调用 fs.rename 同步移动)',
    'mediaMoveModal.selectCategory': '1. 选择目标媒体目录',
    'mediaMoveModal.selectSubfolder': '2. 选择目标子文件夹',
    'mediaMoveModal.autoCreateDefault': '自动移入该目录的「默认素材夹」',
    'mediaMoveModal.currentLocationBadge': '当前所在',
    'mediaMoveModal.cancel': '取消',
    'mediaMoveModal.confirm': '立即移动物理文件',

    // BreadcrumbBar
    'breadcrumb.clipboardPending': '剪贴板待粘贴 ({count})',
    'breadcrumb.pasteCopy': '粘贴物理副本',
    'breadcrumb.clearClipboardTitle': '清空剪贴板',
    'breadcrumb.cancel': '取消',
    'breadcrumb.selectAll': '全选',
    'breadcrumb.selectedCount': '已选 {count}',
    'breadcrumb.selectAllTitle': '全选所有素材',
    'breadcrumb.deselectAllTitle': '取消全选',
    'breadcrumb.batchDelete': '安全删除',
    'breadcrumb.batchDeleteTitle': '将所选源文件批量移入系统回收站 (shell.trashItem)',
    'breadcrumb.sortLabel': '排序:',
    'breadcrumb.sortTitle': '选择文件夹内素材排序方式（支持按名称、日期、大小正序/倒序排列）',
    'breadcrumb.sort.dateDesc': '按日期：最新优先 (↓)',
    'breadcrumb.sort.dateAsc': '按日期：最早优先 (↑)',
    'breadcrumb.sort.nameAsc': '按名称：正序 (A → Z)',
    'breadcrumb.sort.nameDesc': '按名称：倒序 (Z → A)',
    'breadcrumb.sort.sizeDesc': '按大小：从大到小 (↓)',
    'breadcrumb.sort.sizeAsc': '按大小：从小到大 (↑)',
    'breadcrumb.view.compact': '小图',
    'breadcrumb.view.compactTitle': '紧凑小网格',
    'breadcrumb.view.normal': '标准',
    'breadcrumb.view.normalTitle': '标准适中网格',
    'breadcrumb.view.spacious': '大图',
    'breadcrumb.view.spaciousTitle': '大图清晰网格',
    'breadcrumb.newFolder': '新建文件夹',
    'breadcrumb.newFolderTitle': '在当前媒体目录下新建物理子文件夹',
    'breadcrumb.refresh': '刷新',
    'breadcrumb.refreshTitle': '通过 IPC 重新扫描当前目录物理文件并立即更新界面 (已开启 fs.watch 自动热加载)',
    'breadcrumb.importMedia': '导入素材',
    'breadcrumb.importMediaTitle': '批量异步流式导入图片与视频素材至本地文件夹',
    'breadcrumb.backUpper': '返回上一级',
    'breadcrumb.backUpperTitle': '返回上一级文件夹列表 (快捷键: Esc 或 Backspace)',

    // Main Workspace Banner & Empty States
    'workspace.folderItemCount': '当前物理目录共 {count} 件素材',
    'workspace.sectionFolderCount': '当前目录内包含 {count} 个物理子文件夹',
    'workspace.hoverHint': '支持右键卡片重命名/移动/复制路径 · 悬停平滑放大预览',
    'workspace.dragOverlayTitle': '松开鼠标，立即通过零内存流式队列 (fs.copyFile) 导入文件',
    'workspace.dragOverlayTarget': '目标位置：{target}',
    'workspace.autoArchive': '自动归档',
    'workspace.defaultDropFolderSuffix': '_默认目录',
    'workspace.defaultDropFolderDesc': '拖拽自动创建目录',
    'workspace.emptyFoldersTitle': '该媒体目录暂无子文件夹',
    'workspace.emptyFoldersDesc': '您可以新建分类子文件夹以存放{section}，所有文件夹与自定义封面 (.prism_meta.json) 均实时同步在本地硬盘中。',
    'workspace.createFirstFolder': '新建第一个子文件夹',
    'workspace.loadDemoPackBtn': '生成精选测试素材包',
    'workspace.emptyMediaTitle': '物理文件夹内暂无图片或视频素材',
    'workspace.emptyMediaDesc': '您可以直接从 Windows 桌面将文件拖入此窗口，或点击下方按钮批量导入本地文件。',
    'workspace.importNowBtn': '立即导入素材',
    'workspace.pasteClipboardBtn': '粘贴剪贴板 ({count} 项)',
    'workspace.batchProcessing': '正在异步批量处理物理文件，请稍候...',
    'workspace.importingProgress': '正在导入 ({current}/{total})',
    'workspace.importingDetail': '底层流式复制中 (并发队列控制 · 零内存驻留)',

    // FolderCard
    'folderCard.noCover': '自定义封面未设定',
    'folderCard.changeCoverBtn': '换封面',
    'folderCard.changeCoverTitle': '更换自定义展示封面图',
    'folderCard.moreActionsTitle': '更多文件夹操作',
    'folderCard.menuSetCover': '设置封面',
    'folderCard.menuEdit': '重命名 / 编辑',
    'folderCard.menuDelete': '删除文件夹 (回收站)',
    'folderCard.itemCountBadge': '{count} 件素材',
    'folderCard.noDescription': '暂无描述信息',
    'folderCard.enterFolder': '点击进入 →',

    // MediaCard
    'mediaCard.selectTitle': '选择该文件',
    'mediaCard.lightboxTitle': '双击或点击全屏放大查看',
    'mediaCard.copyTitle': '复制文件本地路径 (右键卡片可打开完整菜单)',
    'mediaCard.setCoverTitle': '设为此文件夹的展示封面',
    'mediaCard.deleteTitle': '安全移入系统回收站 (shell.trashItem)',
    'mediaCard.deleteConfirmTitle': '再次点击立即移入系统回收站',
    'mediaCard.deleteConfirmText': '确认删',
    'mediaCard.mutedPreviewBadge': '自动静音预览中',
    'mediaCard.hdFormat': '高清格式',
    'mediaCard.videoBadge': '视频',

    // First-Launch Root Setup Modal & Delete Folder Modal
    'setupModal.title': '欢迎使用 PrismDesk · 选择本地媒体库根目录',
    'setupModal.subtitle': '首次启动请指定电脑上的物理存储文件夹，软件将通过 Node.js fs 自动创建媒体目录',
    'setupModal.label': '本地物理存储根目录路径',
    'setupModal.placeholder': '例如：D:\\PrismDeskVault',
    'setupModal.browse': '浏览选择...',
    'setupModal.descPrefix': '将在该目录下自动建立默认媒体目录：',
    'setupModal.descSections': '素材图区域、成品图区域、二次放大图片区域、视频素材区域、生成视频素材区域、成品区域',
    'setupModal.descSuffix': '。后续可在左侧栏自由增删或重命名目录。',
    'setupModal.creating': '正在创建物理目录...',
    'setupModal.confirm': '确认并初始化媒体库',
    'deleteFolderModal.title': '确认删除子文件夹「{name}」？',
    'deleteFolderModal.desc': '此操作将调用 shell.trashItem 将该文件夹及其内部文件安全移入系统回收站。',
    'deleteFolderModal.cancel': '取消',
    'deleteFolderModal.confirm': '移入回收站',

    // UploadModal
    'uploadModal.title': '批量流式导入素材至「{name}」',
    'uploadModal.subtitle': '采用物理路径 (file.path) + 主进程流式队列复制，支持 700MB+ 大视频与 30+ 批量文件零内存溢出',
    'uploadModal.dropTitle': '点击选择电脑文件，或直接从 Windows 桌面拖拽至此',
    'uploadModal.dropSubtitle': '支持 JPG / PNG / WEBP / GIF 与 MP4 / WEBM / MOV · 纯路径流式复制不占内存',
    'uploadModal.nativePickerBtn': '打开系统原生文件选择器 (推荐大视频批量直传)',
    'uploadModal.streamingBadge': '流式直传',
    'uploadModal.pendingCount': '已就绪待流式复制文件 ({count})',
    'uploadModal.clearList': '清空列表',
    'uploadModal.cancel': '取消',
    'uploadModal.processing': '正在队列流式复制...',
    'uploadModal.confirm': '确认流式导入 ({count} 项)',
    'uploadModal.errorDefault': '写入本地物理磁盘失败，请重试',

    // FolderModal
    'folderModal.editTitle': '编辑物理文件夹与封面配置',
    'folderModal.newTitle': '新建本地物理分类文件夹',
    'folderModal.subtitle': '所属目录：{section} · 封面将永久写入文件夹内 .prism_meta.json',
    'folderModal.nameLabel': '物理文件夹名称',
    'folderModal.namePlaceholder': '例如：2026年度视觉参考、高光镜头分解',
    'folderModal.descLabel': '文件夹备注 / 描述 (选填，将写入 .prism_meta.json)',
    'folderModal.descPlaceholder': '简要记录本文件夹归档的素材规格或项目背景',
    'folderModal.coverLabel': '自定义文件夹永久展示封面图',
    'folderModal.clearCover': '清除封面',
    'folderModal.noCoverSpecified': '尚未指定封面（将默认显示第一张素材或文件夹图标）',
    'folderModal.tabUpload': '上传本地封面图',
    'folderModal.tabSelect': '从现有素材库挑选',
    'folderModal.tabUrl': '填图片直链',
    'folderModal.uploadBtn': '选择本地任意图片并永久保存到此文件夹',
    'folderModal.noMediaToSelect': '库中暂无可供挑选的图片素材，请先上传或切换其他方式',
    'folderModal.cancel': '取消',
    'folderModal.saving': '正在保存...',
    'folderModal.save': '完成保存',

    // LightboxModal
    'lightbox.zoomOut': '缩小',
    'lightbox.zoomIn': '放大',
    'lightbox.rotate': '旋转 90°',
    'lightbox.copy': '复制路径',
    'lightbox.copied': '已复制',
    'lightbox.copyTitle': '复制本地路径到系统剪贴板',
    'lightbox.download': '下载',
    'lightbox.downloadTitle': '下载媒体源文件',
    'lightbox.closeTitle': '关闭 (Esc)',
    'lightbox.prevTitle': '上一张 (← 键盘左方向键)',
    'lightbox.nextTitle': '下一张 (→ 键盘右方向键)',
    'lightbox.resolution': '分辨率：{value}',
    'lightbox.size': '大小：{value}',
    'lightbox.formatVideo': '格式：MP4 / 视频',
    'lightbox.formatImage': '格式：JPG / PNG / 图片',
    'lightbox.shortcutHint': '提示：使用 ← → 切换，按钮缩放旋转，Esc 退出',

    // SettingsModal
    'settings.title': '本地物理存储目录与安全设置',
    'settings.rootSectionTitle': '本地媒体库物理根目录 (Node.js fs 实时读写)',
    'settings.openInExplorer': '在资源管理器中打开',
    'settings.rootDesc': '所有媒体目录、图片视频源文件及自定义封面配置 (.prism_meta.json) 均真实存储在此物理目录下。',
    'settings.browse': '浏览选择...',
    'settings.applying': '应用中...',
    'settings.applyRoot': '应用目录',
    'settings.rootUpdateSuccess': '本地物理媒体库根目录已成功切换！',
    'settings.rootUpdateError': '无法创建或访问该物理路径，请检查磁盘权限',
    'settings.changePwdTitle': '修改软件访问密码',
    'settings.setPwdTitle': '设置访问密码',
    'settings.oldPwdLabel': '当前旧密码',
    'settings.oldPwdConfirmHint': '(输入后再次点击下方取消密码保护)',
    'settings.oldPwdPlaceholder': '输入现有的旧密码',
    'settings.newPwdLabel': '新密码',
    'settings.newPwdPlaceholder': '设置新的安全密码',
    'settings.hintLabel': '密码防忘提示 (选填)',
    'settings.hintPlaceholder': '例如：常用生日后四位',
    'settings.disablePwd': '取消密码保护',
    'settings.savingPwd': '正在更新...',
    'settings.savePwd': '保存新密码',
    'settings.errWrongOldPwd': '原密码不正确，无法修改',
    'settings.errEmptyNewPwd': '新密码不能为空',
    'settings.pwdUpdatedSuccess': '密码已成功更新！',
    'settings.pwdUpdateFailed': '更新密码失败，请重试',
    'settings.errEnterOldToDisable': '请先在上方「当前旧密码」输入框输入现有密码以确认取消保护',
    'settings.pwdDisabledSuccess': '已取消密码保护，启动软件将直接进入工作区',
    'settings.dataManagementTitle': '物理数据管理与示例生成',
    'settings.demoPackTitle': '生成内置精选物理演示素材包',
    'settings.demoPackDesc': '在各物理媒体目录内自动写入高清示例图片与 .prism_meta.json 封面配置',
    'settings.demoPackBtn': '生成体验包',
    'settings.clearDataTitle': '移入回收站并重置默认目录结构',
    'settings.clearDataDesc': '调用 shell.trashItem 将现有媒体文件移入回收站并恢复初始默认目录',
    'settings.clearDataBtn': '重置数据',
    'settings.cancel': '取消',
    'settings.confirmClearBtn': '确认移入回收站',

    // HelpModal
    'help.title': 'PrismDesk 桌面媒体库 · 核心特性与打包指南',
    'help.f1Title': 'Node.js fs 真实物理磁盘同步 & 永久封面',
    'help.f1Desc': '所有媒体目录与子文件夹直接对应电脑硬盘上的真实目录。自定义文件夹封面会自动生成 .prism_meta.json，重启永不丢失。',
    'help.f2Title': '批量防卡顿导入 & 系统回收站安全删除',
    'help.f2Desc': '采用 fs:batchImport 分块异步写入；删除操作通过 shell.trashItem 安全移入 Windows 系统回收站，随时可后悔还原。',
    'help.f3Title': '媒体卡片自定义右键菜单',
    'help.f3Desc': '右键点击任意图片或视频卡片，即可直接执行物理文件重命名、复制本地路径、跨媒体目录移动或移入回收站。',
    'help.f4Title': '动态媒体目录与昼夜双主题',
    'help.f4Desc': '支持在左侧栏自由新增、右键重命名或删除媒体目录；顶栏支持一键切换白天与黑夜模式。',
    'help.f5Title': '一键打包 Windows 桌面 EXE',
    'help.f5Desc': '下载工程后在终端执行 npm run build:exe 即可生成 Windows 安装包。',
    'help.gotIt': '知道了',

    // LockScreen
    'lock.brandTitle': '创意视觉空间 · PrismDesk',
    'lock.firstSetupSub': '首次启动：请设置开启软件的独立密码',
    'lock.unlockSub': '请输入访问密码以解锁本地私密媒体库',
    'lock.initialPwdHint': '初始密码 123456',
    'lock.setNewPwdPlaceholder': '设置新密码 (例如：123456)',
    'lock.confirmNewPwdPlaceholder': '再次确认新密码',
    'lock.hintPlaceholder': '密码提示 (选填，防遗忘)',
    'lock.saveAndEnter': '保存密码并进入软件',
    'lock.enterPwdPlaceholder': '输入软件密码...',
    'lock.hidePwd': '隐藏密码',
    'lock.showPwd': '显示密码',
    'lock.unlockBtnTitle': '解锁进入',
    'lock.hintPrefix': '提示：{hint}',
    'lock.showHint': '显示密码提示',
    'lock.protectionEnabled': '高强度密码防护已启用',
    'lock.forgotPwd': '忘记密码？',
    'lock.confirmResetPwd': '确认重置',
    'lock.errWrongPwd': '密码输入不正确，请重新输入',
    'lock.errAttemptsLeft': '密码错误，连续输错 5 次将锁定 30 秒（剩余 {left} 次机会）',
    'lock.lockoutTitle': '密码连续输错 5 次，已触发安全保护锁定',
    'lock.lockoutDesc': '请在 {seconds} 秒后再试（可在解锁后进入设置页修改密码）',
    'lock.errPleaseSetPwd': '请设置访问密码',
    'lock.errPwdMismatch': '两次输入的密码不一致，请核对',
    'lock.footer': 'Windows 桌面工作站安全机制 · PrismDesk Media Vault',

    // Toast Messages
    'toast.langSwitched': '已切换为简体中文界面',
    'toast.themeLight': '已切换至白天模式 (天蓝/纯白)',
    'toast.themeDark': '已切换至黑夜模式 (深邃暗夜)',
    'toast.rootBound': '已绑定物理根目录：{path}',
    'toast.rootInitFailed': '初始化物理目录失败',
    'toast.rootChanged': '物理根目录已切换至：{path}',
    'toast.openedInExplorer': '已在 Windows 资源管理器中打开：{path}',
    'toast.copiedPathFallback': '本地物理路径已复制 ({path})，桌面 EXE 版将直接唤起资源管理器',
    'toast.categoryCreated': '已新建媒体目录「{name}」并同步创建本地文件夹',
    'toast.categoryRenamed': '媒体目录已重命名为「{name}」',
    'toast.categoryDeleted': '媒体目录「{name}」已安全移入系统回收站',
    'toast.folderSaved': '物理文件夹「{name}」及封面配置 (.prism_meta.json) 已保存',
    'toast.folderDeleted': '文件夹「{name}」已安全移入系统回收站',
    'toast.mediaImported': '已通过流式队列通道导入 {count} 个素材文件',
    'toast.mediaDropped': '已批量拖入并流式复制 {count} 个文件至「{folder}」',
    'toast.mediaDeleted': '已将「{name}」安全移入系统回收站',
    'toast.batchDeleted': '已将 {count} 个文件批量移入系统回收站',
    'toast.mediaRenamed': '文件已重命名为「{name}」',
    'toast.mediaMoved': '已将「{name}」物理移动至「{target}」',
    'toast.copiedToSystem': '已复制本地路径：{path}',
    'toast.pastedItems': '已批量粘贴 {count} 个文件副本至当前文件夹',
    'toast.clipboardCleared': '已清空应用内剪贴板',
    'toast.coverSet': '已将「{name}」永久写入 .prism_meta.json 设为文件夹封面',
    'toast.pwdSet': '密码设置成功！',
    'toast.pwdCleared': '已取消密码保护',
    'toast.unlocked': '欢迎回来！工作区已解锁',
    'toast.demoLoaded': '物理演示素材与 .prism_meta.json 封面已生成！',
    'toast.dataCleared': '原素材已移入回收站并恢复初始默认目录',
    'toast.refreshed': '已通过 IPC 重新扫描并同步当前物理目录',
    'toast.autoSynced': '检测到外部磁盘文件变更，已自动热加载同步',
  },

  en: {
    // Document & App Branding
    'app.docTitle': 'PrismDesk Media Vault - Creative Design & Video Asset Center',
    'app.name': 'PrismDesk',
    'app.editionBadge': 'Local FS Sync Edition',

    // TitleBar
    'titlebar.searchPlaceholder': 'Global search all physical images, videos or tags across vault (Ctrl + F)...',
    'titlebar.clearSearch': 'Clear search',
    'titlebar.localFolder': 'Local Root',
    'titlebar.localFolderTitle': 'Open physical root directory in File Explorer: {path}',
    'titlebar.lock': 'Lock',
    'titlebar.lockTitleSet': 'Lock application immediately (password required to unlock)',
    'titlebar.lockTitleUnset': 'Set protection password and lock screen',
    'titlebar.themeLightTitle': 'Switch to Dark Mode',
    'titlebar.themeDarkTitle': 'Switch to Light Mode',
    'titlebar.langSwitchTitle': '切换语言为简体中文 (Switch Language)',
    'titlebar.settingsTitle': 'Local physical directory & security settings',
    'titlebar.minimize': 'Minimize window',
    'titlebar.maximize': 'Maximize / Restore window',
    'titlebar.close': 'Close application',

    // Sidebar (Dynamic Media Directories & Tree-View Subfolders)
    'sidebar.sectionsHeader': 'Media Directories',
    'sidebar.addCategoryBtn': '+ New',
    'sidebar.addCategoryTitle': 'Create a new custom media directory',
    'sidebar.rightClickHint': 'Click to expand subfolder tree · Right-click to rename or delete',
    'sidebar.treeExpand': 'Expand subfolders',
    'sidebar.treeCollapse': 'Collapse subfolders',
    'sidebar.noSubfolders': 'No subfolders yet',
    'sidebar.newSubfolderHere': '+ New Subfolder',
    'sidebar.ctxRename': 'Rename',
    'sidebar.ctxDelete': 'Delete',
    'sidebar.folderCountUnit': '{count} fld',
    'sidebar.folderCountTitle': '{count} physical folders',
    'sidebar.itemCountUnit': '{count} items',
    'sidebar.itemCountTitle': '{count} media files',
    'sidebar.storageTitle': 'Click to open local physical root directory in Windows Explorer:\n{path}',
    'sidebar.storageLabel': 'Local Disk Cache',
    'sidebar.storageUnset': 'Click to configure root path',
    'sidebar.openExplorer': 'Open Dir →',
    'sidebar.passwordEnabled': 'Password Protected',
    'sidebar.passwordDisabled': 'No Launch Password',
    'sidebar.lockNow': 'Lock Now',

    // Global Search Results View
    'globalSearch.title': 'Global Search Results for "{query}"',
    'globalSearch.subtitle': 'Real-time search across all media directories & subfolders · {mediaCount} media items, {folderCount} subfolders matched',
    'globalSearch.clearBtn': 'Exit Global Search',
    'globalSearch.matchedFolders': 'Matched Subfolders ({count})',
    'globalSearch.matchedMedia': 'Matched Images & Videos ({count})',
    'globalSearch.emptyTitle': 'No Media or Subfolders Found for "{query}"',
    'globalSearch.emptyDesc': 'Try a different keyword or click Exit Global Search to return to your folder view.',
    'globalSearch.locateFolder': 'Location: {section} / {folder}',

    // Category Create / Rename / Delete Modals
    'categoryModal.createTitle': 'New Media Directory',
    'categoryModal.renameTitle': 'Rename Media Directory',
    'categoryModal.subtitle': 'Saved in .prism_categories.json and synced with local disk folder',
    'categoryModal.nameLabel': 'Directory Name',
    'categoryModal.namePlaceholder': 'e.g. 3D Render Assets, Audio & SFX References',
    'categoryModal.descLabel': 'Description (Optional)',
    'categoryModal.descPlaceholder': 'Brief description of assets stored in this directory',
    'categoryModal.cancel': 'Cancel',
    'categoryModal.confirmCreate': 'Create Directory',
    'categoryModal.confirmRename': 'Save Changes',
    'deleteCategoryModal.title': 'Delete media directory "{name}"?',
    'deleteCategoryModal.desc': 'This safely moves the corresponding physical folder to the system Recycle Bin via shell.trashItem (restorable anytime).',
    'deleteCategoryModal.cancel': 'Cancel',
    'deleteCategoryModal.confirm': 'Move to Recycle Bin',

    // MediaCard Custom Context Menu & Rename / Move Modals
    'mediaCtx.rename': 'Rename',
    'mediaCtx.copy': 'Copy (Local Path)',
    'mediaCtx.moveTo': 'Move to...',
    'mediaCtx.delete': 'Delete (Recycle Bin)',
    'mediaCtx.setCover': 'Set as Folder Cover',
    'mediaCtx.openLightbox': 'Fullscreen Preview',
    'mediaRenameModal.title': 'Rename Media File',
    'mediaRenameModal.subtitle': 'Synchronously renames the physical file on your hard drive via fs.renameSync',
    'mediaRenameModal.label': 'New File Name',
    'mediaRenameModal.cancel': 'Cancel',
    'mediaRenameModal.confirm': 'Rename File',
    'mediaMoveModal.title': 'Move File to Another Media Directory',
    'mediaMoveModal.subtitle': 'Moving "{name}" · Choose destination directory & subfolder (synced via fs.rename)',
    'mediaMoveModal.selectCategory': '1. Select Destination Media Directory',
    'mediaMoveModal.selectSubfolder': '2. Select Destination Subfolder',
    'mediaMoveModal.autoCreateDefault': 'Move to "Default Assets" subfolder',
    'mediaMoveModal.currentLocationBadge': 'Current',
    'mediaMoveModal.cancel': 'Cancel',
    'mediaMoveModal.confirm': 'Move Physical File',

    // BreadcrumbBar
    'breadcrumb.clipboardPending': 'Clipboard Ready ({count})',
    'breadcrumb.pasteCopy': 'Paste Physical Copy',
    'breadcrumb.clearClipboardTitle': 'Clear clipboard',
    'breadcrumb.cancel': 'Cancel',
    'breadcrumb.selectAll': 'Select All',
    'breadcrumb.selectedCount': '{count} Selected',
    'breadcrumb.selectAllTitle': 'Select all media items',
    'breadcrumb.deselectAllTitle': 'Deselect all',
    'breadcrumb.batchDelete': 'Trash Selected',
    'breadcrumb.batchDeleteTitle': 'Safely move selected source files to system Recycle Bin (shell.trashItem)',
    'breadcrumb.sortLabel': 'Sort:',
    'breadcrumb.sortTitle': 'Sort media files inside folder (by Name, Date, or Size asc/desc)',
    'breadcrumb.sort.dateDesc': 'Date: Newest First (↓)',
    'breadcrumb.sort.dateAsc': 'Date: Oldest First (↑)',
    'breadcrumb.sort.nameAsc': 'Name: A → Z (↑)',
    'breadcrumb.sort.nameDesc': 'Name: Z → A (↓)',
    'breadcrumb.sort.sizeDesc': 'Size: Largest First (↓)',
    'breadcrumb.sort.sizeAsc': 'Size: Smallest First (↑)',
    'breadcrumb.view.compact': 'Compact',
    'breadcrumb.view.compactTitle': 'Compact grid',
    'breadcrumb.view.normal': 'Standard',
    'breadcrumb.view.normalTitle': 'Standard grid',
    'breadcrumb.view.spacious': 'Large',
    'breadcrumb.view.spaciousTitle': 'Large preview grid',
    'breadcrumb.newFolder': 'New Folder',
    'breadcrumb.newFolderTitle': 'Create a new physical subfolder in current directory',
    'breadcrumb.refresh': 'Refresh',
    'breadcrumb.refreshTitle': 'Re-scan physical files in current directory via IPC and update UI immediately (fs.watch hot-reload active)',
    'breadcrumb.importMedia': 'Import Media',
    'breadcrumb.importMediaTitle': 'Batch stream import images & videos into this local folder',
    'breadcrumb.backUpper': 'Up One Level',
    'breadcrumb.backUpperTitle': 'Return to upper folder list (Shortcut: Esc or Backspace)',

    // Main Workspace Banner & Empty States
    'workspace.folderItemCount': '{count} media files in current physical directory',
    'workspace.sectionFolderCount': '{count} physical subfolders in current directory',
    'workspace.hoverHint': 'Right-click cards to Rename / Move / Copy Path · Smooth hover zoom',
    'workspace.dragOverlayTitle': 'Release mouse to stream-copy files via zero-memory queue (fs.copyFile)',
    'workspace.dragOverlayTarget': 'Target Location: {target}',
    'workspace.autoArchive': 'Auto Archive',
    'workspace.defaultDropFolderSuffix': '_Default',
    'workspace.defaultDropFolderDesc': 'Auto-created via drag & drop',
    'workspace.emptyFoldersTitle': 'No Subfolders in This Media Directory',
    'workspace.emptyFoldersDesc': 'Create a subfolder to organize {section}. All folders and custom covers (.prism_meta.json) sync directly to your local disk.',
    'workspace.createFirstFolder': 'Create First Subfolder',
    'workspace.loadDemoPackBtn': 'Generate Demo Asset Pack',
    'workspace.emptyMediaTitle': 'No Image or Video Assets in This Folder',
    'workspace.emptyMediaDesc': 'Drag & drop files directly from Windows Desktop into this window, or click below to batch import local files.',
    'workspace.importNowBtn': 'Import Media Now',
    'workspace.pasteClipboardBtn': 'Paste Clipboard ({count} items)',
    'workspace.batchProcessing': 'Processing batch file operation asynchronously...',
    'workspace.importingProgress': 'Importing ({current}/{total})',
    'workspace.importingDetail': 'Zero-memory OS stream copying (Controlled concurrency queue)',

    // FolderCard
    'folderCard.noCover': 'No Custom Cover Set',
    'folderCard.changeCoverBtn': 'Cover',
    'folderCard.changeCoverTitle': 'Change custom folder cover image',
    'folderCard.moreActionsTitle': 'More folder actions',
    'folderCard.menuSetCover': 'Set Cover',
    'folderCard.menuEdit': 'Rename / Edit',
    'folderCard.menuDelete': 'Delete (Recycle Bin)',
    'folderCard.itemCountBadge': '{count} items',
    'folderCard.noDescription': 'No description provided',
    'folderCard.enterFolder': 'Open Folder →',

    // MediaCard
    'mediaCard.selectTitle': 'Select this file',
    'mediaCard.lightboxTitle': 'Double-click or click to view fullscreen',
    'mediaCard.copyTitle': 'Copy local file path (Right-click card for full menu)',
    'mediaCard.setCoverTitle': 'Set as cover for this folder',
    'mediaCard.deleteTitle': 'Safely move to Recycle Bin (shell.trashItem)',
    'mediaCard.deleteConfirmTitle': 'Click again to move to Recycle Bin',
    'mediaCard.deleteConfirmText': 'Confirm',
    'mediaCard.mutedPreviewBadge': 'Muted Preview Playing',
    'mediaCard.hdFormat': 'HD Format',
    'mediaCard.videoBadge': 'Video',

    // First-Launch Root Setup Modal & Delete Folder Modal
    'setupModal.title': 'Welcome to PrismDesk · Select Local Vault Root Directory',
    'setupModal.subtitle': 'Choose a physical folder on your computer. Node.js fs will automatically create your media directories.',
    'setupModal.label': 'Local Physical Root Directory Path',
    'setupModal.placeholder': 'e.g. D:\\PrismDeskVault',
    'setupModal.browse': 'Browse...',
    'setupModal.descPrefix': 'Default media directories created automatically: ',
    'setupModal.descSections': 'Raw Materials, Finished Works, Upscaled Images, Video Assets, Generated Videos, Final Deliverables',
    'setupModal.descSuffix': '. You can add, rename, or delete directories anytime in the sidebar.',
    'setupModal.creating': 'Creating Physical Directories...',
    'setupModal.confirm': 'Confirm & Initialize Vault',
    'deleteFolderModal.title': 'Move subfolder "{name}" to Recycle Bin?',
    'deleteFolderModal.desc': 'This invokes shell.trashItem to safely move this folder and its files into the system Recycle Bin.',
    'deleteFolderModal.cancel': 'Cancel',
    'deleteFolderModal.confirm': 'Move to Recycle Bin',

    // UploadModal
    'uploadModal.title': 'Stream Batch Import to "{name}"',
    'uploadModal.subtitle': 'Uses physical file.path + main-process stream queue for zero-memory 700MB+ video & 30+ batch imports',
    'uploadModal.dropTitle': 'Click to select files, or drag & drop directly from Windows Desktop',
    'uploadModal.dropSubtitle': 'Supports JPG / PNG / WEBP / GIF & MP4 / WEBM / MOV · Zero-memory OS stream copy',
    'uploadModal.nativePickerBtn': 'Open Native System File Picker (Recommended for Large Videos)',
    'uploadModal.streamingBadge': 'Stream Direct',
    'uploadModal.pendingCount': 'Files queued for stream copy ({count})',
    'uploadModal.clearList': 'Clear List',
    'uploadModal.cancel': 'Cancel',
    'uploadModal.processing': 'Stream Copying...',
    'uploadModal.confirm': 'Stream Import ({count} items)',
    'uploadModal.errorDefault': 'Failed to write to local physical disk. Please try again.',

    // FolderModal
    'folderModal.editTitle': 'Edit Physical Folder & Cover Config',
    'folderModal.newTitle': 'Create Local Physical Subfolder',
    'folderModal.subtitle': 'Directory: {section} · Cover is permanently saved in .prism_meta.json',
    'folderModal.nameLabel': 'Physical Folder Name',
    'folderModal.namePlaceholder': 'e.g. 2026 Key Visual References, Highlight Shots',
    'folderModal.descLabel': 'Folder Notes / Description (Optional, saved in .prism_meta.json)',
    'folderModal.descPlaceholder': 'Brief notes about asset specs or project context',
    'folderModal.coverLabel': 'Custom Permanent Folder Cover Image',
    'folderModal.clearCover': 'Clear Cover',
    'folderModal.noCoverSpecified': 'No custom cover set (defaults to first image or folder icon)',
    'folderModal.tabUpload': 'Upload Local Cover',
    'folderModal.tabSelect': 'Pick from Library',
    'folderModal.tabUrl': 'Image URL',
    'folderModal.uploadBtn': 'Select a local image and permanently save to this folder',
    'folderModal.noMediaToSelect': 'No images available in library yet. Upload first or choose another tab.',
    'folderModal.cancel': 'Cancel',
    'folderModal.saving': 'Saving...',
    'folderModal.save': 'Save Folder',

    // LightboxModal
    'lightbox.zoomOut': 'Zoom Out',
    'lightbox.zoomIn': 'Zoom In',
    'lightbox.rotate': 'Rotate 90°',
    'lightbox.copy': 'Copy Path',
    'lightbox.copied': 'Copied',
    'lightbox.copyTitle': 'Copy local path to system clipboard',
    'lightbox.download': 'Download',
    'lightbox.downloadTitle': 'Download source media file',
    'lightbox.closeTitle': 'Close (Esc)',
    'lightbox.prevTitle': 'Previous (← Left Arrow)',
    'lightbox.nextTitle': 'Next (→ Right Arrow)',
    'lightbox.resolution': 'Resolution: {value}',
    'lightbox.size': 'Size: {value}',
    'lightbox.formatVideo': 'Format: MP4 / Video',
    'lightbox.formatImage': 'Format: JPG / PNG / Image',
    'lightbox.shortcutHint': 'Tip: Use ← → arrows to navigate, buttons to zoom/rotate, Esc to exit',

    // SettingsModal
    'settings.title': 'Local Physical Root & Security Settings',
    'settings.rootSectionTitle': 'Local Vault Physical Root Directory (Node.js fs)',
    'settings.openInExplorer': 'Open in File Explorer',
    'settings.rootDesc': 'All media directories, source files, and custom cover configs (.prism_meta.json) are stored in this physical directory.',
    'settings.browse': 'Browse...',
    'settings.applying': 'Applying...',
    'settings.applyRoot': 'Apply Path',
    'settings.rootUpdateSuccess': 'Physical root directory updated successfully!',
    'settings.rootUpdateError': 'Unable to create or access that path. Check disk permissions.',
    'settings.changePwdTitle': 'Change Access Password',
    'settings.setPwdTitle': 'Set Access Password',
    'settings.oldPwdLabel': 'Current Password',
    'settings.oldPwdConfirmHint': '(Enter password then click Disable Protection below)',
    'settings.oldPwdPlaceholder': 'Enter current password',
    'settings.newPwdLabel': 'New Password',
    'settings.newPwdPlaceholder': 'Enter new security password',
    'settings.hintLabel': 'Password Hint (Optional)',
    'settings.hintPlaceholder': 'e.g. Last 4 digits of birthday',
    'settings.disablePwd': 'Disable Password Protection',
    'settings.savingPwd': 'Updating...',
    'settings.savePwd': 'Save Password',
    'settings.errWrongOldPwd': 'Current password is incorrect',
    'settings.errEmptyNewPwd': 'New password cannot be empty',
    'settings.pwdUpdatedSuccess': 'Password updated successfully!',
    'settings.pwdUpdateFailed': 'Failed to update password. Please try again.',
    'settings.errEnterOldToDisable': 'Please enter your current password above first to confirm disabling protection',
    'settings.pwdDisabledSuccess': 'Password protection disabled. App will open directly on launch.',
    'settings.dataManagementTitle': 'Physical Data Management & Demo Assets',
    'settings.demoPackTitle': 'Generate Curated Physical Demo Asset Pack',
    'settings.demoPackDesc': 'Writes sample HD visuals and .prism_meta.json covers across media directories',
    'settings.demoPackBtn': 'Generate Demo',
    'settings.clearDataTitle': 'Move All Assets to Recycle Bin & Reset Default Structure',
    'settings.clearDataDesc': 'Uses shell.trashItem to safely move media files to Recycle Bin and restore default folders',
    'settings.clearDataBtn': 'Reset Data',
    'settings.cancel': 'Cancel',
    'settings.confirmClearBtn': 'Confirm Move to Trash',

    // HelpModal
    'help.title': 'PrismDesk Media Vault · Core Features & Packaging Guide',
    'help.f1Title': 'Node.js fs Real Physical Sync & Permanent Covers',
    'help.f1Desc': 'All media directories and subfolders map directly to physical folders on disk. Custom covers are persisted in .prism_meta.json.',
    'help.f2Title': 'Lag-Free Batch Import & Recycle Bin Protection',
    'help.f2Desc': 'Uses chunked async fs:batchImport for high-volume imports, and shell.trashItem to safely move deleted files to the system Recycle Bin.',
    'help.f3Title': 'Custom Right-Click Context Menu on Cards',
    'help.f3Desc': 'Right-click any image or video card to rename the physical file, copy its local path, move it across directories, or send it to the Recycle Bin.',
    'help.f4Title': 'Dynamic Media Directories & Dark/Light Mode',
    'help.f4Desc': 'Freely add, right-click rename, or delete media directories in the sidebar; toggle Dark/Light Mode in the top title bar.',
    'help.f5Title': 'One-Click Windows EXE Packaging',
    'help.f5Desc': 'Run npm run build:exe in your terminal to package the Windows desktop installer.',
    'help.gotIt': 'Got It',

    // LockScreen
    'lock.brandTitle': 'Creative Visual Workspace · PrismDesk',
    'lock.firstSetupSub': 'First Launch: Set a standalone password to protect your vault',
    'lock.unlockSub': 'Enter your access password to unlock the private media vault',
    'lock.initialPwdHint': 'Initial password: 123456',
    'lock.setNewPwdPlaceholder': 'Set new password (e.g. 123456)',
    'lock.confirmNewPwdPlaceholder': 'Confirm new password',
    'lock.hintPlaceholder': 'Password hint (optional)',
    'lock.saveAndEnter': 'Save Password & Enter',
    'lock.enterPwdPlaceholder': 'Enter password...',
    'lock.hidePwd': 'Hide password',
    'lock.showPwd': 'Show password',
    'lock.unlockBtnTitle': 'Unlock workspace',
    'lock.hintPrefix': 'Hint: {hint}',
    'lock.showHint': 'Show password hint',
    'lock.protectionEnabled': 'High-Strength Protection Active',
    'lock.forgotPwd': 'Forgot Password?',
    'lock.confirmResetPwd': 'Confirm Reset',
    'lock.errWrongPwd': 'Incorrect password, please try again',
    'lock.errAttemptsLeft': 'Incorrect password. 5 failed attempts locks for 30s ({left} attempts left)',
    'lock.lockoutTitle': 'Locked for 30s After 5 Failed Password Attempts',
    'lock.lockoutDesc': 'Please wait {seconds}s before trying again (Change password anytime in Settings)',
    'lock.errPleaseSetPwd': 'Please enter a password',
    'lock.errPwdMismatch': 'Passwords do not match, please verify',
    'lock.footer': 'Windows Desktop Workstation Security · PrismDesk Media Vault',

    // Toast Messages
    'toast.langSwitched': 'Switched to English',
    'toast.themeLight': 'Switched to Light Mode (Sky Blue & White)',
    'toast.themeDark': 'Switched to Dark Mode (Slate Dark)',
    'toast.rootBound': 'Bound physical root directory: {path}',
    'toast.rootInitFailed': 'Failed to initialize physical directory',
    'toast.rootChanged': 'Physical root directory switched to: {path}',
    'toast.openedInExplorer': 'Opened in Windows File Explorer: {path}',
    'toast.copiedPathFallback': 'Physical path copied ({path}). Native EXE opens File Explorer directly.',
    'toast.categoryCreated': 'Created media directory "{name}" on disk',
    'toast.categoryRenamed': 'Renamed media directory to "{name}"',
    'toast.categoryDeleted': 'Moved media directory "{name}" to Recycle Bin',
    'toast.folderSaved': 'Physical folder "{name}" and cover (.prism_meta.json) saved',
    'toast.folderDeleted': 'Moved folder "{name}" to Recycle Bin',
    'toast.mediaImported': 'Stream imported {count} media files via async queue',
    'toast.mediaDropped': 'Batch dropped & stream-copied {count} files into "{folder}"',
    'toast.mediaDeleted': 'Safely moved "{name}" to system Recycle Bin',
    'toast.batchDeleted': 'Safely moved {count} files to system Recycle Bin',
    'toast.mediaRenamed': 'Renamed physical file to "{name}"',
    'toast.mediaMoved': 'Moved "{name}" to "{target}"',
    'toast.copiedToSystem': 'Copied local path: {path}',
    'toast.pastedItems': 'Batch pasted {count} file copies into current folder',
    'toast.clipboardCleared': 'In-app clipboard cleared',
    'toast.coverSet': 'Saved "{name}" into .prism_meta.json as folder cover',
    'toast.pwdSet': 'Password saved successfully!',
    'toast.pwdCleared': 'Password protection disabled',
    'toast.unlocked': 'Welcome back! Workspace unlocked',
    'toast.demoLoaded': 'Generated demo assets & .prism_meta.json covers!',
    'toast.dataCleared': 'Moved existing assets to Recycle Bin and restored default folders',
    'toast.refreshed': 'Re-scanned and synced current physical directory via IPC',
    'toast.autoSynced': 'External disk file change detected · Auto hot-reloaded',
  },
} as const;

export type TranslationKey = keyof typeof UI_DICTIONARY['zh'];

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => Language;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  getSectionText: (section: SectionConfig | SectionId) => {
    name: string;
    subtitle: string;
    description: string;
  };
  getFolderDisplay: (folder: FolderItem) => {
    name: string;
    description: string;
  };
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => getInitialLanguage());

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
    try {
      window.localStorage.setItem(STORAGE_LANG_KEY, nextLang);
    } catch {}
  }, []);

  const toggleLang = useCallback((): Language => {
    const next: Language = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    return next;
  }, [lang, setLang]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = UI_DICTIONARY[lang] || UI_DICTIONARY.zh;
      let template: string = dict[key] || UI_DICTIONARY.zh[key] || key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return template;
    },
    [lang]
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      document.title = UI_DICTIONARY[lang]['app.docTitle'];
    }
  }, [lang]);

  const getSectionText = useCallback(
    (section: SectionConfig | SectionId) => {
      const id = typeof section === 'string' ? section : section.id;
      const builtin = SECTION_TRANSLATIONS[id];

      if (typeof section === 'object') {
        // If builtin and not custom-renamed by user, use localized builtin translation
        if (builtin && (section.name === builtin.zh.name || section.name === builtin.en.name)) {
          return builtin[lang];
        }
        // Custom user category or renamed builtin category
        return {
          name: section.name,
          subtitle: section.dirName || section.enName || section.name,
          description: section.description || '',
        };
      }

      if (builtin) {
        return builtin[lang];
      }

      return {
        name: id,
        subtitle: id,
        description: '',
      };
    },
    [lang]
  );

  const getFolderDisplay = useCallback(
    (folder: FolderItem) => {
      const builtin =
        BUILTIN_FOLDER_TRANSLATIONS[folder.name] ||
        (folder.dirName ? BUILTIN_FOLDER_TRANSLATIONS[folder.dirName] : undefined);

      if (builtin && (folder.name === builtin.zhName || folder.name === builtin.enName)) {
        const displayName = lang === 'en' ? builtin.enName : builtin.zhName;
        const isDefaultDesc =
          !folder.description ||
          folder.description === builtin.zhDesc ||
          folder.description === builtin.enDesc ||
          builtin.altZhDescs?.includes(folder.description);

        const displayDesc = isDefaultDesc
          ? lang === 'en'
            ? builtin.enDesc
            : builtin.zhDesc
          : folder.description || '';

        return { name: displayName, description: displayDesc };
      }

      return {
        name: folder.name,
        description: folder.description || '',
      };
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
      getSectionText,
      getFolderDisplay,
    }),
    [lang, setLang, toggleLang, t, getSectionText, getFolderDisplay]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
