import {
  DEFAULT_BAIDU_PAN_AUTH_BROKER_URL,
  DEFAULT_BAIDU_PAN_REMOTE_PATH,
  DEFAULT_GOOGLE_DRIVE_REMOTE_PATH,
} from "./sync"

export const APP_NAME = "MetisNote"
export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = "zh-CN"

export interface AppMessages {
  meta: {
    title: string
  }
  sidebar: {
    all: string
    favorites: string
    trash: string
    settings: string
  }
  settings: {
    title: string
    sections: {
      general: string
      security: string
      intelligence: string
      templates: string
      sync: string
    }
    general: {
      title: string
      appearance: {
        title: string
        description: string
        system: string
        light: string
        dark: string
      }
      update: {
        title: string
        description: string
        currentVersionLabel: string
        latestVersionLabel: string
        latestVersionUnknown: string
        notChecked: string
        upToDate: string
        updateAvailable: string
        unsupported: string
        checkButton: string
        checkingButton: string
        downloadButton: string
        downloadingButton: string
        openReleaseButton: string
        publishedAt: (value: string) => string
        notices: {
          upToDate: (version: string) => string
          available: (version: string) => string
          downloaded: (fileName: string) => string
          releaseOpened: string
        }
        errors: {
          loadFailed: string
          checkFailed: string
          downloadFailed: string
          releaseOpenFailed: string
          unsupportedPlatform: string
          missingAsset: string
        }
      }
      cards: {
        localFirstTitle: string
        localFirstDescription: string
        languageTitle: string
        languageDescription: string
      }
    }
    security: {
      title: string
      cards: {
        apiKeyTitle: string
        apiKeyDescription: string
        externalLinkTitle: string
        externalLinkDescription: string
      }
    }
    intelligence: {
      title: string
      description: string
      loading: string
      addRemoteModelButton: string
      remoteTitle: string
      remoteDescription: string
      remoteEmptyTitle: string
      remoteEmptyDescription: string
      columns: {
        identifier: string
        configType: string
        actualModelName: string
        enabled: string
        actions: string
      }
      configTypeBuiltin: string
      configTypeCustom: string
      configTypeManagedLocal: string
      enabledBadge: string
      disabledBadge: string
      actions: {
        enable: string
        enabled: string
        useNow: string
        inUse: string
        testConnection: string
        testing: string
        edit: string
        delete: string
      }
      modal: {
        addTitle: string
        editTitle: string
        closeTitle: string
        configurationTypeLabel: string
        providerLabel: string
        protocolLabel: string
        presetModelLabel: string
        actualModelNameLabel: string
        endpointLabel: string
        modelIdentifierLabel: string
        apiKeyLabel: string
        modelIdentifierPlaceholder: string
        actualModelNamePlaceholder: string
        endpointPlaceholder: string
        apiKeyPlaceholder: string
        cancelButton: string
        saveButton: string
        updateButton: string
      }
      notices: {
        created: (identifier: string) => string
        updated: (identifier: string) => string
        enabled: (identifier: string) => string
        deleted: (identifier: string) => string
        testSucceeded: (identifier: string) => string
        localInstalled: (identifier: string) => string
        localRetryStarted: (identifier: string) => string
        localDeleted: (identifier: string) => string
      }
      errors: {
        loadFailed: string
        createFailed: string
        localAddFailed: string
        updateFailed: string
        deleteFailed: string
        enableFailed: string
        testFailed: string
        duplicateIdentifier: (identifier: string) => string
        missingIdentifier: string
        missingProvider: string
        missingPreset: string
        missingProtocol: string
        missingModelName: string
        missingEndpoint: string
        missingApiKey: string
        invalidPreset: string
        modelNotFound: (id: string) => string
        localCatalogNotFound: (id: string) => string
      }
      local: {
        title: string
        recommendedTitle: string
        recommendedDescription: string
        installedTitle: string
        installedDescription: string
        queueTitle: string
        queueDescription: string
        queueEmpty: string
        queuePreparing: (title: string) => string
        progressLabel: string
        runtimeTitle: string
        runtimeIdleTitle: string
        runtimeIdleDescription: string
        runtimeRunningTitle: string
        runtimeRunningDescription: (title: string) => string
        recommendedBadge: string
        defaultBadge: string
        qualityBalanced: string
        qualityHigherQuality: string
        downloadSizeLabel: string
        downloadSourcesTitle: string
        memoryLabel: string
        addAndDownloadButton: string
        retryDownloadButton: string
        useNowButton: string
        inUseButton: string
        installedEmptyTitle: string
        installedEmptyDescription: string
        statuses: {
          notInstalled: string
          preparing: string
          downloading: string
          installing: string
          starting: string
          ready: string
          inUse: string
          attention: string
        }
      }
    }
    templates: {
      title: string
      description: string
      loading: string
      empty: string
      builtInBadge: string
      customBadge: string
      customCategoryFallback: string
      actions: {
        edit: string
        delete: string
      }
      dialog: {
        saveCurrentTitle: string
        editTitle: string
        close: string
        save: string
        cancel: string
      }
      picker: {
        title: string
        create: string
      }
      fields: {
        title: string
        description: string
        category: string
      }
      placeholders: {
        title: string
        description: string
        category: string
      }
      notices: {
        updated: (title: string) => string
        deleted: (title: string) => string
      }
      errors: {
        loadFailed: string
        createFailed: string
        createNoteFailed: string
        notFound: string
        updateFailed: string
        deleteFailed: string
      }
    }
  }
  tree: {
    titleAll: string
    titleFavorites: string
    titleTrash: string
    pinnedTitle: string
    emptyAll: string
    emptyFavorites: string
    emptyTrash: string
    loading: string
    noResults: string
    searchPlaceholder: string
    createButton: string
    importMenuButton: string
    createFromTemplateButton: string
    importButton: string
    countLabel: (count: number) => string
    restoreTitle: string
    deleteForeverTitle: string
    pinTitle: string
    unpinTitle: string
    favoriteTitle: string
    unfavoriteTitle: string
    moveToTrashTitle: string
    syncState: {
      synced: string
      uploadPending: string
      downloadPending: string
      conflict: string
      syncing: string
    }
  }
  editor: {
    unsaved: string
    saving: string
    contentPlaceholder: string
    previewTab: string
    editTab: string
    loading: string
    titlePlaceholder: string
    editButton: string
    updateButton: string
    moreButton: string
    saveAsTemplateAction: string
    exportAction: string
    exportPdfAction: string
    printAction: string
    deleteAction: string
    deleteForeverAction: string
    confirmTitleButton: string
    cancelTitleButton: string
    wordCount: (count: number) => string
    publicVisibility: string
    tagInputPlaceholder: string
    trashedReadonlyNotice: string
    emptyTitle: string
    emptyDescription: string
    createdAt: string
    modifiedAt: string
    formatting: {
      bold: string
      italic: string
      underline: string
      strike: string
      inlineCode: string
      highlight: string
      clearHighlight: string
      more: string
      superscript: string
      subscript: string
      bulletList: string
      orderedList: string
      alignLeft: string
      alignCenter: string
      alignRight: string
    }
    commands: {
      heading1: string
      heading2: string
      heading3: string
      taskList: string
      table: string
      image: string
      file: string
      details: string
      math: string
      toc: string
      codeBlock: string
      blockquote: string
      horizontalRule: string
    }
    commandDescriptions: {
      heading1: string
      heading2: string
      heading3: string
      taskList: string
      table: string
      image: string
      file: string
      details: string
      math: string
      toc: string
      codeBlock: string
      blockquote: string
      horizontalRule: string
    }
    tablePicker: {
      title: string
      description: string
      selectedSize: (rows: number, cols: number) => string
      cancel: string
    }
    tableControls: {
      title: string
      columnMenu: string
      rowMenu: string
      cellMenu: string
      headerMenu: string
      dangerMenu: string
      insertColumnBefore: string
      insertColumnAfter: string
      deleteColumn: string
      enableIndexColumn: string
      disableIndexColumn: string
      insertRowAbove: string
      insertRowBelow: string
      deleteRow: string
      mergeCells: string
      splitCell: string
      toggleHeaderRow: string
      toggleHeaderColumn: string
      deleteTable: string
    }
    commandGroups: {
      ai: string
      links: string
      structure: string
      lists: string
      blocks: string
      navigation: string
    }
    codeBlock: {
      copyLabel: string
      copiedLabel: string
      languageLabel: string
      languagePlaceholder: string
    }
    toc: {
      title: string
      empty: string
      expand: string
      collapse: string
    }
    assets: {
      imageFilterName: string
      invalidImage: string
      imageTooLarge: (limit: string) => string
      fileTooLarge: (limit: string) => string
      noteAssetLimitExceeded: (limit: string) => string
      assetNotFound: string
      importImageFailed: string
      importFileFailed: string
      dropToInsert: string
      openAttachment: string
      previewImage: string
      replaceImage: string
      closeLightbox: string
      removeAsset: string
    }
    aiWrite: {
      slashLabel: string
      slashDescription: string
      disabledHint: string
      promptTitle: string
      promptDescription: string
      promptPlaceholder: string
      promptShortcutHint: string
      promptRequiredError: string
      thinking: string
      writing: string
      generateButton: string
      confirmButton: string
      cancelButton: string
      retryButton: string
      closeButton: string
      requestFailed: string
      noEnabledModelError: string
      remoteTimeoutError: string
      localTimeoutError: string
      emptyResponseError: string
    }
    noteLinks: {
      slashLabel: string
      slashDescription: string
      disabledHint: string
      searchPlaceholder: string
      emptyLabel: string
      deletedTooltip: string
      modifierHint: string
      backlinksSummary: (count: number) => string
      backlinksExpand: string
      backlinksCollapse: string
    }
    versionHistory: {
      button: string
      title: string
      current: string
      currentMeta: (wordCount: number) => string
      preview: string
      restore: string
      close: string
      empty: string
      loading: string
      exitPreview: string
      viewCurrent: string
      previewDescription: string
      previewing: (time: string) => string
      errors: {
        versionNotFound: string
        restoreFailed: string
      }
    }
    focusMode: {
      enter: string
      exit: string
    }
  }
  notes: {
    emptyTitle: string
    defaultPreview: string
    workspacePersonal: string
    workspaceTeam: string
    duplicateTitle: (title: string) => string
    welcome: {
      heading: string
      description: string
      supportedHeading: string
      supportedItems: string[]
      quote: string
    }
    seeds: {
      welcomeTitle: string
      welcomePlainText: string
      welcomeTags: string[]
      roadmapTitle: string
      roadmapPlainText: string
      roadmapBody: string
      roadmapTags: string[]
      planningTitle: string
      planningPlainText: string
      planningBody: string
      planningTags: string[]
    }
  }
  dialogs: {
    importTitle: string
    exportTitle: string
    exportPdfTitle: string
    markdownTextFilterName: string
    markdownFilterName: string
    pdfFilterName: string
    confirmMoveToTrash: (title: string) => string
    confirmDeleteForever: (title: string) => string
  }
  notices: {
    created: string
    createdChild: (title: string) => string
    imported: (title: string) => string
    exported: (path: string) => string
    exportedPdf: (path: string) => string
    duplicated: (title: string) => string
    movedToTrash: (title: string) => string
    restored: (title: string) => string
    deletedForever: (title: string) => string
    createdFromTemplate: (title: string) => string
    templateSaved: (title: string) => string
    versionRestored: (title: string) => string
    printStarted: string
    pinned: string
    unpinned: string
    favorited: string
    unfavorited: string
  }
  errors: {
    loadNoteListFailed: string
    readNoteFailed: string
    saveFailed: string
    createFailed: string
    importFailed: string
    exportFailed: string
    exportPdfFailed: string
    duplicateFailed: string
    moveToTrashFailed: string
    restoreFailed: string
    restoreVersionFailed: string
    deleteForeverFailed: string
    printFailed: string
    toggleFavoriteFailed: string
    togglePinFailed: string
    noteNotFound: (id: string) => string
  }
  sync: {
    title: string
    description: string
    status: {
      idle: string
      syncing: string
      error: string
      conflict: string
      disabled: string
      notConfigured: string
    }
    phase: {
      scanning: string
      comparing: string
      uploading: string
      downloading: string
      merging: string
      finalizing: string
    }
    provider: {
      s3: string
      baiduPan: string
      googleDrive: string
      webdav: string
    }
    providerLabel: string
    providerHint: string
    enabledDescription: string
    groups: {
      connection: string
      credentials: string
      syncSpace: string
      authorization: string
      oauthConfig: string
    }
    s3: {
      description: string
      endpointLabel: string
      endpointPlaceholder: string
      regionLabel: string
      bucketLabel: string
      prefixLabel: string
      accessKeyIdLabel: string
      secretAccessKeyLabel: string
    }
    baiduPan: {
      description: string
      remotePathLabel: string
      accountLabel: string
      directoryDescription: string
      authTitle: string
      authDescription: string
      authorizeAction: string
      reauthorizeAction: string
      authorizingAction: string
      authorizedStatus: string
      unauthorizedStatus: string
      brokerUnavailableError: string
      authorizationRequiredError: string
    }
    googleDrive: {
      description: string
      clientIdLabel: string
      clientIdPlaceholder: string
      remotePathLabel: string
      accountLabel: string
      directoryDescription: string
      authTitle: string
      authDescription: string
      authorizeAction: string
      reauthorizeAction: string
      authorizingAction: string
      authorizedStatus: string
      unauthorizedStatus: string
      clientIdRequiredError: string
      authorizationRequiredError: string
    }
    webdav: {
      description: string
      serverUrlLabel: string
      serverUrlPlaceholder: string
      usernameLabel: string
      usernamePlaceholder: string
      passwordLabel: string
      passwordPlaceholder: string
      remotePathLabel: string
    }
    actions: {
      syncNow: string
      save: string
      enable: string
      disable: string
    }
    conflict: {
      title: string
      keepLocal: string
      keepCloud: string
      keepBoth: string
    }
    encryption: {
      title: string
      description: string
      passphraseLabel: string
      passphrasePlaceholder: string
    }
    result: {
      pushed: (count: number) => string
      pulled: (count: number) => string
      conflicts: (count: number) => string
    }
  }
}

const messages = {
  "zh-CN": {
    meta: {
      title: APP_NAME,
    },
    sidebar: {
      all: "备忘录",
      favorites: "收藏",
      trash: "回收站",
      settings: "设置",
    },
    settings: {
      title: "应用设置",
      sections: {
        general: "通用设置",
        security: "安全设置",
        intelligence: "智能设置",
        templates: "模板",
        sync: "多设备同步",
      },
      general: {
        title: "通用设置",
        appearance: {
          title: "外观模式",
          description: "选择跟随系统、亮色或暗色模式。暗色模式会同步应用到编辑器和代码块主题。",
          system: "跟随系统",
          light: "亮色",
          dark: "暗色",
        },
        update: {
          title: "应用更新",
          description: "从 GitHub Releases 检查并下载适用于当前系统的新版本。下载完成后，应用会打开文件所在位置，按系统方式安装替换即可。",
          currentVersionLabel: "当前版本",
          latestVersionLabel: "最新版本",
          latestVersionUnknown: "尚未获取",
          notChecked: "尚未检查",
          upToDate: "已是最新",
          updateAvailable: "发现新版本",
          unsupported: "当前平台暂不支持在线更新",
          checkButton: "检查更新",
          checkingButton: "检查中...",
          downloadButton: "下载更新包",
          downloadingButton: "下载中...",
          openReleaseButton: "查看发布页",
          publishedAt: (value) => `发布时间：${value}`,
          notices: {
            upToDate: (version) => `当前已经是最新版本：${version}`,
            available: (version) => `检测到新版本：${version}`,
            downloaded: (fileName) => `更新包已下载完成：${fileName}`,
            releaseOpened: "已打开 GitHub 发布页",
          },
          errors: {
            loadFailed: "加载当前版本信息失败",
            checkFailed: "检查更新失败",
            downloadFailed: "下载更新包失败",
            releaseOpenFailed: "打开发布页失败",
            unsupportedPlatform: "当前平台暂不支持在线更新",
            missingAsset: "当前平台没有可用的更新包",
          },
        },
        cards: {
          localFirstTitle: "本地优先工作区",
          localFirstDescription: "笔记和模型配置默认保存在当前设备，本地离线时也可以继续访问和编辑文档。",
          languageTitle: "语言与显示",
          languageDescription: "界面会跟随系统语言自动切换，目前支持简体中文与 English 两种语言。",
        },
      },
      security: {
        title: "安全设置",
        cards: {
          apiKeyTitle: "API 密钥存储",
          apiKeyDescription: "已配置的模型密钥仅保存在当前设备本地，只有在你主动测试连接或后续使用 AI 能力时才会被发送到对应提供商。",
          externalLinkTitle: "外部链接保护",
          externalLinkDescription: "文档里的外部链接会在系统浏览器中打开，避免直接跳转离开笔记工作区。",
        },
      },
      intelligence: {
        title: "智能设置",
        description: "管理一键本地模型和远程模型配置。普通用户只需要选择本地模型并点击一次添加按钮，其余连接细节都由应用托管。",
        loading: "正在加载模型配置...",
        addRemoteModelButton: "添加模型",
        remoteTitle: "模型配置",
        remoteDescription: "本地模型和远程模型统一在这里管理。选择本地模型时，会直接展示对应的下载与运行信息。",
        remoteEmptyTitle: "还没有模型",
        remoteEmptyDescription: "添加一个模型后，后续 AI 能力就可以直接使用该配置。",
        columns: {
          identifier: "模型名称",
          configType: "模型类型",
          actualModelName: "模型信息",
          enabled: "启用",
          actions: "操作",
        },
        configTypeBuiltin: "内置模型",
        configTypeCustom: "自定义模型",
        configTypeManagedLocal: "本地模型",
        enabledBadge: "已启用",
        disabledBadge: "未启用",
        actions: {
          enable: "启用",
          enabled: "已启用",
          useNow: "立即使用",
          inUse: "使用中",
          testConnection: "测试连接",
          testing: "测试中...",
          edit: "编辑",
          delete: "删除",
        },
        modal: {
          addTitle: "添加模型",
          editTitle: "编辑模型",
          closeTitle: "关闭",
          configurationTypeLabel: "配置类型",
          providerLabel: "供应商",
          protocolLabel: "协议",
          presetModelLabel: "选择模型",
          actualModelNameLabel: "实际模型名",
          endpointLabel: "接口地址",
          modelIdentifierLabel: "模型标识",
          apiKeyLabel: "API 密钥",
          modelIdentifierPlaceholder: "请输入模型标识",
          actualModelNamePlaceholder: "请输入实际模型名",
          endpointPlaceholder: "请输入接口地址，例如 https://api.openai.com/v1",
          apiKeyPlaceholder: "请输入 API 密钥",
          cancelButton: "取消",
          saveButton: "保存设置",
          updateButton: "更新设置",
        },
        notices: {
          created: (identifier) => `已添加模型：${identifier}`,
          updated: (identifier) => `已更新模型：${identifier}`,
          enabled: (identifier) => `已启用模型：${identifier}`,
          deleted: (identifier) => `已删除模型：${identifier}`,
          testSucceeded: (identifier) => `模型连接测试成功：${identifier}`,
          localInstalled: (identifier) => `已添加本地模型：${identifier}`,
          localRetryStarted: (identifier) => `已重新开始下载本地模型：${identifier}`,
          localDeleted: (identifier) => `已移除本地模型：${identifier}`,
        },
        errors: {
          loadFailed: "加载模型配置失败",
          createFailed: "添加模型失败",
          localAddFailed: "添加本地模型失败",
          updateFailed: "更新模型失败",
          deleteFailed: "删除模型失败",
          enableFailed: "启用模型失败",
          testFailed: "测试模型连接失败",
          duplicateIdentifier: (identifier) => `模型标识已存在：${identifier}`,
          missingIdentifier: "请输入模型标识",
          missingProvider: "请选择供应商",
          missingPreset: "请选择预设模型",
          missingProtocol: "请选择协议",
          missingModelName: "请输入实际模型名",
          missingEndpoint: "请输入接口地址",
          missingApiKey: "请输入 API 密钥",
          invalidPreset: "当前预设模型无效，请重新选择",
          modelNotFound: (id) => `未找到模型：${id}`,
          localCatalogNotFound: (id) => `未找到可安装的本地模型：${id}`,
        },
        local: {
          title: "本地模型",
          recommendedTitle: "推荐本地模型",
          recommendedDescription: "选择一个推荐模型并点击“添加并下载”，应用会托管后续本地模型配置与切换细节。",
          installedTitle: "已安装模型",
          installedDescription: "这里集中展示当前设备上已经纳入托管的本地模型，并支持一键切换使用。",
          queueTitle: "下载队列",
          queueDescription: "首次添加本地模型后，下载和准备进度会持续显示在这里，不需要再次打开弹窗。",
          queueEmpty: "当前没有本地模型任务。开始添加模型后，下载与准备进度会显示在这里。",
          queuePreparing: (title) => `正在准备 ${title} 的托管配置与下载任务。`,
          progressLabel: "下载进度",
          runtimeTitle: "运行状态",
          runtimeIdleTitle: "尚未启用本地模型",
          runtimeIdleDescription: "选择一个推荐模型并点击“添加并下载”，后续本地模型将由应用统一托管。",
          runtimeRunningTitle: "当前正在使用本地模型",
          runtimeRunningDescription: (title) => `当前活动模型为 ${title}。切换到其他本地模型时，应用会自动接管后续切换流程。`,
          recommendedBadge: "推荐",
          defaultBadge: "默认",
          qualityBalanced: "均衡体验，适合大多数设备",
          qualityHigherQuality: "更高质量，适合资源更充足的设备",
          downloadSizeLabel: "预计下载",
          downloadSourcesTitle: "下载地址",
          memoryLabel: "预计内存",
          addAndDownloadButton: "添加并下载",
          retryDownloadButton: "重新下载",
          useNowButton: "立即使用",
          inUseButton: "使用中",
          installedEmptyTitle: "还没有已安装的本地模型",
          installedEmptyDescription: "从上方推荐模型中选择一个进行添加，后续即可在这里管理和切换。",
          statuses: {
            notInstalled: "未安装",
            preparing: "准备中",
            downloading: "下载中",
            installing: "安装中",
            starting: "启动中",
            ready: "可用",
            inUse: "使用中",
            attention: "需要处理",
          },
        },
      },
      templates: {
        title: "文档模板",
        description: "集中管理内置模板和你保存的自定义模板。新建文档时可以直接从模板创建，保持结构与内容风格一致。",
        loading: "正在加载模板...",
        empty: "还没有可用模板。",
        builtInBadge: "内置",
        customBadge: "自定义",
        customCategoryFallback: "我的模板",
        actions: {
          edit: "编辑",
          delete: "删除",
        },
        dialog: {
          saveCurrentTitle: "保存为模板",
          editTitle: "编辑模板",
          close: "关闭",
          save: "保存",
          cancel: "取消",
        },
        picker: {
          title: "从模板创建文档",
          create: "创建文档",
        },
        fields: {
          title: "模板标题",
          description: "模板描述",
          category: "模板分类",
        },
        placeholders: {
          title: "请输入模板标题",
          description: "简要说明这个模板适合什么场景",
          category: "例如：会议、周报、知识卡片",
        },
        notices: {
          updated: (title) => `已更新模板：${title}`,
          deleted: (title) => `已删除模板：${title}`,
        },
        errors: {
          loadFailed: "加载模板失败",
          createFailed: "保存模板失败",
          createNoteFailed: "从模板创建文档失败",
          notFound: "未找到模板",
          updateFailed: "更新模板失败",
          deleteFailed: "删除模板失败",
        },
      },
    },
    tree: {
      titleAll: "目录",
      titleFavorites: "收藏",
      titleTrash: "回收站",
      pinnedTitle: "置顶",
      emptyAll: "还没有文档，点击右上角创建第一篇。",
      emptyFavorites: "还没有收藏内容，可通过文档节点右侧的菜单加入收藏。",
      emptyTrash: "回收站暂时为空。",
      loading: "正在载入文档树...",
      noResults: "没有找到匹配的文档。",
      searchPlaceholder: "搜索文档...",
      createButton: "添加文档",
      importMenuButton: "导入 / 模板",
      createFromTemplateButton: "从模板创建",
      importButton: "导入 Markdown",
      countLabel: (count) => `${count} 篇文档`,
      restoreTitle: "恢复",
      deleteForeverTitle: "彻底删除",
      pinTitle: "置顶",
      unpinTitle: "取消置顶",
      favoriteTitle: "收藏",
      unfavoriteTitle: "取消收藏",
      moveToTrashTitle: "移入回收站",
      syncState: {
        synced: "已同步",
        uploadPending: "待上传到存储端",
        downloadPending: "待从存储端下载",
        conflict: "存在冲突",
        syncing: "同步中…",
      },
    },
    editor: {
      unsaved: "未保存",
      saving: "正在保存...",
      contentPlaceholder: "开始写今天的想法、会议纪要或待办清单...",
      previewTab: "预览",
      editTab: "编辑",
      loading: "正在载入文档内容...",
      titlePlaceholder: "给这篇笔记起个名字",
      editButton: "编辑",
      updateButton: "保存",
      moreButton: "更多",
      saveAsTemplateAction: "保存为模板",
      exportAction: "导出 Markdown",
      exportPdfAction: "导出 PDF",
      printAction: "打印",
      deleteAction: "删除",
      deleteForeverAction: "彻底删除",
      confirmTitleButton: "确认",
      cancelTitleButton: "取消",
      wordCount: (count) => `${count} 字`,
      publicVisibility: "公开",
      tagInputPlaceholder: "添加标签",
      trashedReadonlyNotice: "这篇笔记目前位于回收站，内容已切换为只读。你可以恢复后继续编辑，或者直接彻底删除。",
      emptyTitle: "选择一篇文档开始",
      emptyDescription: "左侧文档树用于浏览嵌套文档，右侧可以预览或编辑正文内容。",
      createdAt: "创建于",
      modifiedAt: "修改于",
      formatting: {
        bold: "加粗",
        italic: "斜体",
        underline: "下划线",
        strike: "删除线",
        inlineCode: "行内代码",
        highlight: "高亮",
        clearHighlight: "清除高亮",
        more: "更多格式",
        superscript: "上标",
        subscript: "下标",
        bulletList: "无序列表",
        orderedList: "有序列表",
        alignLeft: "左对齐",
        alignCenter: "居中",
        alignRight: "右对齐",
      },
      commands: {
        heading1: "一级标题",
        heading2: "二级标题",
        heading3: "三级标题",
        taskList: "任务清单",
        table: "表格",
        image: "图片",
        file: "附件",
        details: "折叠块",
        math: "数学公式",
        toc: "目录",
        codeBlock: "代码块",
        blockquote: "引用块",
        horizontalRule: "分割线",
      },
      commandDescriptions: {
        heading1: "插入或切换为一级标题",
        heading2: "插入或切换为二级标题",
        heading3: "插入或切换为三级标题",
        taskList: "插入带复选框的任务列表",
        table: "选择行列后插入可编辑表格",
        image: "选择并插入一张图片",
        file: "选择并插入一个附件文件",
        details: "插入可折叠的内容块",
        math: "插入一段行内数学公式",
        toc: "打开目录面板并快速定位标题",
        codeBlock: "插入带语法高亮的代码块",
        blockquote: "插入引用块",
        horizontalRule: "插入内容分割线",
      },
      tablePicker: {
        title: "插入表格",
        description: "移动鼠标选择表格的行列数，点击即可插入。",
        selectedSize: (rows, cols) => `${rows} 行 × ${cols} 列`,
        cancel: "取消",
      },
      tableControls: {
        title: "表格编辑",
        columnMenu: "列",
        rowMenu: "行",
        cellMenu: "单元格",
        headerMenu: "表头",
        dangerMenu: "删除",
        insertColumnBefore: "左侧插入列",
        insertColumnAfter: "右侧插入列",
        deleteColumn: "删除当前列",
        enableIndexColumn: "启用首列序号",
        disableIndexColumn: "关闭首列序号",
        insertRowAbove: "上方插入行",
        insertRowBelow: "下方添加行",
        deleteRow: "删除当前行",
        mergeCells: "合并单元格",
        splitCell: "拆分单元格",
        toggleHeaderRow: "切换表头行",
        toggleHeaderColumn: "切换表头列",
        deleteTable: "删除表格",
      },
      commandGroups: {
        ai: "AI",
        links: "链接",
        structure: "结构",
        lists: "列表",
        blocks: "内容块",
        navigation: "导航",
      },
      codeBlock: {
        copyLabel: "复制代码",
        copiedLabel: "已复制",
        languageLabel: "语言",
        languagePlaceholder: "plaintext",
      },
      toc: {
        title: "目录",
        empty: "还没有可显示的标题",
        expand: "展开",
        collapse: "收起",
      },
      assets: {
        imageFilterName: "图片",
        invalidImage: "无法识别这张图片，请选择 PNG、JPG、GIF、WebP、BMP、SVG 或 AVIF 文件",
        imageTooLarge: (limit) => `单张图片不能超过 ${limit}`,
        fileTooLarge: (limit) => `单个附件不能超过 ${limit}`,
        noteAssetLimitExceeded: (limit) => `这篇笔记的图片和附件总大小不能超过 ${limit}`,
        assetNotFound: "找不到对应的资源文件",
        importImageFailed: "导入图片失败",
        importFileFailed: "导入附件失败",
        dropToInsert: "松手后将图片或附件插入文档",
        openAttachment: "打开附件",
        previewImage: "查看图片",
        replaceImage: "替换图片",
        closeLightbox: "关闭图片预览",
        removeAsset: "删除资源",
      },
      aiWrite: {
        slashLabel: "AI 帮写",
        slashDescription: "AI 根据当前文档上下文继续写作",
        disabledHint: "请先在设置 > 智能设置中配置并启用一个模型",
        promptTitle: "告诉 AI 要写什么",
        promptDescription: "先描述希望 AI 帮你写的具体内容、角度或结构，再开始生成。",
        promptPlaceholder: "例如：补充一段会议结论，强调风险、下一步安排，并保持正式简洁。",
        promptShortcutHint: "按 Cmd/Ctrl + Enter 开始生成",
        promptRequiredError: "请先输入希望 AI 帮写的具体内容",
        thinking: "正在思考…",
        writing: "正在写作…",
        generateButton: "开始生成",
        confirmButton: "确认插入",
        cancelButton: "取消",
        retryButton: "重试",
        closeButton: "关闭",
        requestFailed: "生成失败，请检查模型配置或网络连接",
        noEnabledModelError: "请先在设置 > 智能设置中配置并启用一个模型",
        remoteTimeoutError: "生成超时，请检查模型配置或网络连接后重试",
        localTimeoutError: "本地模型生成超时，请稍后重试",
        emptyResponseError: "模型没有返回可插入的内容，请重试",
      },
      noteLinks: {
        slashLabel: "插入文档链接",
        slashDescription: "在正文中插入指向其他文档的双向链接",
        disabledHint: "没有可链接的其他文档",
        searchPlaceholder: "搜索文档...",
        emptyLabel: "没有匹配的文档",
        deletedTooltip: "文档已删除或位于回收站",
        modifierHint: "按住 Cmd/Ctrl 并点击可打开文档",
        backlinksSummary: (count) => `${count} 篇文档引用了此文档`,
        backlinksExpand: "展开",
        backlinksCollapse: "收起",
      },
      versionHistory: {
        button: "历史版本",
        title: "历史版本",
        current: "当前版本",
        currentMeta: (wordCount) => `${wordCount} 字`,
        preview: "预览中",
        restore: "恢复到此版本",
        close: "关闭",
        empty: "还没有可恢复的历史版本。",
        loading: "正在加载历史版本...",
        exitPreview: "退出预览",
        viewCurrent: "查看当前版本",
        previewDescription: "当前正在查看历史快照内容，编辑区已切换为只读预览。",
        previewing: (time) => `正在预览 ${time} 的历史版本`,
        errors: {
          versionNotFound: "找不到该历史版本",
          restoreFailed: "恢复历史版本失败",
        },
      },
      focusMode: {
        enter: "进入专注模式",
        exit: "退出专注模式",
      },
    },
    notes: {
      emptyTitle: "未命名笔记",
      defaultPreview: "开始记录你的想法...",
      workspacePersonal: "我的桌面",
      workspaceTeam: "团队空间",
      duplicateTitle: (title) => `${title} 副本`,
      welcome: {
        heading: "欢迎来到 MetisNote",
        description: "这是一个本地优先的桌面笔记空间，你可以放心记录灵感、会议纪要、阅读摘要和待办事项。",
        supportedHeading: "这一版已经支持",
        supportedItems: ["标签、置顶、回收站和搜索视图", "富文本编辑、自动保存和本地文件持久化", "Markdown 导入导出与更完整的桌面工作流"],
        quote: "试着把这篇欢迎笔记改成你的第一条记录。",
      },
      seeds: {
        welcomeTitle: "欢迎使用 MetisNote",
        welcomePlainText:
          "欢迎来到 MetisNote 这是一个本地优先的桌面笔记应用 你可以在这里记录灵感 会议纪要 任务清单 并通过标签 置顶和回收站管理你的内容。",
        welcomeTags: ["开始使用", "产品说明"],
        roadmapTitle: "产品路线图",
        roadmapPlainText: "这里可以整理产品目标、阶段方向和长期路线图，让文档树里的上层文档承担目录与主题索引的作用。",
        roadmapBody: "上层文档可以概括主题范围，并把更细分的计划继续放在下层子文档中。",
        roadmapTags: ["规划"],
        planningTitle: "Q2 需求规划",
        planningPlainText: "这是一篇放在路线图下的季度规划文档，你可以在这里继续整理里程碑、需求范围和交付节奏。",
        planningBody: "子文档适合承载更具体的范围说明、迭代安排和执行细节。",
        planningTags: ["规划"],
      },
    },
    dialogs: {
      importTitle: "导入 Markdown 或文本笔记",
      exportTitle: "导出笔记",
      exportPdfTitle: "导出 PDF",
      markdownTextFilterName: "Markdown / Text",
      markdownFilterName: "Markdown",
      pdfFilterName: "PDF",
      confirmMoveToTrash: (title) => `确定把“${title}”移入回收站吗？`,
      confirmDeleteForever: (title) => `确定彻底删除“${title}”吗？此操作不可撤销。`,
    },
    notices: {
      created: "已创建新文档",
      createdChild: (title) => `已在“${title}”下创建子文档`,
      imported: (title) => `已导入 ${title}`,
      exported: (path) => `已导出到 ${path}`,
      exportedPdf: (path) => `已导出 PDF：${path}`,
      duplicated: (title) => `已复制为 ${title}`,
      movedToTrash: (title) => `已移入回收站：${title}`,
      restored: (title) => `已恢复：${title}`,
      deletedForever: (title) => `已彻底删除：${title}`,
      createdFromTemplate: (title) => `已通过模板创建：${title}`,
      templateSaved: (title) => `已保存模板：${title}`,
      versionRestored: (title) => `已恢复历史版本：${title}`,
      printStarted: "已打开打印对话框",
      pinned: "已置顶",
      unpinned: "已取消置顶",
      favorited: "已加入收藏",
      unfavorited: "已取消收藏",
    },
    errors: {
      loadNoteListFailed: "加载文档列表失败",
      readNoteFailed: "读取文档失败",
      saveFailed: "保存失败",
      createFailed: "创建文档失败",
      importFailed: "导入失败",
      exportFailed: "导出失败",
      exportPdfFailed: "导出 PDF 失败",
      duplicateFailed: "复制失败",
      moveToTrashFailed: "移入回收站失败",
      restoreFailed: "恢复失败",
      restoreVersionFailed: "恢复历史版本失败",
      deleteForeverFailed: "彻底删除失败",
      printFailed: "打印失败",
      toggleFavoriteFailed: "收藏操作失败",
      togglePinFailed: "置顶操作失败",
      noteNotFound: (id) => `未找到文档：${id}`,
    },
    sync: {
      title: "多设备同步",
      description: "通过云存储在多台设备之间同步备忘录数据。",
      status: {
        idle: "已同步",
        syncing: "同步中…",
        error: "同步出错",
        conflict: "存在冲突",
        disabled: "同步已关闭",
        notConfigured: "未配置同步",
      },
      phase: {
        scanning: "扫描本地文件…",
        comparing: "比较文件变更…",
        uploading: "上传变更…",
        downloading: "下载变更…",
        merging: "合并数据…",
        finalizing: "完成同步…",
      },
      provider: {
        s3: "S3 兼容存储",
        baiduPan: "百度网盘",
        googleDrive: "Google Drive",
        webdav: "WebDAV",
      },
      providerLabel: "存储类型",
      providerHint: "选择一种同步方式，下面会显示对应的连接与认证配置。",
      enabledDescription: "开启后，当前设备会按照所选方式与其他设备同步数据。",
      groups: {
        connection: "连接信息",
        credentials: "认证信息",
        syncSpace: "同步空间",
        authorization: "授权信息",
        oauthConfig: "OAuth 配置",
      },
      s3: {
        description: "适用于 AWS S3、Cloudflare R2、MinIO 等兼容 S3 接口的对象存储。",
        endpointLabel: "Endpoint",
        endpointPlaceholder: "https://s3.amazonaws.com",
        regionLabel: "Region",
        bucketLabel: "Bucket",
        prefixLabel: "Prefix",
        accessKeyIdLabel: "Access Key ID",
        secretAccessKeyLabel: "Secret Access Key",
      },
      baiduPan: {
        description: "适用于百度网盘应用目录同步，通过授权代理完成网页登录。",
        remotePathLabel: "远程路径",
        accountLabel: "已授权账号",
        directoryDescription: `同步目录固定为 ${DEFAULT_BAIDU_PAN_REMOTE_PATH}。`,
        authTitle: "网页授权",
        authDescription: `点击下方按钮跳转到百度网盘网页端完成登录和授权，成功后会自动返回应用。授权代理服务默认地址为 ${DEFAULT_BAIDU_PAN_AUTH_BROKER_URL}。`,
        authorizeAction: "打开网页授权",
        reauthorizeAction: "重新授权",
        authorizingAction: "等待网页授权…",
        authorizedStatus: "已授权",
        unauthorizedStatus: "未授权",
        brokerUnavailableError: "百度网盘授权代理不可用，请先启动授权代理服务。",
        authorizationRequiredError: "请先完成百度网盘网页授权。",
      },
      googleDrive: {
        description: "适用于 Google Drive 隐藏 appDataFolder，同步时使用桌面端 PKCE 网页授权。",
        clientIdLabel: "OAuth Client ID",
        clientIdPlaceholder: "请输入 Google 桌面应用客户端 ID",
        remotePathLabel: "同步空间",
        accountLabel: "已授权账号",
        directoryDescription: `同步数据保存在 Google Drive appDataFolder 的 ${DEFAULT_GOOGLE_DRIVE_REMOTE_PATH} 命名空间中。`,
        authTitle: "PKCE 网页授权",
        authDescription: "请先在 Google Cloud Console 中启用 Drive API，并创建“桌面应用”类型的 OAuth Client。点击下方按钮后，应用会在系统浏览器中完成登录与 PKCE 授权。",
        authorizeAction: "打开 Google 授权",
        reauthorizeAction: "重新授权",
        authorizingAction: "等待 Google 授权…",
        authorizedStatus: "已授权",
        unauthorizedStatus: "未授权",
        clientIdRequiredError: "请先填写 Google Drive 的 OAuth Client ID。",
        authorizationRequiredError: "请先完成 Google Drive 授权。",
      },
      webdav: {
        description: "适用于坚果云、Nextcloud、群晖等支持 WebDAV 的云盘或私有存储。",
        serverUrlLabel: "服务器地址",
        serverUrlPlaceholder: "https://dav.example.com",
        usernameLabel: "用户名",
        usernamePlaceholder: "请输入用户名",
        passwordLabel: "密码",
        passwordPlaceholder: "请输入密码",
        remotePathLabel: "远程路径",
      },
      actions: {
        syncNow: "立即同步",
        save: "保存",
        enable: "启用同步",
        disable: "关闭同步",
      },
      conflict: {
        title: "文件冲突",
        keepLocal: "保留本地版本",
        keepCloud: "保留云端版本",
        keepBoth: "保留两份",
      },
      encryption: {
        title: "端到端加密",
        description: "设置密码短语，对同步数据进行端到端加密。",
        passphraseLabel: "加密密码",
        passphrasePlaceholder: "输入加密密码…",
      },
      result: {
        pushed: (count) => `上传 ${count} 篇文档`,
        pulled: (count) => `下载 ${count} 篇文档`,
        conflicts: (count) => `${count} 个冲突`,
      },
    },
  },
  en: {
    meta: {
      title: APP_NAME,
    },
    sidebar: {
      all: "Notes",
      favorites: "Favorites",
      trash: "Trash",
      settings: "Settings",
    },
    settings: {
      title: "Application Settings",
      sections: {
        general: "General",
        security: "Security",
        intelligence: "Intelligence",
        templates: "Templates",
        sync: "Multi-device Sync",
      },
    general: {
      title: "General Settings",
      appearance: {
        title: "Appearance",
        description: "Choose system, light, or dark mode. Dark mode also updates the editor and code block theme.",
        system: "System",
        light: "Light",
        dark: "Dark",
      },
      update: {
        title: "Application Updates",
        description: "Check GitHub Releases and download the latest package for the current platform. After the download finishes, the app opens the file location so you can install it with the system workflow.",
        currentVersionLabel: "Current version",
        latestVersionLabel: "Latest version",
        latestVersionUnknown: "Not checked yet",
        notChecked: "Not checked",
        upToDate: "Up to date",
        updateAvailable: "Update available",
        unsupported: "Online updates are not available on this platform",
        checkButton: "Check for updates",
        checkingButton: "Checking...",
        downloadButton: "Download Update",
        downloadingButton: "Downloading...",
        openReleaseButton: "Open Release Page",
        publishedAt: (value) => `Published: ${value}`,
        notices: {
          upToDate: (version) => `This installation is already up to date: ${version}`,
          available: (version) => `New version available: ${version}`,
          downloaded: (fileName) => `Downloaded update package: ${fileName}`,
          releaseOpened: "Opened the GitHub releases page",
        },
        errors: {
          loadFailed: "Failed to load the current version information",
          checkFailed: "Failed to check for updates",
          downloadFailed: "Failed to download the update package",
          releaseOpenFailed: "Failed to open the release page",
          unsupportedPlatform: "Online updates are not available on this platform",
          missingAsset: "No update package is available for this platform",
        },
      },
      cards: {
        localFirstTitle: "Local-first workspace",
        localFirstDescription: "Notes and model configurations stay on this device by default, so your documents remain available even when offline.",
          languageTitle: "Language and display",
          languageDescription: "The interface follows the system language automatically and currently supports Simplified Chinese and English.",
        },
      },
      security: {
        title: "Security Settings",
        cards: {
          apiKeyTitle: "API key storage",
          apiKeyDescription: "Configured model keys are stored locally on this device and are only sent to the provider when you explicitly test a connection or later use AI features.",
          externalLinkTitle: "External link protection",
          externalLinkDescription: "External links inside documents open in the system browser so the note workspace stays isolated.",
        },
      },
      intelligence: {
        title: "Intelligence Settings",
        description: "Manage one-click local models and remote model configurations. Normal users only need to choose a local model once, while the app hides the connection details.",
        loading: "Loading model configurations...",
        addRemoteModelButton: "Add model",
        remoteTitle: "Model Configurations",
        remoteDescription: "Manage local and remote models in one place. Choosing a local model shows its download and runtime details directly.",
        remoteEmptyTitle: "No models yet",
        remoteEmptyDescription: "Add a model so later AI features can use it directly.",
        columns: {
          identifier: "Model Name",
          configType: "Model Type",
          actualModelName: "Model Details",
          enabled: "Enabled",
          actions: "Actions",
        },
        configTypeBuiltin: "Built-in Model",
        configTypeCustom: "Custom Model",
        configTypeManagedLocal: "Local Model",
        enabledBadge: "Enabled",
        disabledBadge: "Disabled",
        actions: {
          enable: "Enable",
          enabled: "Enabled",
          useNow: "Use now",
          inUse: "In use",
          testConnection: "Test connection",
          testing: "Testing...",
          edit: "Edit",
          delete: "Delete",
        },
        modal: {
          addTitle: "Add Model",
          editTitle: "Edit Model",
          closeTitle: "Close",
          configurationTypeLabel: "Configuration Type",
          providerLabel: "Provider",
          protocolLabel: "Protocol",
          presetModelLabel: "Select Model",
          actualModelNameLabel: "Actual Model Name",
          endpointLabel: "Endpoint",
          modelIdentifierLabel: "Model Identifier",
          apiKeyLabel: "API Key",
          modelIdentifierPlaceholder: "Enter a model identifier",
          actualModelNamePlaceholder: "Enter the actual model name",
          endpointPlaceholder: "Enter an endpoint such as https://api.openai.com/v1",
          apiKeyPlaceholder: "Enter an API key",
          cancelButton: "Cancel",
          saveButton: "Save Settings",
          updateButton: "Update Settings",
        },
        notices: {
          created: (identifier) => `Added model: ${identifier}`,
          updated: (identifier) => `Updated model: ${identifier}`,
          enabled: (identifier) => `Enabled model: ${identifier}`,
          deleted: (identifier) => `Deleted model: ${identifier}`,
          testSucceeded: (identifier) => `Connection test succeeded: ${identifier}`,
          localInstalled: (identifier) => `Added local model: ${identifier}`,
          localRetryStarted: (identifier) => `Restarted local model download: ${identifier}`,
          localDeleted: (identifier) => `Removed local model: ${identifier}`,
        },
        errors: {
          loadFailed: "Failed to load model configurations",
          createFailed: "Failed to add model",
          localAddFailed: "Failed to add the local model",
          updateFailed: "Failed to update model",
          deleteFailed: "Failed to delete model",
          enableFailed: "Failed to enable model",
          testFailed: "Failed to test the model connection",
          duplicateIdentifier: (identifier) => `Model identifier already exists: ${identifier}`,
          missingIdentifier: "Please enter a model identifier",
          missingProvider: "Please choose a provider",
          missingPreset: "Please choose a preset model",
          missingProtocol: "Please choose a protocol",
          missingModelName: "Please enter the actual model name",
          missingEndpoint: "Please enter an endpoint",
          missingApiKey: "Please enter an API key",
          invalidPreset: "The selected preset model is invalid. Please choose another preset.",
          modelNotFound: (id) => `Model not found: ${id}`,
          localCatalogNotFound: (id) => `Installable local model not found: ${id}`,
        },
        local: {
          title: "Local Models",
          recommendedTitle: "Recommended Local Models",
          recommendedDescription: "Choose a recommended model and click Add & Download. The app manages the rest of the local model setup and switching flow for you.",
          installedTitle: "Installed Models",
          installedDescription: "This area lists the local models already managed on the current device and lets you switch between them quickly.",
          queueTitle: "Download Queue",
          queueDescription: "After you add a local model for the first time, its download and preparation progress will stay visible here without reopening the dialog.",
          queueEmpty: "There are no local model tasks right now. Once you add a model, its preparation and download progress will appear here.",
          queuePreparing: (title) => `Preparing the managed setup and download task for ${title}.`,
          progressLabel: "Download Progress",
          runtimeTitle: "Runtime Status",
          runtimeIdleTitle: "No local model is active yet",
          runtimeIdleDescription: "Choose a recommended model and click Add & Download. The app will take over the rest of the local setup flow.",
          runtimeRunningTitle: "Local model currently in use",
          runtimeRunningDescription: (title) => `${title} is currently active. When you switch to another local model, the app will handle the transition automatically.`,
          recommendedBadge: "Recommended",
          defaultBadge: "Default",
          qualityBalanced: "Balanced for most devices",
          qualityHigherQuality: "Higher quality for devices with more resources",
          downloadSizeLabel: "Download",
          downloadSourcesTitle: "Download Sources",
          memoryLabel: "Memory",
          addAndDownloadButton: "Add & Download",
          retryDownloadButton: "Retry Download",
          useNowButton: "Use Now",
          inUseButton: "In Use",
          installedEmptyTitle: "No local models installed yet",
          installedEmptyDescription: "Pick one of the recommended models above to add it and manage it here later.",
          statuses: {
            notInstalled: "Not installed",
            preparing: "Preparing",
            downloading: "Downloading",
            installing: "Installing",
            starting: "Starting",
            ready: "Ready",
            inUse: "In use",
            attention: "Attention required",
          },
        },
      },
      templates: {
        title: "Document Templates",
        description: "Manage built-in templates and your own custom templates in one place. New documents can be created directly from a template to keep structure and tone consistent.",
        loading: "Loading templates...",
        empty: "No templates are available yet.",
        builtInBadge: "Built-in",
        customBadge: "Custom",
        customCategoryFallback: "My Templates",
        actions: {
          edit: "Edit",
          delete: "Delete",
        },
        dialog: {
          saveCurrentTitle: "Save as Template",
          editTitle: "Edit Template",
          close: "Close",
          save: "Save",
          cancel: "Cancel",
        },
        picker: {
          title: "Create from Template",
          create: "Create Document",
        },
        fields: {
          title: "Template Title",
          description: "Template Description",
          category: "Template Category",
        },
        placeholders: {
          title: "Enter a template title",
          description: "Briefly describe when to use this template",
          category: "For example: Meetings, Weekly Reviews, Knowledge Cards",
        },
        notices: {
          updated: (title) => `Updated template: ${title}`,
          deleted: (title) => `Deleted template: ${title}`,
        },
        errors: {
          loadFailed: "Failed to load templates",
          createFailed: "Failed to save template",
          createNoteFailed: "Failed to create a document from the template",
          notFound: "Template not found",
          updateFailed: "Failed to update template",
          deleteFailed: "Failed to delete template",
        },
      },
    },
    tree: {
      titleAll: "Directory",
      titleFavorites: "Favorites",
      titleTrash: "Trash",
      pinnedTitle: "Pinned",
      emptyAll: "No documents yet. Create your first one from the top right.",
      emptyFavorites: "No favorites yet. Use the menu on a document node to add it to favorites.",
      emptyTrash: "Trash is empty.",
      loading: "Loading document tree...",
      noResults: "No matching documents found.",
      searchPlaceholder: "Search documents...",
      createButton: "Add Document",
      importMenuButton: "Import / Template",
      createFromTemplateButton: "From Template",
      importButton: "Import Markdown",
      countLabel: (count) => `${count} documents`,
      restoreTitle: "Restore",
      deleteForeverTitle: "Delete permanently",
      pinTitle: "Pin",
      unpinTitle: "Unpin",
      favoriteTitle: "Favorite",
      unfavoriteTitle: "Remove from favorites",
      moveToTrashTitle: "Move to trash",
      syncState: {
        synced: "Synced",
        uploadPending: "Pending upload",
        downloadPending: "Pending download",
        conflict: "Conflicts detected",
        syncing: "Syncing…",
      },
    },
    editor: {
      unsaved: "Unsaved",
      saving: "Saving...",
      contentPlaceholder: "Start writing ideas, meeting notes, or tasks...",
      previewTab: "Preview",
      editTab: "Edit",
      loading: "Loading document content...",
      titlePlaceholder: "Give this note a title",
      editButton: "Edit",
      updateButton: "Save",
      moreButton: "More",
      saveAsTemplateAction: "Save as template",
      exportAction: "Export Markdown",
      exportPdfAction: "Export PDF",
      printAction: "Print",
      deleteAction: "Delete",
      deleteForeverAction: "Delete permanently",
      confirmTitleButton: "Confirm",
      cancelTitleButton: "Cancel",
      wordCount: (count) => `${count} words`,
      publicVisibility: "Public",
      tagInputPlaceholder: "Add tag",
      trashedReadonlyNotice: "This note is currently in the trash and is read-only. Restore it to continue editing, or delete it permanently.",
      emptyTitle: "Select a document to begin",
      emptyDescription: "Use the document tree on the left to browse nested documents, then preview or edit content on the right.",
      createdAt: "Created",
      modifiedAt: "Modified",
      formatting: {
        bold: "Bold",
        italic: "Italic",
        underline: "Underline",
        strike: "Strikethrough",
        inlineCode: "Inline code",
        highlight: "Highlight",
        clearHighlight: "Clear highlight",
        more: "More formats",
        superscript: "Superscript",
        subscript: "Subscript",
        bulletList: "Bullet list",
        orderedList: "Ordered list",
        alignLeft: "Align left",
        alignCenter: "Align center",
        alignRight: "Align right",
      },
      commands: {
        heading1: "Heading 1",
        heading2: "Heading 2",
        heading3: "Heading 3",
        taskList: "Task list",
        table: "Table",
        image: "Image",
        file: "Attachment",
        details: "Details",
        math: "Math",
        toc: "Table of contents",
        codeBlock: "Code block",
        blockquote: "Blockquote",
        horizontalRule: "Divider",
      },
      commandDescriptions: {
        heading1: "Insert or switch to a level-1 heading",
        heading2: "Insert or switch to a level-2 heading",
        heading3: "Insert or switch to a level-3 heading",
        taskList: "Insert a checklist-style task list",
        table: "Choose the size before inserting an editable table",
        image: "Choose and insert an image",
        file: "Choose and insert an attachment",
        details: "Insert a collapsible details block",
        math: "Insert an inline math expression",
        toc: "Open the table of contents panel",
        codeBlock: "Insert a syntax-highlighted code block",
        blockquote: "Insert a blockquote",
        horizontalRule: "Insert a divider line",
      },
      tablePicker: {
        title: "Insert Table",
        description: "Move over the grid to choose rows and columns, then click to insert.",
        selectedSize: (rows, cols) => `${rows} rows × ${cols} columns`,
        cancel: "Cancel",
      },
      tableControls: {
        title: "Table Editing",
        columnMenu: "Columns",
        rowMenu: "Rows",
        cellMenu: "Cells",
        headerMenu: "Headers",
        dangerMenu: "Delete",
        insertColumnBefore: "Insert Column Left",
        insertColumnAfter: "Insert Column Right",
        deleteColumn: "Delete Current Column",
        enableIndexColumn: "Use First Column as Index",
        disableIndexColumn: "Disable First Column Index",
        insertRowAbove: "Insert Row Above",
        insertRowBelow: "Add Row Below",
        deleteRow: "Delete Current Row",
        mergeCells: "Merge Cells",
        splitCell: "Split Cell",
        toggleHeaderRow: "Toggle Header Row",
        toggleHeaderColumn: "Toggle Header Column",
        deleteTable: "Delete Table",
      },
      commandGroups: {
        ai: "AI",
        links: "Links",
        structure: "Structure",
        lists: "Lists",
        blocks: "Blocks",
        navigation: "Navigation",
      },
      codeBlock: {
        copyLabel: "Copy code",
        copiedLabel: "Copied",
        languageLabel: "Language",
        languagePlaceholder: "plaintext",
      },
      toc: {
        title: "Table of contents",
        empty: "No headings yet",
        expand: "Expand",
        collapse: "Collapse",
      },
      assets: {
        imageFilterName: "Images",
        invalidImage: "This image format could not be recognized. Choose a PNG, JPG, GIF, WebP, BMP, SVG, or AVIF file.",
        imageTooLarge: (limit) => `Each image must be smaller than ${limit}.`,
        fileTooLarge: (limit) => `Each attachment must be smaller than ${limit}.`,
        noteAssetLimitExceeded: (limit) => `The combined image and attachment size for one note must stay under ${limit}.`,
        assetNotFound: "The requested asset could not be found.",
        importImageFailed: "Failed to import image.",
        importFileFailed: "Failed to import attachment.",
        dropToInsert: "Release to insert images or attachments.",
        openAttachment: "Open attachment",
        previewImage: "Preview image",
        replaceImage: "Replace image",
        closeLightbox: "Close image preview",
        removeAsset: "Remove asset",
      },
      aiWrite: {
        slashLabel: "AI Write",
        slashDescription: "Continue the document with AI using the current context",
        disabledHint: "Configure and enable a model first in Settings > Intelligence",
        promptTitle: "Tell AI what to write",
        promptDescription: "Describe the specific content, angle, or structure you want before generation starts.",
        promptPlaceholder: "For example: write a concise meeting summary with risks, decisions, and next steps.",
        promptShortcutHint: "Press Cmd/Ctrl + Enter to generate",
        promptRequiredError: "Enter what you want AI to write first.",
        thinking: "Thinking…",
        writing: "Writing…",
        generateButton: "Generate",
        confirmButton: "Insert",
        cancelButton: "Cancel",
        retryButton: "Retry",
        closeButton: "Close",
        requestFailed: "Generation failed. Check the model configuration or network connection and try again.",
        noEnabledModelError: "Configure and enable a model first in Settings > Intelligence",
        remoteTimeoutError: "Generation timed out. Check the model configuration or network connection and try again.",
        localTimeoutError: "The local model took too long to respond. Please try again.",
        emptyResponseError: "The model returned no usable text. Please try again.",
      },
      noteLinks: {
        slashLabel: "Insert document link",
        slashDescription: "Insert a bidirectional link to another document",
        disabledHint: "There are no other documents to link",
        searchPlaceholder: "Search documents...",
        emptyLabel: "No matching documents",
        deletedTooltip: "Document deleted or moved to trash",
        modifierHint: "Cmd/Ctrl+click to open",
        backlinksSummary: (count) => `${count} document${count === 1 ? "" : "s"} link to this document`,
        backlinksExpand: "Expand",
        backlinksCollapse: "Collapse",
      },
      versionHistory: {
        button: "History",
        title: "Version History",
        current: "Current",
        currentMeta: (wordCount) => `${wordCount} words`,
        preview: "Previewing",
        restore: "Restore This Version",
        close: "Close",
        empty: "No restorable versions yet.",
        loading: "Loading version history...",
        exitPreview: "Exit Preview",
        viewCurrent: "View Current Version",
        previewDescription: "You are viewing a historical snapshot. The editor is now in read-only preview mode.",
        previewing: (time) => `Previewing the version from ${time}`,
        errors: {
          versionNotFound: "This version could not be found.",
          restoreFailed: "Failed to restore this version.",
        },
      },
      focusMode: {
        enter: "Enter Focus Mode",
        exit: "Exit Focus Mode",
      },
    },
    notes: {
      emptyTitle: "Untitled note",
      defaultPreview: "Start writing your thoughts...",
      workspacePersonal: "My Space",
      workspaceTeam: "Team Space",
      duplicateTitle: (title) => `${title} Copy`,
      welcome: {
        heading: "Welcome to MetisNote",
        description: "This is a local-first desktop note space where you can safely capture ideas, meeting notes, reading highlights, and tasks.",
        supportedHeading: "This version already supports",
        supportedItems: [
          "Tags, pinning, trash, and search views",
          "Rich text editing, autosave, and local file persistence",
          "Markdown import/export and a more complete desktop workflow",
        ],
        quote: "Try turning this welcome note into your first record.",
      },
      seeds: {
        welcomeTitle: "Welcome to MetisNote",
        welcomePlainText:
          "Welcome to MetisNote. This is a local-first desktop notes app where you can capture ideas, meeting notes, and tasks, then manage them with tags, pinning, and trash.",
        welcomeTags: ["getting-started", "product"],
        roadmapTitle: "Product Roadmap",
        roadmapPlainText:
          "Use this document to organize product goals, phased direction, and the long-term roadmap, while higher-level notes act as thematic indexes in the document tree.",
        roadmapBody: "Higher-level documents can summarize the scope, while more detailed plans can continue in nested child documents.",
        roadmapTags: ["planning"],
        planningTitle: "Q2 Planning",
        planningPlainText:
          "This quarterly planning document sits under the roadmap and can be used to track milestones, scope, and delivery cadence.",
        planningBody: "Child documents are a good place to capture more specific scope definitions, iteration plans, and execution details.",
        planningTags: ["planning"],
      },
    },
    dialogs: {
      importTitle: "Import Markdown or text note",
      exportTitle: "Export note",
      exportPdfTitle: "Export PDF",
      markdownTextFilterName: "Markdown / Text",
      markdownFilterName: "Markdown",
      pdfFilterName: "PDF",
      confirmMoveToTrash: (title) => `Move “${title}” to trash?`,
      confirmDeleteForever: (title) => `Delete “${title}” permanently? This action cannot be undone.`,
    },
    notices: {
      created: "Created a new document",
      createdChild: (title) => `Created a child document under “${title}”`,
      imported: (title) => `Imported ${title}`,
      exported: (path) => `Exported to ${path}`,
      exportedPdf: (path) => `Exported PDF to ${path}`,
      duplicated: (title) => `Duplicated as ${title}`,
      movedToTrash: (title) => `Moved to trash: ${title}`,
      restored: (title) => `Restored: ${title}`,
      deletedForever: (title) => `Deleted permanently: ${title}`,
      createdFromTemplate: (title) => `Created from template: ${title}`,
      templateSaved: (title) => `Saved template: ${title}`,
      versionRestored: (title) => `Restored version for: ${title}`,
      printStarted: "Opened the print dialog",
      pinned: "Pinned to top",
      unpinned: "Unpinned",
      favorited: "Added to favorites",
      unfavorited: "Removed from favorites",
    },
    errors: {
      loadNoteListFailed: "Failed to load document list",
      readNoteFailed: "Failed to read document",
      saveFailed: "Save failed",
      createFailed: "Failed to create document",
      importFailed: "Import failed",
      exportFailed: "Export failed",
      exportPdfFailed: "Failed to export PDF",
      duplicateFailed: "Duplicate failed",
      moveToTrashFailed: "Failed to move document to trash",
      restoreFailed: "Restore failed",
      restoreVersionFailed: "Failed to restore version",
      deleteForeverFailed: "Failed to delete document permanently",
      printFailed: "Failed to print",
      toggleFavoriteFailed: "Favorite action failed",
      togglePinFailed: "Pin action failed",
      noteNotFound: (id) => `Document not found: ${id}`,
    },
    sync: {
      title: "Multi-device Sync",
      description: "Sync your notes across multiple devices using cloud storage.",
      status: {
        idle: "Synced",
        syncing: "Syncing…",
        error: "Sync error",
        conflict: "Conflicts detected",
        disabled: "Sync disabled",
        notConfigured: "Sync not configured",
      },
      phase: {
        scanning: "Scanning local files…",
        comparing: "Comparing changes…",
        uploading: "Uploading changes…",
        downloading: "Downloading changes…",
        merging: "Merging data…",
        finalizing: "Finalizing sync…",
      },
      provider: {
        s3: "S3-compatible storage",
        baiduPan: "Baidu Pan",
        googleDrive: "Google Drive",
        webdav: "WebDAV",
      },
      providerLabel: "Storage type",
      providerHint: "Choose a sync method and the matching connection and auth form will appear below.",
      enabledDescription: "When enabled, this device will sync data with your other devices using the selected method.",
      groups: {
        connection: "Connection",
        credentials: "Credentials",
        syncSpace: "Sync space",
        authorization: "Authorization",
        oauthConfig: "OAuth setup",
      },
      s3: {
        description: "For AWS S3, Cloudflare R2, MinIO, and other S3-compatible object storage services.",
        endpointLabel: "Endpoint",
        endpointPlaceholder: "https://s3.amazonaws.com",
        regionLabel: "Region",
        bucketLabel: "Bucket",
        prefixLabel: "Prefix",
        accessKeyIdLabel: "Access Key ID",
        secretAccessKeyLabel: "Secret Access Key",
      },
      baiduPan: {
        description: "For syncing through the Baidu Pan app directory with a brokered web authorization flow.",
        remotePathLabel: "Remote path",
        accountLabel: "Authorized account",
        directoryDescription: `Syncs into the fixed directory ${DEFAULT_BAIDU_PAN_REMOTE_PATH}.`,
        authTitle: "Web authorization",
        authDescription: `Open the Baidu Pan authorization page in your browser. The app will capture the callback and finish authorization automatically. The broker service defaults to ${DEFAULT_BAIDU_PAN_AUTH_BROKER_URL}.`,
        authorizeAction: "Open authorization page",
        reauthorizeAction: "Authorize again",
        authorizingAction: "Waiting for browser authorization…",
        authorizedStatus: "Authorized",
        unauthorizedStatus: "Not authorized",
        brokerUnavailableError: "The Baidu Pan auth broker is unavailable. Start the broker service first.",
        authorizationRequiredError: "Complete Baidu Pan authorization before saving sync settings.",
      },
      googleDrive: {
        description: "Uses the hidden Google Drive appDataFolder and completes desktop authorization with a PKCE browser flow.",
        clientIdLabel: "OAuth Client ID",
        clientIdPlaceholder: "Enter your Google desktop OAuth client ID",
        remotePathLabel: "Sync space",
        accountLabel: "Authorized account",
        directoryDescription: `Sync data is stored inside the Google Drive appDataFolder namespace ${DEFAULT_GOOGLE_DRIVE_REMOTE_PATH}.`,
        authTitle: "PKCE browser authorization",
        authDescription: "Enable the Drive API in Google Cloud Console and create a Desktop app OAuth client first. The app opens your system browser and completes the PKCE callback locally.",
        authorizeAction: "Open Google authorization",
        reauthorizeAction: "Authorize again",
        authorizingAction: "Waiting for Google authorization…",
        authorizedStatus: "Authorized",
        unauthorizedStatus: "Not authorized",
        clientIdRequiredError: "Enter a Google Drive OAuth client ID before authorizing.",
        authorizationRequiredError: "Complete Google Drive authorization before saving sync settings.",
      },
      webdav: {
        description: "For Nutstore, Nextcloud, Synology, and other storage services that support WebDAV.",
        serverUrlLabel: "Server URL",
        serverUrlPlaceholder: "https://dav.example.com",
        usernameLabel: "Username",
        usernamePlaceholder: "Enter username",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter password",
        remotePathLabel: "Remote path",
      },
      actions: {
        syncNow: "Sync now",
        save: "Save",
        enable: "Enable sync",
        disable: "Disable sync",
      },
      conflict: {
        title: "File conflict",
        keepLocal: "Keep local version",
        keepCloud: "Keep cloud version",
        keepBoth: "Keep both",
      },
      encryption: {
        title: "End-to-end encryption",
        description: "Set a passphrase to encrypt your synced data end-to-end.",
        passphraseLabel: "Encryption passphrase",
        passphrasePlaceholder: "Enter passphrase…",
      },
      result: {
        pushed: (count) => `Uploaded ${count} note(s)`,
        pulled: (count) => `Downloaded ${count} note(s)`,
        conflicts: (count) => `${count} conflict(s)`,
      },
    },
  },
} satisfies Record<AppLocale, AppMessages>

export function resolveLocale(rawLocale?: string | null): AppLocale {
  const normalized = rawLocale?.toLowerCase() ?? ""

  if (normalized.startsWith("en")) {
    return "en"
  }

  return DEFAULT_LOCALE
}

export function getMessages(locale: AppLocale) {
  return messages[locale]
}
