# MetisNote 多端同步 — 开发规划

> 基于 [multi-device-sync.md](multi-device-sync.md) 设计文档，拆解为可执行的开发任务。

---

## 1. 里程碑总览

| 里程碑 | 目标 | 优先级 | 前置依赖 |
|---|---|---|---|
| **M1** 共享类型与接口 | 所有模块的类型定义、接口约定 | P0 | 无 |
| **M2** 本地同步引擎 | ChangeTracker + CommitLog + RemoteView + 本地状态管理 | P0 | M1 |
| **M3** S3 Provider + 端到端集成 | 可与 S3 完成一次完整 push/pull | P0 | M2 |
| **M4** 冲突处理与索引重建 | 笔记冲突副本、templates 合并、index 重建 | P0 | M3 |
| **M5** IPC + 基础 UI | 状态指示器、S3 配置面板、冲突对话框 | P0 | M4 |
| **M6** 百度网盘 Provider | OAuth + 分片上传 + Token 刷新 | P1 | M5 |
| **M7** WebDAV Provider | WebDAV 后端 + 配置 UI | P1 | M5 |
| **M8** 端到端加密 | 双密钥派生、加密/解密层、口令 UI | P1 | M5 |
| **M9** 资源同步 | 完整模式 + 按需下载模式 | P2 | M5 |
| **M10** 性能优化与 GC | 增量扫描、并行传输、快照压缩、commit GC | P2 | M5 |
| **M11** 稳定性与体验 | 重试、网络监听、设备管理、诊断日志 | P2 | M5 |

```
M1 ─► M2 ─► M3 ─► M4 ─► M5 ─┬► M6
                               ├► M7
                               ├► M8
                               ├► M9
                               ├► M10
                               └► M11
```

> M6–M11 之间无强依赖，可根据需求并行推进。

---

## 2. M1：共享类型与接口

**目标：** 定义所有同步模块依赖的 TypeScript 类型和接口，确保后续模块可独立编译。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 1.1 | 定义共享同步类型 | `src/shared/sync.ts` | `SyncConfig`, `SyncStatus`, `SyncProgress`, `SyncPhase`, `SyncResult`, `SyncProviderType`, `BaiduPanConfig`, `S3Config`, `WebDAVConfig`, `EncryptionConfig`, `DeviceRecord`, `SyncConflict` |
| 1.2 | 定义 `CloudStorageProvider` 接口 | `electron/main/services/sync/providers/types.ts` | `CloudStorageProvider`, `UploadOptions`, `RemoteFileInfo`, 错误类（`SyncError`, `SyncAuthError`, `SyncNetworkError`, `SyncFileNotFoundError`, `SyncConcurrencyError`, `SyncQuotaError`） |
| 1.3 | 定义 Commit 日志类型 | `electron/main/services/sync/types.ts` | `CommitManifest`, `CommitOperation`, `CommitCursor`, `CloudSyncState`, `CloudFileEntry`, `LocalSyncState`, `LocalFileEntry`, `FileChange`, `DeviceManifest` |
| 1.4 | 扩展 preload 类型声明 | `src/env.d.ts` | 在 `MetisNoteAPI` 中添加 `sync` 命名空间类型 |

### 验收标准

- `npx tsc --noEmit` 通过
- 所有同步相关类型从 `src/shared/sync.ts` 和 `sync/types.ts` 导出，后续模块可直接引用

---

## 3. M2：本地同步引擎

**目标：** 实现与云端无关的同步核心逻辑——本地变更扫描、三方比较、commit 构建、远端视图物化。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 2.1 | 实现 `ChangeTracker` | `electron/main/services/sync/change-tracker.ts` | `scanLocal()`：遍历 `items/*.json`、`templates.json`、`assets/**`、`versions/**`，计算内容指纹（SHA-256 / HMAC）<br>`computeChanges()`：三方比较算法，输出 `FileChange[]` |
| 2.2 | 实现 `CommitLog` | `electron/main/services/sync/commit-log.ts` | `stageObject()`：内容寻址上传到 `objects/<prefix>/<hash>.bin`<br>`publishCommit()`：构建 `CommitManifest` 并上传到 `commits/<deviceId>/<commitId>.json`<br>`listCommitsAfterCursor()`：列出某个 cursor 之后的所有 commit |
| 2.3 | 实现 `RemoteView` | `electron/main/services/sync/remote-view.ts` | `loadSnapshot()`：下载并解析 `sync-state.json`<br>`materializeRemoteView()`：快照 + commit 按 `(lamport, deviceId, commitId)` 排序回放，输出当前云端文件视图<br>`advanceCursor()`：计算新的 `CommitCursor` |
| 2.4 | 实现本地状态管理 | `electron/main/services/sync/local-state.ts` | `loadLocalState()` / `saveLocalState()`：读写 `.sync/local-state.json`（原子写入 tmp+rename）<br>`loadSyncConfig()` / `saveSyncConfig()`：读写 `.sync/config.json` |
| 2.5 | 实现 `IndexRebuilder` | `electron/main/services/sync/index-rebuilder.ts` | `rebuildIndexFromItems()`：扫描所有 `items/*.json`，提取摘要，清洗层级关系，写入 `index.json`。复用现有 `NoteStore` 的 `normalizeSummary()` / `sanitizeHierarchy()` |
| 2.6 | 单元测试 | `tests/sync/change-tracker.test.ts` 等 | 覆盖三方比较的全部 case：push/pull/conflict/delete-local/delete-remote/noop/两侧相同/新文件/删除+修改冲突 |

### 关键设计决策

- `scanLocal` 首轮实现全量哈希，增量扫描（mtime 优化）推迟到 M10
- `CommitLog.publishCommit()` 接收已扫描的 `FileChange[]`，不自行触发扫描
- `rebuildIndexFromItems()` 需与现有 `NoteStore` 共用 `normalizeSummary()` 逻辑——提取为可复用函数或直接调用 NoteStore 方法

### 验收标准

- 单元测试全部通过
- `ChangeTracker.computeChanges()` 在 mock 数据上正确输出所有变更类型
- `materializeRemoteView()` 正确回放乱序 commit 并保证全局一致排序

---

## 4. M3：S3 Provider + 端到端集成

**目标：** 实现 S3 后端，将 M2 的引擎与真实云端存储连接，完成首次完整同步 push/pull。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 3.1 | 安装依赖 | `package.json` | `npm install @aws-sdk/client-s3` |
| 3.2 | 实现 `S3Provider` | `electron/main/services/sync/providers/s3.ts` | 实现 `CloudStorageProvider` 全部方法：`PutObject`, `GetObject`, `ListObjectsV2`, `DeleteObject`, `DeleteObjects`, `HeadObject`<br>支持 `forcePathStyle` 用于 MinIO<br>支持 `ifMatchHash` 条件写入（S3 有原生条件写入支持） |
| 3.3 | 实现 `SyncManager` 核心流程 | `electron/main/services/sync/sync-manager.ts` | `initialize()`：读配置 → 创建 Provider → 加载本地状态<br>`performSync()`：完整 8 步同步流程<br>`startAutoSync()` / `stopAutoSync()`：定时器管理<br>首次同步场景处理（空云端全量 push / 空本地全量 pull） |
| 3.4 | 首次同步流程 | 同 sync-manager.ts | 新设备加入：检测云端已有 `device-manifest.json` → 全量拉取<br>首个设备：云端为空 → 全量推送 + 初始化云端结构 |
| 3.5 | 集成测试（S3 / MinIO） | `tests/sync/s3-integration.test.ts` | 用 MinIO Docker 容器做本地集成测试：push → pull → 两设备轮流修改 → 验证内容一致 |

### 验收标准

- 配置一个 MinIO 实例，两个模拟设备目录能通过 S3 后端完成双向同步
- 首次空云端推送 + 新设备全量拉取均正常
- 同步完成后 `local-state.json` 与云端 commit 状态一致

---

## 5. M4：冲突处理与索引重建

**目标：** 处理两端同时编辑同一笔记的冲突场景，并确保 `index.json` 始终由 `items/*.json` 正确派生。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 4.1 | 实现 `ConflictResolver` | `electron/main/services/sync/conflict-resolver.ts` | `materializeNoteConflict()`：将云端冲突版本保存为独立笔记（`[冲突副本]` 标题 + `sync-conflict` 标签）<br>`resolveConflict()`：根据用户选择执行 keep-local / keep-cloud / keep-both<br>冲突记录持久化到 `.sync/conflicts/<uuid>.json` |
| 4.2 | templates.json 合并 | 同 conflict-resolver.ts | 按 template ID 去重，`updatedAt` 较新者优先；新模板直接合入 |
| 4.3 | NoteStore 缓存刷新通知 | `electron/main/services/note-store.ts` | 同步下载覆盖 `items/*.json` 后，调用 `NoteStore.reloadFromDisk()` 刷新内存缓存；添加 `reloadFromDisk()` 方法（重新读取 index.json + 重建内存 Map） |
| 4.4 | 冲突场景测试 | `tests/sync/conflict.test.ts` | 覆盖：同一笔记双端修改、一端删除一端修改、templates 合并、冲突解决三种选项 |

### 验收标准

- 两端同时修改同一笔记 → 冲突副本正确生成，原笔记不变
- `resolveConflict("keep-cloud")` 后原笔记内容被替换，冲突副本删除
- templates 合并后无重复、无丢失

---

## 6. M5：IPC + 基础 UI

**目标：** 打通渲染进程到同步引擎的 IPC 链路，提供可用的同步配置和状态界面。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 5.1 | 注册 IPC handler | `electron/main/ipc/sync.ts` | 注册全部 `sync:*` invoke handler：`getConfig`, `saveConfig`, `testConnection`, `getStatus`, `triggerSync`, `getConflicts`, `resolveConflict`, `getDevices`, `disconnect` |
| 5.2 | 扩展 Preload Bridge | `electron/preload/index.ts` | 在 `contextBridge.exposeInMainWorld` 中添加 `sync` 命名空间，包含 invoke 方法和事件监听 |
| 5.3 | 事件推送 | `electron/main/services/sync/sync-manager.ts` | SyncManager 通过 `BrowserWindow.webContents.send()` 推送 `sync:statusChanged`, `sync:progress`, `sync:conflictDetected`, `sync:syncComplete`, `sync:error` |
| 5.4 | 同步状态指示器 | `src/components/sync-status.tsx` | 侧边栏底部组件：状态图标 + 文字 + 点击展开面板（上次同步时间、已连接设备、立即同步按钮、冲突计数） |
| 5.5 | S3 配置面板 | `src/components/sync-settings.tsx` | 在设置页新增「云端同步」板块：启用开关、S3 配置表单（endpoint / region / bucket / prefix / accessKeyId / secretAccessKey / forcePathStyle）、测试连接按钮、同步间隔选择、资源同步模式 |
| 5.6 | 冲突解决对话框 | `src/components/conflict-dialog.tsx` | Dialog 组件：展示两侧版本信息（设备名、修改时间、字数）、预览入口、三个操作按钮（保留本机 / 保留云端 / 保留两者） |
| 5.7 | i18n 词条 | `src/shared/i18n.ts` | 添加 `sync.*` 全部中英文词条 |
| 5.8 | 在主进程入口初始化 SyncManager | `electron/main/index.ts` | `app.whenReady()` 后创建 `SyncManager` 实例，注册 IPC，启动自动同步 |

### 验收标准

- 设置页可配置 S3 后端，测试连接成功
- 点击「立即同步」完成一次完整同步，状态指示器正确更新
- 冲突产生时弹出对话框，三种解决方式均可正常执行
- 中英文 UI 切换正确

---

## 7. M6：百度网盘 Provider

**目标：** 实现百度网盘 OAuth 授权和文件操作，作为国内用户的首选云端后端。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 6.1 | OAuth 2.0 授权流程 | `electron/main/services/sync/baidu-pan-auth.ts`、`scripts/baidu-pan-auth-broker.mjs` | 打开系统浏览器到 broker 授权页 → broker 跳转百度授权 → broker 回调换取 access_token + refresh_token → 本地应用通过一次性 broker_code 取回 token 并存入 config.json |
| 6.2 | 实现 `BaiduPanProvider` | 同上 | 小文件上传（<4MB）：单次 `upload` API<br>大文件分片上传（≥4MB）：`precreate` → 分片 → `create`<br>下载：获取 dlink → 下载<br>列出 / 删除 / 存在检查 |
| 6.3 | 请求频率控制 | 同上 | 请求队列 + 令牌桶限速（10 req/s）+ 429 退避 |
| 6.4 | Token 自动刷新 | 同上 | 每次请求前检查 `expiresAt`，过期前通过 broker 调用百度 refresh_token 接口；refresh 失败标记 `SyncAuthError`，提示用户重新授权 |
| 6.5 | 百度网盘配置 UI | `src/components/sync-settings.tsx` | 在同步设置面板中添加百度网盘选项：固定同步目录 → 「打开网页授权」按钮 → broker OAuth 流程 → 授权成功后保存配置 |

### 验收标准

- 完成 broker OAuth 授权并成功同步笔记到百度网盘 `/apps/MetisNote/` 目录
- Token 过期后自动刷新，无需用户手动操作
- 大文件（>4MB 图片资源）分片上传成功
- 不在桌面客户端保存百度应用 Secret Key
- 依据当前公开文档，PKCE 未见支持参数，仍需 broker 持有 Secret Key

---

## 8. M7：WebDAV Provider

**目标：** 支持坚果云、NextCloud 等 WebDAV 兼容服务作为同步后端。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 7.1 | 安装依赖 | `package.json` | `npm install webdav` |
| 7.2 | 实现 `WebDAVProvider` | `electron/main/services/sync/providers/webdav.ts` | PUT / GET / PROPFIND / DELETE / MKCOL<br>递归创建父目录（`upload` 前自动 `MKCOL`）<br>处理坚果云等服务的特殊行为（PROPFIND depth 限制等） |
| 7.3 | WebDAV 配置 UI | `src/components/sync-settings.tsx` | 添加 WebDAV 选项：服务器地址、用户名、密码、远程路径 |
| 7.4 | 集成测试 | `tests/sync/webdav-integration.test.ts` | 用 NextCloud Docker 容器做集成测试 |

### 验收标准

- 坚果云 / NextCloud 完成完整同步流程
- 目录自动创建正确
- 中文文件名正确处理

---

## 9. M8：端到端加密

**目标：** 可选的端到端加密，确保云端存储的内容对第三方不可读。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 8.1 | 实现加密模块 | `electron/main/services/sync/encryption.ts` | `deriveKeys()`：PBKDF2 600K → HKDF 分离 contentKey / metadataKey<br>`encrypt()` / `decrypt()`：AES-256-GCM，每文件独立 IV<br>`fingerprint()`：未加密用 SHA-256，加密用 HMAC(metadataKey, plaintext)<br>`verifyPassphrase()`：用验证标记验证密码 |
| 8.2 | 加密层集成到 SyncManager | `electron/main/services/sync/sync-manager.ts` | `stageObject()` 中加密后上传<br>下载后解密<br>`scanLocal()` 中使用对应的 fingerprint 函数 |
| 8.3 | 加密设置 UI | `src/components/sync-settings.tsx` | 加密区块：设置口令 → 二次确认 → 生成 salt + verificationTag<br>已设置时：「已启用加密」+ 「更改口令」（需输入旧口令） |
| 8.4 | 口令变更迁移 | `electron/main/services/sync/encryption.ts` | `migrateEncryption()`：旧密钥解密所有对象 → 新密钥重新加密 → 重新上传 → 更新 fingerprint → 发布迁移 commit |
| 8.5 | 首次启用 / 关闭加密 | 同上 | 启用：全量加密上传<br>关闭：全量解密上传<br>均需发布一个包含所有文件 `put` 的大 commit |

### 验收标准

- 设置口令后同步的文件在云端为密文
- 新设备输入正确口令后可正常拉取解密
- 错误口令被拒绝，不产生损坏数据
- 口令变更后旧设备输入新口令仍可正常同步

---

## 10. M9：资源同步

**目标：** 支持图片、附件等资源文件的跨设备同步，含按需下载模式。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 9.1 | 完整同步模式 | `electron/main/services/sync/change-tracker.ts` | 在 `scanLocal()` 中纳入 `assets/<noteId>/**` 文件<br>大文件分片上传（百度网盘 ≥4MB，S3 multipart ≥100MB） |
| 9.2 | 按需下载模式 — 元信息同步 | `electron/main/services/sync/sync-manager.ts` | `assetSyncMode: "on-demand"` 时仅同步 `sync-state.json` 中的资源元信息，不下载 `objects/` |
| 9.3 | 按需下载模式 — 协议拦截 | `electron/main/index.ts` | 修改 `asset://` protocol handler：本地不存在时返回占位图 + 触发 `SyncManager.downloadAsset(noteId, assetId)`<br>下载完成后发送 `sync:assetReady` 事件通知渲染进程刷新 |
| 9.4 | 资源可用性状态 | `electron/main/services/sync/asset-availability.ts` | 维护 `AssetAvailability` 状态表：local / cloud-only / downloading / error |
| 9.5 | 跳过未引用资源 | `electron/main/services/sync/change-tracker.ts` | 上传前与 `AssetStore.cleanupUnreferenced()` 联动，不上传已被内容移除的资源 |
| 9.6 | 版本历史同步 | `electron/main/services/sync/change-tracker.ts` | `syncVersionHistory: true` 时纳入 `versions/<noteId>/**`，版本文件名为时间戳，天然无冲突 |

### 验收标准

- 完整模式：资源文件正确同步到另一台设备
- 按需模式：笔记内图片先显示占位图，后台下载完成后自动替换
- 未引用资源不被上传

---

## 11. M10：性能优化与 GC

**目标：** 提升大规模笔记库的同步性能，管理云端存储空间。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 10.1 | 增量扫描 | `electron/main/services/sync/change-tracker.ts` | 利用 `mtime` + `size` + `cachedLocalFingerprint` 跳过未修改文件<br>注意：只有同步完成后才能回写缓存 |
| 10.2 | 并行传输 | `electron/main/services/sync/transfer.ts` | 并行度 3 的工作队列，支持进度回调 |
| 10.3 | 快照压缩 | `electron/main/services/sync/snapshot-compactor.ts` | `tryCompactSnapshot()`：获取租约 → 物化当前视图 → 写入新 `sync-state.json` → 释放租约<br>租约使用 `locks/snapshot.lock`（写入设备 ID + 过期时间） |
| 10.4 | Commit GC | `electron/main/services/sync/commit-gc.ts` | 安全删除规则：如果一个 commit 的所有操作都已被 `sync-state.json` 快照包含（即 `basedOnCursor[deviceId] >= commitId`），且所有已注册设备的 `lastSyncAt` 都晚于该 commit 的 `createdAt`，则可安全删除<br>保留窗口：至少保留最近 7 天的 commit |
| 10.5 | 孤儿对象清理 | `electron/main/services/sync/commit-gc.ts` | 扫描 `objects/` 下所有对象键，与快照 + 未 GC 的 commit 引用做差集，删除未引用的对象 |

### 验收标准

- 1000 篇笔记的库，增量扫描 <500ms（无变更时）
- 快照压缩后，新设备首次同步只需下载快照 + 少量新 commit
- GC 不会删除任何仍被活跃设备依赖的 commit

---

## 12. M11：稳定性与体验

**目标：** 生产级的错误恢复、网络感知和运维能力。

### 任务清单

| # | 任务 | 产出文件 | 说明 |
|---|---|---|---|
| 11.1 | 错误重试 + 指数退避 | `electron/main/services/sync/retry.ts` | `withRetry()`：最多 3 次，基础延迟 1s，最大 60s，指数 ×2<br>不可重试错误直接抛出 |
| 11.2 | 网络状态监听 | `electron/main/services/sync/sync-manager.ts` | 监听 `online` / `offline` 事件；离线时暂停自动同步，上线后立即触发一次同步 |
| 11.3 | 崩溃恢复 | `electron/main/services/sync/sync-manager.ts` | 启动时检测上次同步是否异常中断（`local-state.json` 标记 `syncInProgress`）→ 执行全量扫描重建基线 |
| 11.4 | 设备管理 UI | `src/components/sync-settings.tsx` | 展示所有注册设备列表（名称、平台、最后同步时间） |
| 11.5 | 同步日志 | `electron/main/services/sync/sync-logger.ts` | 每次同步记录结果到 `.sync/sync.log`（最近 1000 条）<br>包含：时间、pushed/pulled/conflicts/errors、耗时 |
| 11.6 | 诊断导出 | `electron/main/ipc/sync.ts` | `sync:exportDiagnostics` IPC → 导出 `config.json`（脱敏）+ `local-state.json` + `sync.log` 为 zip |
| 11.7 | 全面测试 | `tests/sync/` | 边界用例：同步中断恢复、大文件、空笔记、特殊字符路径、快照损坏回放、commit 乱序 |

### 验收标准

- 网络断开 → 重连后 60s 内自动完成同步
- 同步中强杀进程 → 重启后自动恢复，不丢数据
- 诊断导出不包含明文密钥或 token

---

## 13. 各里程碑产出文件汇总

```
electron/main/
  services/
    sync/
      types.ts                     [M1]
      change-tracker.ts            [M2]
      commit-log.ts                [M2]
      remote-view.ts               [M2]
      local-state.ts               [M2]
      index-rebuilder.ts           [M2]
      sync-manager.ts              [M3]
      conflict-resolver.ts         [M4]
      encryption.ts                [M8]
      transfer.ts                  [M10]
      snapshot-compactor.ts        [M10]
      commit-gc.ts                 [M10]
      asset-availability.ts        [M9]
      sync-logger.ts               [M11]
      retry.ts                     [M11]
      providers/
        types.ts                   [M1]
        s3.ts                      [M3]
        baidu-pan.ts               [M6]
        webdav.ts                  [M7]
  ipc/
    sync.ts                        [M5]

src/
  shared/
    sync.ts                        [M1]
  components/
    sync-status.tsx                [M5]
    sync-settings.tsx              [M5, M6, M7, M8]
    conflict-dialog.tsx            [M5]

tests/
  sync/
    change-tracker.test.ts         [M2]
    remote-view.test.ts            [M2]
    conflict.test.ts               [M4]
    s3-integration.test.ts         [M3]
    webdav-integration.test.ts     [M7]
    encryption.test.ts             [M8]
    ...                            [M11]
```

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 百度网盘 API 审核周期长 | M6 阻塞 | 先用 S3/WebDAV 上线；百度网盘作为后续迭代 |
| 大笔记库首次全量同步慢 | 用户体验差 | 显示精确进度；支持后台同步不阻塞编辑 |
| 加密口令遗忘 | 数据不可恢复 | UI 明确警告「口令丢失无法恢复」；建议用户备份口令 |
| 多设备同时快照压缩 | 快照覆盖 | 租约机制 + 快照仅用于加速（损坏不影响正确性） |
| Commit 日志无限增长 | 云端存储浪费、新设备回放慢 | M10 实现 Commit GC + 快照压缩 |
| 百度网盘 API 频率限制 | 大量文件同步被 429 | 请求队列 + 令牌桶 + 指数退避 |
| `NoteStore` 内存缓存与磁盘不一致 | 编辑器显示旧内容 | M4 实现 `reloadFromDisk()`；同步完成后显式刷新 |

---

## 15. 测试策略

| 层级 | 范围 | 工具 |
|---|---|---|
| **单元测试** | ChangeTracker、RemoteView、ConflictResolver、Encryption | Vitest / Jest（mock CloudStorageProvider） |
| **集成测试** | S3Provider + MinIO、WebDAVProvider + NextCloud | Docker 容器 + Vitest |
| **端到端测试** | 两个模拟设备目录 + 真实后端 | 脚本模拟完整同步循环（push → pull → conflict → resolve） |
| **手动测试** | UI 交互、OAuth 流程、冲突对话框 | 开发环境 + MinIO |

### 关键测试用例

| 场景 | 预期结果 |
|---|---|
| 设备 A 新建笔记 → 设备 B 同步 | B 上出现新笔记，内容一致 |
| A、B 同时修改同一笔记 → A 先同步 → B 同步 | B 上产生冲突副本 |
| A 删除笔记 → B 同步（B 未修改该笔记） | B 上笔记被删除 |
| A 删除笔记 → B 修改了该笔记 → B 同步 | B 上保留本地版本 + 冲突提示 |
| 同步中网络断开 → 恢复 | 自动重试完成同步 |
| 同步中进程崩溃 → 重启 | 无数据损坏，重新同步成功 |
| 启用加密 → 同步 → 新设备输入口令 → 同步 | 新设备正确解密所有内容 |
| 首次同步（空云端） | 全量推送，云端结构正确 |
| 首次同步（新设备加入已有云端） | 全量拉取，本地内容完整 |
