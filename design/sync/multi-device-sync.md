# MetisNote 多端文档同步方案

## 1. 概述

MetisNote 是 local-first 桌面应用，所有数据以 JSON 文件存储在本地文件系统。本方案设计一套**基于云端存储的多终端文档同步机制**，支持百度网盘、S3 兼容存储、WebDAV 等多种云端后端，实现笔记内容、资源附件、模板、版本历史的跨设备同步。

### 1.1 设计原则

| 原则 | 说明 |
|---|---|
| **Local-first** | 离线可完整工作，同步仅在有网络时进行 |
| **文件粒度同步** | 以单个 JSON 文件 / 资源文件为同步单元，非 CRDT |
| **增量同步** | 仅传输有变更的文件，通过内容指纹检测变更 |
| **冲突可追溯** | 冲突时保留两侧版本，由用户决定合并策略 |
| **后端可插拔** | 云存储后端通过统一接口抽象，新增后端仅需实现接口 |
| **端到端加密** | 可选加密，密钥不上传云端，仅用户持有 |

### 1.2 同步范围

| 数据 | 是否同步 | 说明 |
|---|---|---|
| `index.json` | ✅ | 启动加速用的物化索引；同步但不作为最终真值 |
| `items/<uuid>.json` | ✅ | 笔记内容，文件级同步 |
| `links.json` | ❌ | 启动时从内容重建，无需同步 |
| `assets/<noteId>/*` | ✅ | 资源文件，按需同步 |
| `versions/<noteId>/*` | ✅ (可选) | 版本历史，可配置是否同步 |
| `templates.json` | ✅ | 模板，文件级同步 |
| `llm-models.json` | ❌ | 含 API Key，不同步 |
| `registry.json` + 模型文件 | ❌ | 本地模型，体积过大 |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                     Renderer Process                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ Sync Status  │  │ Conflict UI  │  │  Settings UI  │   │
│  │   Indicator  │  │  Resolution  │  │  (云端配置)    │   │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘   │
│         │                 │                   │           │
│         └────────────┬────┘───────────────────┘           │
│                      │ IPC                                │
├──────────────────────┼───────────────────────────────────┤
│                      │         Main Process               │
│              ┌───────▼────────┐                           │
│              │  SyncManager   │                           │
│              │  (调度 & 状态)  │                           │
│              └───┬────┬───┬──┘                           │
│                  │    │   │                               │
│     ┌────────────┘    │   └────────────┐                 │
│     ▼                 ▼                ▼                 │
│ ┌────────┐    ┌──────────────┐   ┌──────────┐           │
│ │ Change  │    │   Conflict   │   │ Encryption│           │
│ │Tracker  │    │  Resolver    │   │  Layer    │           │
│ └────┬───┘    └──────────────┘   └─────┬────┘           │
│      │                                  │                │
│      └──────────────┬───────────────────┘                │
│                     ▼                                    │
│           ┌──────────────────┐                           │
│           │ CloudStorageProvider │ ◄── 统一抽象接口        │
│           └──┬─────┬──────┬──┘                           │
│              │     │      │                              │
│         ┌────┘     │      └────┐                         │
│         ▼          ▼           ▼                         │
│    ┌─────────┐ ┌────────┐ ┌────────┐                    │
│    │ BaiduPan│ │   S3   │ │ WebDAV │                    │
│    │Provider │ │Provider│ │Provider│                    │
│    └─────────┘ └────────┘ └────────┘                    │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 云端存储目录结构

同步到云端的文件布局：

```
metis-sync/                           ← 云端根目录（用户可配置）
  device-manifest.json                ← 设备注册表
  sync-state.json                     ← 云端快照缓存（可重建，不是权威来源）
  commits/
    <deviceId>/
      <commitId>.json                 ← 不可变提交日志（权威来源）
  objects/
    <sha256-prefix>/
      <payloadHash>.bin               ← 实际文件内容（密文或明文）
  locks/
    snapshot.lock                     ← 快照压缩 / 维护锁（可选）
```

### 3.1 `device-manifest.json`

```ts
interface DeviceManifest {
  version: 1
  devices: DeviceRecord[]
}

interface DeviceRecord {
  deviceId: string          // 每台设备唯一 ID，首次同步时生成
  deviceName: string        // 用户可读名称，默认取 os.hostname()
  platform: string          // "darwin" | "win32" | "linux"
  appVersion: string        // MetisNote 版本号
  lastSyncAt: string        // ISO 8601，最后一次同步时间
  registeredAt: string      // ISO 8601，首次注册时间
}
```

### 3.2 `sync-state.json`

`sync-state.json` 在改进方案中**不再是云端唯一真值**，而是一个可随时重建的快照缓存，用于减少每次启动都全量回放 commit 日志的成本。

```ts
interface CloudSyncState {
  version: 2
  snapshotId: string
  generatedAt: string
  generatedBy: string
  /** 生成该快照时已经纳入的提交游标 */
  basedOnCursor: CommitCursor
  /** 当前已知的最大 Lamport 时间 */
  maxLamport: number
  /**
   * 文件路径 → 当前可见文件元信息
   * 路径相对于逻辑数据根，例如 "index.json", "items/abc-123.json"
   */
  files: Record<string, CloudFileEntry>
}

interface CommitCursor {
  /** deviceId -> latest commitId already materialized */
  [deviceId: string]: string
}

interface CloudFileEntry {
  /**
   * 文件内容指纹：
   * - 未加密：sha256(plaintext)
   * - 已加密：hmacSha256(metadataKey, plaintext)
   */
  fingerprint: string
  /** 实际上传 payload 的 SHA-256（明文模式=文件内容，密文模式=密文包） */
  payloadHash: string
  /** 云端对象键，例如 "objects/ab/abcdef...bin" */
  objectKey: string
  /** 文件大小（字节，明文大小） */
  size: number
  /** 密文大小；未加密时与 size 相同 */
  storedSize: number
  /** 最后一次生效提交的 Lamport 时间 */
  lamport: number
  /** 最后修改时间 ISO 8601 */
  updatedAt: string
  /** 最后修改的设备 ID */
  updatedBy: string
  /** 单调递增的逻辑版本号 */
  revision: number
}
```

> 关键约束：
> 1. `sync-state.json` 丢失或过期不影响正确性，设备可通过快照 + commit 回放恢复完整云端视图。
> 2. 普通同步流程不依赖对 `sync-state.json` 的强一致写入，因此不再把“改状态文件”当成主提交流程的一部分。

### 3.3 `commits/<deviceId>/<commitId>.json`

云端真正的权威来源是**不可变提交日志**。每次同步把本地变更整理为一个 commit，先上传对象，再发布 commit；只有 commit 发布成功，对应变更才算“对其他设备可见”。

```ts
interface CommitManifest {
  version: 1
  commitId: string
  deviceId: string
  deviceName: string
  createdAt: string
  /**
   * Lamport 时间用于跨设备确定全序。
   * 新 commit = max(localLamport, remoteMaxLamport) + 1
   */
  lamport: number
  /**
   * 该设备在创建 commit 时看到的远端游标。
   * 用于冲突检测与诊断，不作为阻塞提交的硬前置条件。
   */
  baseCursor: CommitCursor
  operations: CommitOperation[]
}

type CommitOperation =
  | {
      type: "put"
      path: string
      fingerprint: string
      payloadHash: string
      objectKey: string
      size: number
      storedSize: number
      baseFingerprint: string | null
    }
  | {
      type: "delete"
      path: string
      baseFingerprint: string | null
    }
```

**提交发布规则：**

1. 先上传 `objects/` 下的内容对象
2. 所有对象上传成功后，最后写入 `commits/<deviceId>/<commitId>.json`
3. 如果进程在步骤 1 崩溃，只会留下不可见的孤儿对象，不会污染云端逻辑状态
4. 快照压缩失败也不会影响同步正确性，只会让下次回放变慢

---

## 4. 本地同步元数据

在本地 `metis-note-store/` 目录下新增同步元数据：

```
metis-note-store/
  .sync/
    config.json               ← 同步配置（后端类型、认证信息等）
    local-state.json          ← 本地同步状态
    conflicts/
      <uuid>.json             ← 冲突记录
```

### 4.1 `config.json`

```ts
interface SyncConfig {
  version: 1
  enabled: boolean
  provider: SyncProviderType          // "baidu-pan" | "s3" | "webdav"
  providerConfig: BaiduPanConfig | S3Config | WebDAVConfig
  encryption: EncryptionConfig | null
  syncVersionHistory: boolean          // 是否同步版本历史
  syncInterval: number                 // 自动同步间隔（毫秒），默认 300000 (5分钟)
  assetSyncMode: "full" | "on-demand" // 资源同步模式
  deviceId: string                     // 本设备 ID
  deviceName: string                   // 本设备名称
}

type SyncProviderType = "baidu-pan" | "s3" | "webdav"

interface BaiduPanConfig {
  accessToken: string
  refreshToken: string
  expiresAt: string               // ISO 8601
  appKey: string
  remotePath: string              // 百度网盘路径，默认 "/apps/MetisNote"
}

interface S3Config {
  endpoint: string                // S3 endpoint URL
  region: string
  bucket: string
  prefix: string                  // 对象键前缀，默认 "metis-sync/"
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean         // MinIO 等需要 true
}

interface WebDAVConfig {
  serverUrl: string               // WebDAV 服务器地址
  username: string
  password: string
  remotePath: string              // 远程目录路径
}

interface EncryptionConfig {
  enabled: boolean
  /** PBKDF2 派生参数 */
  salt: string                    // hex 编码，首次设置时随机生成
  iterations: number              // 默认 600000
  /** 加密后的验证标记，用于验证密码正确性 */
  verificationTag: string
}
```

### 4.2 `local-state.json`

本地追踪的同步基线。这里记录的是**最后一次成功应用到本机的云端视图**，而不是某次扫描瞬间的临时结果。

```ts
interface LocalSyncState {
  version: 2
  deviceId: string
  lastSuccessfulSyncAt: string | null
  /** 本机已经应用到本地的远端提交游标 */
  lastAppliedCursor: CommitCursor
  /** 本机最后一次使用的快照 ID，可为空 */
  lastSnapshotId: string | null
  /** 本机已知的最大 Lamport 时间 */
  lastLamport: number
  /**
   * 文件路径 → 本地基线元信息
   * 路径格式同 CloudSyncState.files 的 key
   */
  files: Record<string, LocalFileEntry>
}

interface LocalFileEntry {
  /** 最后一次成功同步后确认的基线指纹 */
  baseFingerprint: string | null
  /** 最后一次成功同步后确认的逻辑 revision */
  baseRevision: number
  /** 本地缓存的上次扫描结果，用于增量扫描优化 */
  cachedLocalFingerprint: string | null
  lastSeenMtimeMs: number | null
  lastSeenSize: number | null
  /** 文件在本地磁盘的完整路径 */
  localPath: string
}
```

> 关键约束：`local-state.json` 只能在“所有下载、冲突物化、索引重建、删除操作都完成之后”更新。  
> 也就是说，同步完成时必须以**同步后的真实本地文件系统**重新扫描或增量刷新，不能直接复用同步开始前的扫描快照。

---

## 5. CloudStorageProvider 接口

所有云端后端实现统一接口：

```ts
interface CloudStorageProvider {
  /** 后端类型标识 */
  readonly type: SyncProviderType

  /**
   * 初始化 / 验证连接
   * @throws SyncAuthError 认证失败
   * @throws SyncNetworkError 网络不可达
   */
  initialize(): Promise<void>

  /**
   * 检查连接是否有效（认证未过期、网络可达）
   */
  checkConnection(): Promise<boolean>

  /**
   * 上传文件
   * @param remotePath 相对路径，如 "data/items/abc.json"
   * @param data 文件内容 Buffer
   * @param options 可选元数据
   */
  upload(remotePath: string, data: Buffer, options?: UploadOptions): Promise<void>

  /**
   * 下载文件
   * @param remotePath 相对路径
   * @returns 文件内容 Buffer
   * @throws SyncFileNotFoundError 文件不存在
   */
  download(remotePath: string): Promise<Buffer>

  /**
   * 列出目录下所有文件
   * @param remoteDir 目录路径
   * @param recursive 是否递归列出
   * @returns 文件信息列表
   */
  list(remoteDir: string, recursive?: boolean): Promise<RemoteFileInfo[]>

  /**
   * 删除文件
   * @param remotePath 相对路径
   */
  delete(remotePath: string): Promise<void>

  /**
   * 批量删除文件
   */
  deleteBatch(remotePaths: string[]): Promise<void>

  /**
   * 检查文件是否存在
   */
  exists(remotePath: string): Promise<boolean>

  /**
   * 获取文件元信息（大小、最后修改时间）
   */
  getMetadata(remotePath: string): Promise<RemoteFileInfo | null>

  /**
   * 刷新认证（百度网盘 OAuth token 刷新等）
   * @returns 是否成功刷新
   */
  refreshAuth(): Promise<boolean>

  /**
   * 释放资源
   */
  dispose(): Promise<void>
}

interface UploadOptions {
  contentType?: string
  /** 仅当远程文件哈希匹配时才上传（乐观锁） */
  ifMatchHash?: string
}

interface RemoteFileInfo {
  path: string
  size: number
  lastModified: string        // ISO 8601
  isDirectory: boolean
}
```

---

## 6. 各后端实现要点

### 6.1 百度网盘 (BaiduPanProvider)

**依赖：** 无额外 npm 包，使用 Electron 内置 `net` 模块直接调用百度网盘 Open API。

**认证流程：**

```
用户点击「连接百度网盘」
    │
    ▼
Electron 打开系统浏览器到百度 OAuth 授权页
    │  https://openapi.baidu.com/oauth/2.0/authorize
    │  ?response_type=code
    │  &client_id={appKey}
    │  &redirect_uri=oob           ← 桌面应用使用 oob 模式
    │  &scope=basic,netdisk
    │
    ▼
用户授权后获得 authorization_code
    │
    ▼
用 code 换取 access_token + refresh_token
    │  POST https://openapi.baidu.com/oauth/2.0/token
    │
    ▼
存入 config.json，后续自动用 refresh_token 续期
```

**API 映射：**

| Provider 方法 | 百度网盘 API |
|---|---|
| `upload` | `POST /rest/2.0/xpan/file?method=upload`（<4MB）<br>`/rest/2.0/xpan/file?method=precreate` + 分片 + `create`（≥4MB） |
| `download` | `GET /rest/2.0/xpan/multimedia?method=filemetas` 获取 dlink → `GET dlink` |
| `list` | `GET /rest/2.0/xpan/file?method=list` |
| `delete` | `POST /rest/2.0/xpan/file?method=filemanager&opera=delete` |
| `exists` | `GET /rest/2.0/xpan/file?method=filemetas` |

**限制与策略：**

- 单文件上传限制 4GB（分片上传）
- API 频率限制：普通应用 10 次/秒 → 实现请求队列 + 退避
- Token 有效期 30 天 → 自动 refresh，失败时提示用户重新授权
- 路径限于 `/apps/MetisNote/` 下（百度网盘应用目录）

### 6.2 S3 兼容存储 (S3Provider)

**依赖：** `@aws-sdk/client-s3`（AWS SDK v3，仅引入 S3 客户端，~200KB）

**兼容对象：**

- AWS S3
- 阿里云 OSS（S3 兼容模式）
- 腾讯云 COS（S3 兼容模式）
- MinIO（自建）
- Cloudflare R2
- Backblaze B2

**API 映射：**

| Provider 方法 | S3 操作 |
|---|---|
| `upload` | `PutObject` |
| `download` | `GetObject` |
| `list` | `ListObjectsV2` |
| `delete` | `DeleteObject` |
| `deleteBatch` | `DeleteObjects` |
| `exists` | `HeadObject` |
| `getMetadata` | `HeadObject` |

**关键配置：**

```ts
const client = new S3Client({
  endpoint: config.endpoint,          // 自定义端点
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
  forcePathStyle: config.forcePathStyle,  // MinIO 需要
})
```

### 6.3 WebDAV (WebDAVProvider)

**依赖：** `webdav`（~50KB，纯 JS WebDAV 客户端）

**兼容对象：**

- 坚果云
- NextCloud / OwnCloud
- Synology WebDAV
- 自建 WebDAV 服务

**API 映射：**

| Provider 方法 | WebDAV 操作 |
|---|---|
| `upload` | `PUT` |
| `download` | `GET` |
| `list` | `PROPFIND` depth=1 / infinity |
| `delete` | `DELETE` |
| `exists` | `HEAD` / `PROPFIND` |
| `getMetadata` | `PROPFIND` depth=0 |

**目录自动创建：** WebDAV 要求目录存在才能写文件，`upload` 前需 `MKCOL` 递归创建父目录。

---

## 7. 同步流程

### 7.1 核心同步算法

每次同步执行以下流程（可由定时器或用户手动触发）：

```
┌──────────────────────────┐
│ 1. 规范化本地派生文件       │
│    重建 index.json         │
├──────────────────────────┤
│ 2. 构建云端视图            │
│    下载 snapshot          │
│    回放 commits           │
├──────────────────────────┤
│ 3. 扫描本地当前状态         │
│    对比 local-state.json  │
├──────────────────────────┤
│ 4. 三方比较 + 分类         │
│    push / pull / conflict │
│    delete / noop          │
├──────────────────────────┤
│ 5. 上传对象               │
│    仅上传缺失 objects     │
├──────────────────────────┤
│ 6. 发布本地 commit         │
│    commit 最后写入        │
├──────────────────────────┤
│ 7. 应用远端新增 commits     │
│    下载 / 删除 / 物化冲突  │
├──────────────────────────┤
│ 8. 重新扫描并更新基线       │
│    更新 local-state.json  │
│    视情况压缩 snapshot     │
└──────────────────────────┘
```

**为什么这样改：**

- 普通同步不再依赖对单个 `sync-state.json` 的原地覆盖，因此不会因为某些后端不支持条件写入而丢更新
- “对象先上传、commit 最后发布”保证了云端发布天然是原子的
- 快照仅用于加速，不再承担唯一真值职责；快照损坏时仍可通过 commit 日志恢复

### 7.2 三方变更检测

对于每个文件路径，通过三个值判断变更类型：

- `L`：本地当前指纹（扫描本地文件系统得到）
- `B`：本地基线指纹（`local-state.json` 中最后一次成功同步后的值）
- `C`：云端当前指纹（由 `sync-state.json` + 新增 commit 回放得到的物化视图）

| 本地当前 (L) vs 基线 (B) | 云端当前 (C) vs 基线 (B) | 动作 |
|---|---|---|
| L = B | C = B | 无变更，跳过 |
| L ≠ B | C = B | 仅本地修改 → **Push** 到云端 |
| L = B | C ≠ B | 仅云端修改 → **Pull** 到本地 |
| L ≠ B, C ≠ B, L = C | 两侧改动相同 → 更新基线，跳过传输 |
| L ≠ B, C ≠ B, L ≠ C | 两侧不同修改 → **Conflict** |

**新增文件：** 本地有、基线无、云端无 → Push；本地无、基线无、云端有 → Pull。

**删除文件：**

| 场景 | 动作 |
|---|---|
| 本地删除，云端未改 | 推送删除到云端 |
| 云端删除，本地未改 | 本地删除 |
| 本地删除，云端已改 | 冲突：恢复到本地让用户处理 |
| 云端删除，本地已改 | 冲突：保留本地版本，重新上传 |

### 7.3 文件变更检测实现

```ts
interface FileChange {
  path: string                    // 相对路径
  type: "push" | "pull" | "conflict" | "delete-remote" | "delete-local" | "none"
  localFingerprint: string | null   // null 表示本地不存在
  cloudFingerprint: string | null   // null 表示云端不存在
  baseFingerprint: string | null    // null 表示基线不存在（新文件）
}

class ChangeTracker {
  /**
   * 扫描本地所有需同步的文件，计算内容指纹
   * 扫描范围：index.json, items/*.json, assets/**/*, templates.json, versions/**/*
   */
  async scanLocal(baseDir: string): Promise<Map<string, string>>

  /**
   * 对比本地当前、本地基线、云端状态，生成变更列表
   */
  computeChanges(
    localCurrent: Map<string, string>,
    localState: LocalSyncState,
    cloudState: CloudSyncState
  ): FileChange[]
}
```

### 7.4 `index.json` 与 `items/*.json` 的真值关系

改进方案中，**`items/<uuid>.json` 是笔记语义真值，`index.json` 是可重建的物化索引**。

原因：

- 当前项目里的 `NoteDocument` 已包含 `title`、`preview`、`plainText`、`parentId`、`updatedAt` 等摘要字段
- 如果让 `index.json` 和 `items/*.json` 并列作为两个真值，会出现“正文已更新、索引摘要仍旧值”的错位
- 多端同步里最稳的做法是把 `index.json` 降为派生文件，仅用于启动加速和列表渲染

**同步规则：**

1. 同步开始前执行 `rebuildIndexFromItems()`，用当前 `items/*.json`、模板、删除状态重新生成 `index.json`
2. 下载远端 commit 后，先落盘 `items/*.json`，再重新生成 `index.json`
3. 如果 `index.json` 与某个 `items/<uuid>.json` 不一致，以 `items/<uuid>.json` 为准
4. `index.json` 自身一般不产生人工冲突；它的冲突通过“重新生成索引”自动收敛

```ts
async function rebuildIndexFromItems(baseDir: string): Promise<void> {
  const notes = await loadAllNoteDocuments(baseDir)
  const summaries = notes.map(toSummaryFromItem)
  const normalized = sanitizeHierarchy(summaries)
  await writeIndex(normalized)
}
```

### 7.5 提交发布与回放规则

```ts
async function publishCommit(changes: FileChange[]): Promise<CommitManifest | null> {
  if (changes.every((change) => change.type === "none")) {
    return null
  }

  const lamport = Math.max(localState.lastLamport, remoteView.maxLamport) + 1
  const commitId = createMonotonicCommitId()
  const operations: CommitOperation[] = []

  for (const change of changes) {
    if (change.type === "push") {
      const object = await stageObject(change.path)
      operations.push({
        type: "put",
        path: change.path,
        fingerprint: object.fingerprint,
        payloadHash: object.payloadHash,
        objectKey: object.objectKey,
        size: object.size,
        storedSize: object.storedSize,
        baseFingerprint: change.baseFingerprint,
      })
    } else if (change.type === "delete-remote") {
      operations.push({
        type: "delete",
        path: change.path,
        baseFingerprint: change.baseFingerprint,
      })
    }
  }

  const commit: CommitManifest = {
    version: 1,
    commitId,
    deviceId: config.deviceId,
    deviceName: config.deviceName,
    createdAt: new Date().toISOString(),
    lamport,
    baseCursor: localState.lastAppliedCursor,
    operations,
  }

  // 注意：commit 永远最后发布
  await provider.upload(`commits/${config.deviceId}/${commitId}.json`, Buffer.from(JSON.stringify(commit, null, 2)))
  return commit
}
```

**回放规则：**

- 设备先读取 `sync-state.json`
- 再列出 `basedOnCursor` 之后的 commit
- 按 `(lamport, deviceId, commitId)` 排序后顺序回放
- 同一路径多次写入时，最后一个操作生效
- 删除由 `delete` tombstone 表达，不靠“直接覆盖快照文件”实现

---

## 8. 冲突处理

### 8.1 冲突记录

```ts
interface SyncConflict {
  id: string                        // 冲突记录 ID (randomUUID)
  filePath: string                  // 冲突文件相对路径
  detectedAt: string                // ISO 8601
  localVersion: {
    hash: string
    updatedAt: string
    deviceId: string
    deviceName: string
  }
  cloudVersion: {
    hash: string
    updatedAt: string
    deviceId: string
    deviceName: string
    revision: number
  }
  status: "pending" | "resolved"
  resolution: "keep-local" | "keep-cloud" | "keep-both" | null
}
```

### 8.2 冲突解决策略

**自动解决（无需用户干预）：**

- `links.json`：不同步，无冲突
- `templates.json`：合并模板列表（ID 去重，取 `updatedAt` 较新者）
- 版本快照 `versions/**`：文件名即时间戳，天然不冲突

**需要用户处理的冲突：**

- `index.json`：原则上不单独冲突，由 `items/*.json` 重建自动解决
- `items/<uuid>.json`：笔记内容冲突 → 本地物化冲突副本，等待用户选择

### 8.3 笔记内容冲突处理

当同一篇笔记在两个设备上都被修改时：

1. 保持当前本地原笔记不变
2. 将云端版本物化为一篇**正式的冲突副本笔记** `items/<conflictNoteId>.json`
3. 给冲突副本打上 `sync-conflict` 标签，并记录来源设备与时间
4. 重新执行 `rebuildIndexFromItems()`，让冲突副本进入正常笔记列表
5. UI 弹出冲突通知，用户可以：
   - 保留本地版本（删除冲突副本）
   - 保留云端版本（用冲突副本覆盖当前笔记，删除副本）
   - 保留两者（冲突副本成为独立笔记）

> 关键变化：检测到冲突时，系统**不自动把本地版本重新推送为云端当前版本**。  
> 这样可以避免“最后一个检测到冲突的设备”隐式赢下写入，保证冲突是显式可见、可审计、可回滚的。

```ts
async function materializeNoteConflict(
  noteId: string,
  localNote: NoteDocument,
  cloudNote: NoteDocument,
  noteStore: NoteStore
): Promise<SyncConflict> {
  const conflictNoteId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const conflictNote: NoteDocument = {
    id: conflictNoteId,
    ...cloudNote,
    title: `[冲突副本] ${cloudNote.title}`,
    tags: ["sync-conflict"],
    updatedAt: timestamp,
  }

  await writeNoteItem(conflictNote)
  await rebuildIndexFromItems(noteStore.baseDir)

  return {
    id: crypto.randomUUID(),
    filePath: `items/${noteId}.json`,
    detectedAt: timestamp,
    localVersion: {
      hash: fingerprint(localNote),
      updatedAt: localNote.updatedAt,
      deviceId: localState.deviceId,
      deviceName: config.deviceName,
    },
    cloudVersion: {
      hash: fingerprint(cloudNote),
      updatedAt: cloudNote.updatedAt,
      deviceId: remoteDeviceId,
      deviceName: remoteDeviceName,
      revision: remoteRevision,
    },
    status: "pending",
    resolution: null,
  }
}
```

---

## 9. 资源文件同步

### 9.1 同步模式

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `full` | 同步所有资源文件 | 带宽充足、存储空间充足 |
| `on-demand` | 仅同步元信息，打开笔记时按需下载资源 | 移动网络、存储受限 |

### 9.2 `full` 模式

与笔记内容文件相同的三方比较同步。资源文件通常是二进制文件（图片、PDF），未加密时使用 `SHA-256`，开启加密时使用 `fingerprint(metadataKey, plaintext)` 检测变更。

**优化措施：**

- 大文件分片上传（百度网盘 ≥4MB，S3 multipart ≥100MB）
- 并行上传 / 下载（最多 3 个并发）
- 跳过未引用的资源（与 `AssetStore.cleanupUnreferenced()` 联动）

### 9.3 `on-demand` 模式

1. 同步 `sync-state.json` 中的资源文件元信息（路径、大小、指纹、对象键）
2. 本地维护资源可用性状态表：

```ts
interface AssetAvailability {
  /** 资源路径 → 下载状态 */
  assets: Record<string, AssetStatus>
}

type AssetStatus =
  | { state: "local" }                                    // 本地已有
  | { state: "cloud-only"; size: number }                 // 仅在云端
  | { state: "downloading"; progress: number }            // 下载中
  | { state: "error"; message: string }                   // 下载失败
```

3. `asset://` 协议处理器检查本地是否存在：
   - 存在 → 直接返回
   - 不存在 → 显示占位图 + 触发后台下载 → 下载完成后刷新

---

## 10. 端到端加密

### 10.1 密钥派生

```ts
interface DerivedSyncKeys {
  contentKey: Buffer
  metadataKey: Buffer
}

/**
 * 从用户口令派生两把密钥：
 * - contentKey：用于内容加密
 * - metadataKey：用于生成同步指纹，避免直接暴露明文哈希
 */
async function deriveKeys(passphrase: string, salt: Buffer): Promise<DerivedSyncKeys> {
  const masterKey = crypto.pbkdf2Sync(
    passphrase,
    salt,
    600_000,
    32,
    "sha256"
  )

  return {
    contentKey: hkdf(masterKey, "metis-note-sync-content"),
    metadataKey: hkdf(masterKey, "metis-note-sync-metadata"),
  }
}
```

### 10.2 加密 / 解密

每个文件独立加密，使用 AES-256-GCM；同步元数据中的文件指纹使用 `metadataKey` 生成：

```ts
interface EncryptedPayload {
  /** 版本号，便于未来升级算法 */
  v: 1
  /** 随机 IV (96 bits), base64 */
  iv: string
  /** 认证标签 (128 bits), base64 */
  tag: string
  /** 密文, base64 */
  ct: string
}

function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: encrypted.toString("base64"),
  }
  return Buffer.from(JSON.stringify(payload))
}

function decrypt(encryptedBuf: Buffer, contentKey: Buffer): Buffer {
  const payload: EncryptedPayload = JSON.parse(encryptedBuf.toString())
  const iv = Buffer.from(payload.iv, "base64")
  const tag = Buffer.from(payload.tag, "base64")
  const ct = Buffer.from(payload.ct, "base64")

  const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

function fingerprint(plaintext: Buffer, metadataKey: Buffer | null): string {
  if (!metadataKey) {
    return sha256(plaintext)
  }

  return hmacSha256(metadataKey, plaintext)
}
```

### 10.3 密码验证

首次设置加密时，生成一个验证标记：

```ts
const VERIFICATION_PLAINTEXT = "metis-note-sync-verification-v1"

// 设置加密时
const verificationTag = encrypt(
  Buffer.from(VERIFICATION_PLAINTEXT),
  derivedKeys.contentKey
).toString("base64")

// 验证密码时
try {
  const decrypted = decrypt(Buffer.from(verificationTag, "base64"), derivedKeys.contentKey)
  return decrypted.toString() === VERIFICATION_PLAINTEXT
} catch {
  return false  // 密码错误
}
```

### 10.4 加密范围

| 文件 | 是否加密 |
|---|---|
| `device-manifest.json` | ❌ 不加密（设备名称无敏感信息） |
| `sync-state.json` | ❌ 不加密（仅含对象键、指纹、时序元数据） |
| `commits/**/*.json` | ❌ 不加密（仅含提交元信息与对象引用） |
| `data/index.json` | ✅ 加密（含笔记标题、预览） |
| `data/items/*.json` | ✅ 加密（笔记全文） |
| `data/assets/**` | ✅ 加密（用户资源） |
| `data/templates.json` | ✅ 加密（模板内容） |
| `data/versions/**` | ✅ 加密（历史版本） |

> **注意：**
> 1. 改进方案不再把明文 `SHA-256` 直接暴露在 `sync-state.json` 中。
> 2. 开启加密后，状态文件里保存的是 `HMAC(metadataKey, plaintext)`，可以用于同一同步空间内的变更检测，但不能被第三方直接拿来做低成本字典匹配。
> 3. 即便如此，状态层仍会泄露“同一同步空间内两个文件是否完全相同”的有限等价信息，因此不能把它描述成“完全不泄露内容指纹”。

---

## 11. SyncManager 实现

### 11.1 类结构

```ts
class SyncManager {
  private provider: CloudStorageProvider | null = null
  private config: SyncConfig | null = null
  private localState: LocalSyncState | null = null
  private changeTracker: ChangeTracker
  private encryptionKey: DerivedSyncKeys | null = null
  private syncTimer: NodeJS.Timeout | null = null
  private isSyncing: boolean = false
  private status: SyncStatus = { state: "idle" }

  /**
   * 初始化同步管理器
   * 读取配置 → 创建 Provider → 加载本地状态
   */
  async initialize(): Promise<void>

  /**
   * 执行一次完整同步
   * 加锁 → 变更检测 → 同步执行 → 更新状态 → 解锁
   */
  async performSync(): Promise<SyncResult>

  /**
   * 启动自动同步定时器
   */
  startAutoSync(): void

  /**
   * 停止自动同步
   */
  stopAutoSync(): void

  /**
   * 获取当前同步状态（供 UI 使用）
   */
  getStatus(): SyncStatus

  /**
   * 获取未解决的冲突列表
   */
  getPendingConflicts(): SyncConflict[]

  /**
   * 解决冲突
   */
  resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void>

  /**
   * 更新同步配置（切换后端、修改间隔等）
   */
  updateConfig(config: Partial<SyncConfig>): Promise<void>

  /**
   * 断开同步连接
   */
  disconnect(): Promise<void>

  /**
   * 销毁管理器
   */
  dispose(): void
}
```

### 11.2 同步状态

```ts
type SyncStatus =
  | { state: "idle" }
  | { state: "syncing"; phase: SyncPhase; progress: SyncProgress }
  | { state: "error"; message: string; retryAt: string | null }
  | { state: "conflict"; pendingCount: number }
  | { state: "disabled" }
  | { state: "not-configured" }

type SyncPhase =
  | "scanning"          // 扫描本地变更
  | "comparing"         // 对比云端状态
  | "uploading"         // 上传变更
  | "downloading"       // 下载变更
  | "merging"           // 合并索引
  | "finalizing"        // 更新同步状态

interface SyncProgress {
  phase: SyncPhase
  totalFiles: number
  completedFiles: number
  totalBytes: number
  transferredBytes: number
  currentFile: string | null
}
```

### 11.3 `performSync` 核心流程

```ts
async performSync(): Promise<SyncResult> {
  if (this.isSyncing) return { status: "skipped", reason: "already-syncing" }
  if (!this.provider || !this.config?.enabled) return { status: "skipped", reason: "not-configured" }

  this.isSyncing = true
  this.emitStatus({ state: "syncing", phase: "scanning", progress: ... })

  try {
    // 1. 先规范化派生文件，避免 index.json 与 items/*.json 脱节
    await this.rebuildIndexFromItems()

    // 2. 扫描本地当前状态
    const localFiles = await this.changeTracker.scanLocal(this.baseDir)

    // 3. 构建远端当前视图：快照 + 提交日志回放
    this.emitStatus({ state: "syncing", phase: "comparing", ... })
    const snapshot = await this.downloadCloudSnapshot()
    const commits = await this.listCommitsAfterCursor(snapshot.basedOnCursor ?? this.localState!.lastAppliedCursor)
    const remoteView = materializeRemoteView(snapshot, commits)

    // 4. 计算三方变更
    const changes = this.changeTracker.computeChanges(
      localFiles, this.localState!, remoteView
    )

    // 5. 分组处理
    const toPush = changes.filter(c => c.type === "push")
    const toPull = changes.filter(c => c.type === "pull")
    const toDeleteRemote = changes.filter(c => c.type === "delete-remote")
    const toDeleteLocal = changes.filter(c => c.type === "delete-local")
    const conflicts = changes.filter(c => c.type === "conflict")

    // 6. 先上传对象；对象路径内容寻址，可重复上传且幂等
    this.emitStatus({ state: "syncing", phase: "uploading", ... })
    const stagedObjects = await this.stageObjects(toPush)

    // 7. 发布本地 commit；这是唯一让本地改动“对外可见”的步骤
    const localCommit = await this.publishCommit({
      changes,
      stagedObjects,
      remoteView,
    })

    // 8. 应用远端已有但本地未落盘的变更
    this.emitStatus({ state: "syncing", phase: "downloading", ... })
    for (const file of toPull) {
      const entry = remoteView.files[file.path]
      let data = await this.provider.download(entry.objectKey)
      if (this.encryptionKey) data = decrypt(data, this.encryptionKey.contentKey)
      const localPath = path.join(this.baseDir, file.path)
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, data)
    }

    // 9. 处理删除
    for (const file of toDeleteRemote) {
      // 删除通过 publishCommit 中的 delete 操作表达，这里不直接改云端状态文件
    }
    for (const file of toDeleteLocal) {
      await fs.unlink(path.join(this.baseDir, file.path)).catch(() => {})
    }

    // 10. 冲突物化：为正文冲突创建冲突副本，不自动把某一侧强行写成最终赢家
    if (conflicts.length > 0) {
      this.emitStatus({ state: "syncing", phase: "merging", ... })
      await this.materializeConflicts(conflicts, remoteView)
    }

    // 11. 冲突物化 / 远端下载后，重新生成 index.json
    await this.rebuildIndexFromItems()

    // 12. 重新扫描同步后的真实本地状态，作为新的基线
    const postSyncLocalFiles = await this.changeTracker.scanLocal(this.baseDir)
    const nextCursor = advanceCursor(this.localState!.lastAppliedCursor, commits, localCommit)

    await this.updateLocalState({
      files: postSyncLocalFiles,
      cursor: nextCursor,
      snapshotId: snapshot.snapshotId,
      lamport: Math.max(remoteView.maxLamport, localCommit?.lamport ?? 0),
    })

    // 13. 设备清单更新
    await this.updateDeviceManifest()

    // 14. 尝试压缩快照；失败不影响正确性
    this.emitStatus({ state: "syncing", phase: "finalizing", ... })
    await this.tryCompactSnapshot(remoteView, localCommit).catch(() => {})

    const result: SyncResult = {
      status: "success",
      pushed: toPush.length,
      pulled: toPull.length,
      conflicts: conflicts.length,
      deletedRemote: toDeleteRemote.length,
      deletedLocal: toDeleteLocal.length,
      timestamp: new Date().toISOString(),
    }

    this.emitStatus(
      conflicts.length > 0
        ? { state: "conflict", pendingCount: conflicts.length }
        : { state: "idle" }
    )

    return result
  } catch (err) {
    const retryAt = new Date(Date.now() + 60_000).toISOString()
    this.emitStatus({
      state: "error",
      message: err instanceof Error ? err.message : String(err),
      retryAt,
    })
    return { status: "error", error: String(err) }
  } finally {
    this.isSyncing = false
  }
}
```

**这个流程解决了原方案的三个核心问题：**

1. 云端发布原子性：对象先传、commit 最后发，崩溃时不会出现“状态文件已更新但内容没到位”
2. 跨后端并发：普通同步是 append-only commit，不需要依赖所有后端都支持条件写入
3. 本地基线准确性：`local-state.json` 使用同步完成后的真实扫描结果，而不是同步开始前的旧快照

---

## 12. IPC 通道

### 12.1 渲染进程 → 主进程

| Channel | 参数 | 返回 | 说明 |
|---|---|---|---|
| `sync:getConfig` | — | `SyncConfig \| null` | 获取同步配置 |
| `sync:saveConfig` | `SyncConfig` | `void` | 保存同步配置 |
| `sync:testConnection` | `SyncConfig` | `{ ok: boolean; error?: string }` | 测试云端连接 |
| `sync:getStatus` | — | `SyncStatus` | 获取当前同步状态 |
| `sync:triggerSync` | — | `SyncResult` | 手动触发同步 |
| `sync:getConflicts` | — | `SyncConflict[]` | 获取冲突列表 |
| `sync:resolveConflict` | `{ id: string; resolution: string }` | `void` | 解决冲突 |
| `sync:getDevices` | — | `DeviceRecord[]` | 获取已注册设备列表 |
| `sync:disconnect` | — | `void` | 断开同步 |
| `sync:startBaiduOAuth` | — | `void` | 启动百度 OAuth 流程 |

### 12.2 主进程 → 渲染进程（事件推送）

| Channel | Payload | 说明 |
|---|---|---|
| `sync:statusChanged` | `SyncStatus` | 同步状态变更 |
| `sync:progress` | `SyncProgress` | 同步进度更新 |
| `sync:conflictDetected` | `SyncConflict` | 新冲突产生 |
| `sync:syncComplete` | `SyncResult` | 同步完成 |
| `sync:error` | `{ message: string }` | 同步错误 |
| `sync:baiduOAuthCallback` | `{ code: string }` | 百度 OAuth 回调 |

### 12.3 Preload Bridge

```ts
// electron/preload/index.ts 新增
sync: {
  getConfig: () => ipcRenderer.invoke("sync:getConfig"),
  saveConfig: (config: SyncConfig) => ipcRenderer.invoke("sync:saveConfig", config),
  testConnection: (config: SyncConfig) => ipcRenderer.invoke("sync:testConnection", config),
  getStatus: () => ipcRenderer.invoke("sync:getStatus"),
  triggerSync: () => ipcRenderer.invoke("sync:triggerSync"),
  getConflicts: () => ipcRenderer.invoke("sync:getConflicts"),
  resolveConflict: (id: string, resolution: string) =>
    ipcRenderer.invoke("sync:resolveConflict", { id, resolution }),
  getDevices: () => ipcRenderer.invoke("sync:getDevices"),
  disconnect: () => ipcRenderer.invoke("sync:disconnect"),
  startBaiduOAuth: () => ipcRenderer.invoke("sync:startBaiduOAuth"),
  onStatusChanged: (cb: (status: SyncStatus) => void) =>
    ipcRenderer.on("sync:statusChanged", (_, status) => cb(status)),
  onProgress: (cb: (progress: SyncProgress) => void) =>
    ipcRenderer.on("sync:progress", (_, progress) => cb(progress)),
  onConflictDetected: (cb: (conflict: SyncConflict) => void) =>
    ipcRenderer.on("sync:conflictDetected", (_, conflict) => cb(conflict)),
  onSyncComplete: (cb: (result: SyncResult) => void) =>
    ipcRenderer.on("sync:syncComplete", (_, result) => cb(result)),
}
```

---

## 13. 文件结构

### 13.1 新增源文件

```
electron/main/
  services/
    sync/
      sync-manager.ts              ← 同步调度器主类
      change-tracker.ts            ← 本地变更扫描与三方比较
      commit-log.ts                ← commit 发布、列举、回放
      remote-view.ts               ← snapshot + commit 物化视图
      conflict-resolver.ts         ← 冲突检测与处理
      index-rebuilder.ts           ← 从 items/*.json 重建 index.json
      snapshot-compactor.ts        ← 快照压缩（优化，不是正确性前提）
      encryption.ts                ← 端到端加密工具
      providers/
        types.ts                   ← CloudStorageProvider 接口定义
        baidu-pan.ts               ← 百度网盘实现
        s3.ts                      ← S3 兼容实现
        webdav.ts                  ← WebDAV 实现
  ipc/
    sync.ts                        ← 同步相关 IPC handler 注册

src/
  shared/
    sync.ts                        ← 同步相关共享类型（SyncStatus, SyncConfig 等）
  components/
    sync-status.tsx                ← 同步状态指示器组件
    sync-settings.tsx              ← 同步设置面板
    conflict-dialog.tsx            ← 冲突解决对话框
```

### 13.2 新增依赖

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x",
    "webdav": "^5.x"
  }
}
```

百度网盘 API 使用 Electron 内置的 `net` 模块，无需额外依赖。

---

## 14. UI 设计

### 14.1 同步状态指示器

位于侧边栏底部或标题栏，显示当前同步状态：

```
状态图标：
  ● 绿色圆点          已同步（idle）
  ↻ 旋转箭头          同步中（syncing）
  ⚠ 黄色三角          有冲突（conflict）
  ✕ 红色圆点          同步错误（error）
  ○ 灰色圆点          未配置（not-configured）
  ◌ 空心圆点          已禁用（disabled）
```

点击状态指示器展开同步面板：

```
┌─────────────────────────────┐
│  ● 已同步                    │
│  上次同步：2 分钟前           │
│  已连接设备：MacBook Pro, PC  │
│                             │
│  [立即同步]  [同步设置]       │
│                             │
│  ⚠ 1 个冲突待处理    [查看]   │
└─────────────────────────────┘
```

### 14.2 同步设置页

在设置页中新增「云端同步」板块：

```
┌─────────────────────────────────────────────┐
│  云端同步                                     │
│                                             │
│  启用同步  [开关]                              │
│                                             │
│  存储后端                                     │
│  ┌─────────────────────────────────────┐     │
│  │ ○ 百度网盘     [已连接 ✓]  [断开]    │     │
│  │ ○ S3 兼容存储  [配置]               │     │
│  │ ○ WebDAV      [配置]               │     │
│  └─────────────────────────────────────┘     │
│                                             │
│  自动同步间隔  [5 分钟 ▼]                     │
│                                             │
│  资源同步模式                                 │
│  ○ 完整同步（同步所有资源）                     │
│  ○ 按需下载（仅在打开笔记时下载资源）           │
│                                             │
│  同步版本历史  [开关]                          │
│                                             │
│  端到端加密                                   │
│  [未设置]  [设置加密口令]                      │
│                                             │
│  已连接设备                                   │
│  ┌─────────────────────────────────────┐     │
│  │ MacBook Pro (本机)   最后同步: 刚刚   │     │
│  │ Windows PC           最后同步: 5分钟前│     │
│  └─────────────────────────────────────┘     │
│                                             │
│  [测试连接]  [立即同步]                        │
└─────────────────────────────────────────────┘
```

### 14.3 冲突解决对话框

```
┌───────────────────────────────────────────────┐
│  文档冲突                                       │
│                                               │
│  「项目设计方案」在两台设备上被同时修改：           │
│                                               │
│  ┌──────────────┐    ┌──────────────┐          │
│  │  本机版本      │    │  云端版本      │          │
│  │  MacBook Pro  │    │  Windows PC  │          │
│  │  修改于 14:30 │    │  修改于 14:25 │          │
│  │  1,234 字     │    │  1,156 字     │          │
│  │              │    │              │          │
│  │  [预览]       │    │  [预览]       │          │
│  └──────────────┘    └──────────────┘          │
│                                               │
│  [保留本机版本]  [保留云端版本]  [保留两者]        │
└───────────────────────────────────────────────┘
```

---

## 15. 错误处理与重试

### 15.1 错误分类

```ts
/** 同步错误基类 */
class SyncError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message)
  }
}

/** 认证失败（token 过期等） */
class SyncAuthError extends SyncError {
  constructor(message: string) { super(message, false) }
}

/** 网络错误 */
class SyncNetworkError extends SyncError {
  constructor(message: string) { super(message, true) }
}

/** 文件不存在 */
class SyncFileNotFoundError extends SyncError {
  constructor(path: string) { super(`File not found: ${path}`, false) }
}

/** 并发冲突（快照压缩租约冲突或远端视图已前进） */
class SyncConcurrencyError extends SyncError {
  constructor() { super("Remote sync view advanced concurrently", true) }
}

/** 存储配额不足 */
class SyncQuotaError extends SyncError {
  constructor(message: string) { super(message, false) }
}
```

### 15.2 重试策略

```ts
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,          // 1 秒
  maxDelay: 60_000,         // 60 秒
  backoffMultiplier: 2,     // 指数退避
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (err instanceof SyncError && !err.retryable) throw err
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.baseDelay * config.backoffMultiplier ** attempt,
          config.maxDelay
        )
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
```

### 15.3 自动恢复

| 错误类型 | 自动处理 | 用户通知 |
|---|---|---|
| 网络断开 | 暂停同步，网络恢复后自动重试 | 状态指示器变灰 |
| Token 过期（百度网盘） | 自动 refresh，失败则提示 | 仅 refresh 失败时通知 |
| 存储配额不足 | 停止上传 | 弹窗提示清理空间 |
| 快照压缩冲突 | 放弃本次压缩，下轮再试 | 不通知 |
| 未知错误 | 指数退避重试 3 次 | 3 次失败后通知 |

**崩溃恢复补充：**

- 如果对象上传完成但 commit 未发布：这些对象因为没有 commit 引用，不会进入云端可见视图，可后台定期 GC
- 如果 commit 已发布但本地 `local-state.json` 尚未更新：下次启动时重新拉取 commit，按幂等方式再次应用即可
- 如果快照压缩写到一半失败：直接丢弃半成品快照，继续以旧快照 + commit 日志恢复

---

## 16. 性能优化

### 16.1 增量扫描

不需要每次同步都全量扫描文件哈希。利用文件系统的 `mtime` + `size` + 本地缓存指纹快速判断文件是否有变更：

```ts
async scanLocal(baseDir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const prevState = this.localState?.files ?? {}

  for (const filePath of await this.listSyncableFiles(baseDir)) {
    const stat = await fs.stat(path.join(baseDir, filePath))
    const prev = prevState[filePath]

    if (
      prev &&
      prev.cachedLocalFingerprint &&
      prev.lastSeenMtimeMs === stat.mtimeMs &&
      prev.lastSeenSize === stat.size
    ) {
      // 文件未修改，复用上次的哈希
      result.set(filePath, prev.cachedLocalFingerprint)
    } else {
      // 文件已修改或新文件，重新计算哈希
      const fingerprint = await this.computeFingerprint(path.join(baseDir, filePath))
      result.set(filePath, fingerprint)
    }
  }

  return result
}
```

> 注意：只有“同步完成后的状态”才能回写到 `cachedLocalFingerprint`。  
> 不能把同步开始前的扫描结果直接写回本地基线，否则会把下载、冲突副本、索引重建等后续变更遗漏掉。

### 16.2 并行传输

```ts
const CONCURRENCY = 3

async function transferFiles(
  files: FileChange[],
  transferFn: (file: FileChange) => Promise<void>,
  onProgress: (completed: number) => void
): Promise<void> {
  let completed = 0
  const queue = [...files]

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const file = queue.shift()!
      await transferFn(file)
      onProgress(++completed)
    }
  })

  await Promise.all(workers)
}
```

### 16.3 `sync-state.json` 快照压缩

由于云端真值已经转移到 commit 日志，`sync-state.json` 只负责**快照压缩**。  
也就是说，即使两台设备同时工作，普通同步也不会再因为某个全局状态文件被覆盖而丢更新。

快照压缩策略：

```ts
async function tryCompactSnapshot(remoteView: MaterializedRemoteView): Promise<void> {
  const lease = await tryAcquireSnapshotLease()

  if (!lease) {
    return
  }

  try {
    const snapshot: CloudSyncState = {
      version: 2,
      snapshotId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      generatedBy: config.deviceId,
      basedOnCursor: remoteView.cursor,
      maxLamport: remoteView.maxLamport,
      files: remoteView.files,
    }

    await provider.upload("sync-state.json", Buffer.from(JSON.stringify(snapshot, null, 2)))
  } finally {
    await releaseSnapshotLease(lease)
  }
}
```

**为什么这样设计：**

- S3、WebDAV、百度网盘的条件写入能力不一致，不能把正确性压在“大家都支持 CAS”上
- 快照写入失败时只会损失性能，不会损失正确性
- 只有快照压缩需要租约；普通同步提交完全不依赖全局锁

---

## 17. 安全考虑

| 关注点 | 措施 |
|---|---|
| **传输安全** | 所有 API 均使用 HTTPS；S3/WebDAV 强制 TLS |
| **存储安全** | 可选 AES-256-GCM 端到端加密，密钥不上传云端 |
| **凭证存储** | 正式实现应优先使用系统 Keychain / Credential Vault；`config.json` 仅保存引用或经 `safeStorage` 加密后的最小必要配置 |
| **密钥派生** | PBKDF2 600K 迭代，抵抗暴力破解 |
| **认证刷新** | 百度网盘 OAuth token 自动续期，过期前主动 refresh |
| **数据完整性** | `payloadHash` 校验对象完整性，`fingerprint` 校验逻辑内容一致性 |
| **最小权限** | 百度网盘仅申请 `netdisk` scope，仅操作 `/apps/MetisNote/` 目录 |
| **防注入** | 云端文件路径经过严格校验，禁止 `..`、绝对路径等路径穿越 |

---

## 18. i18n 词条

```ts
// src/shared/i18n.ts 新增词条
sync: {
  title: { zh: "云端同步", en: "Cloud Sync" },
  enable: { zh: "启用同步", en: "Enable Sync" },
  provider: { zh: "存储后端", en: "Storage Backend" },
  baiduPan: { zh: "百度网盘", en: "Baidu Cloud Drive" },
  s3: { zh: "S3 兼容存储", en: "S3 Compatible Storage" },
  webdav: { zh: "WebDAV", en: "WebDAV" },
  connected: { zh: "已连接", en: "Connected" },
  disconnected: { zh: "未连接", en: "Disconnected" },
  configure: { zh: "配置", en: "Configure" },
  disconnect: { zh: "断开", en: "Disconnect" },
  syncNow: { zh: "立即同步", en: "Sync Now" },
  testConnection: { zh: "测试连接", en: "Test Connection" },
  autoSyncInterval: { zh: "自动同步间隔", en: "Auto Sync Interval" },
  assetSyncMode: { zh: "资源同步模式", en: "Asset Sync Mode" },
  fullSync: { zh: "完整同步", en: "Full Sync" },
  onDemand: { zh: "按需下载", en: "On Demand" },
  syncVersionHistory: { zh: "同步版本历史", en: "Sync Version History" },
  encryption: { zh: "端到端加密", en: "End-to-End Encryption" },
  setPassphrase: { zh: "设置加密口令", en: "Set Encryption Passphrase" },
  devices: { zh: "已连接设备", en: "Connected Devices" },
  thisDevice: { zh: "本机", en: "This Device" },
  lastSync: { zh: "上次同步", en: "Last Sync" },
  status: {
    idle: { zh: "已同步", en: "Synced" },
    syncing: { zh: "同步中…", en: "Syncing…" },
    error: { zh: "同步错误", en: "Sync Error" },
    conflict: { zh: "有冲突待处理", en: "Conflicts Pending" },
    disabled: { zh: "同步已禁用", en: "Sync Disabled" },
    notConfigured: { zh: "未配置", en: "Not Configured" },
  },
  conflict: {
    title: { zh: "文档冲突", en: "Document Conflict" },
    description: { zh: "「{title}」在两台设备上被同时修改", en: '"{title}" was modified on two devices simultaneously' },
    keepLocal: { zh: "保留本机版本", en: "Keep Local" },
    keepCloud: { zh: "保留云端版本", en: "Keep Cloud" },
    keepBoth: { zh: "保留两者", en: "Keep Both" },
    preview: { zh: "预览", en: "Preview" },
  },
  phase: {
    scanning: { zh: "扫描本地变更…", en: "Scanning local changes…" },
    comparing: { zh: "对比云端状态…", en: "Comparing with cloud…" },
    uploading: { zh: "上传变更…", en: "Uploading changes…" },
    downloading: { zh: "下载变更…", en: "Downloading changes…" },
    merging: { zh: "合并索引…", en: "Merging index…" },
    finalizing: { zh: "更新同步状态…", en: "Finalizing…" },
  },
}
```

---

## 19. 实现计划

### Phase 1：基础框架 (P0)

**目标：** 建立 append-only commit 同步基础设施，实现 S3 后端的笔记同步。

| 任务 | 预计工作量 |
|---|---|
| 定义 `CloudStorageProvider` 接口 + 共享类型 | 小 |
| 实现 `ChangeTracker`（本地扫描 + 三方比较） | 中 |
| 实现 `CommitLog`（对象上传 + commit 发布） | 大 |
| 实现 `RemoteView`（snapshot + commit 回放） | 中 |
| 实现 `S3Provider` | 中 |
| 实现 `SyncManager` 核心流程 | 大 |
| 实现本地同步状态管理 | 中 |
| 注册 IPC handler | 小 |
| 设置页 S3 配置 UI | 中 |
| 同步状态指示器 | 小 |

### Phase 2：冲突处理 + 派生索引重建 (P0)

| 任务 | 预计工作量 |
|---|---|
| 实现 `IndexRebuilder`（从 items 重建 index） | 中 |
| 实现 `ConflictResolver`（冲突检测 + 副本生成） | 中 |
| 冲突解决对话框 UI | 中 |
| templates.json 合并 | 小 |

### Phase 3：百度网盘 (P1)

| 任务 | 预计工作量 |
|---|---|
| 百度网盘 OAuth 流程 | 中 |
| 实现 `BaiduPanProvider`（含分片上传） | 大 |
| Token 自动刷新 | 小 |
| 百度网盘配置 UI | 中 |

### Phase 4：WebDAV + 加密 (P1)

| 任务 | 预计工作量 |
|---|---|
| 实现 `WebDAVProvider` | 中 |
| 实现端到端加密层 | 中 |
| 加密设置 UI（口令输入 + 验证） | 中 |
| WebDAV 配置 UI | 小 |

### Phase 5：资源同步 + 优化 (P2)

| 任务 | 预计工作量 |
|---|---|
| 资源文件完整同步 | 中 |
| 按需下载模式 + asset:// 协议拦截 | 大 |
| 增量扫描优化（mtime） | 小 |
| 并行传输 | 小 |
| 快照压缩 + 孤儿对象 GC | 中 |
| 版本历史同步（可选） | 中 |

### Phase 6：稳定性 + 体验 (P2)

| 任务 | 预计工作量 |
|---|---|
| 错误重试 + 指数退避 | 小 |
| 网络状态监听 + 自动恢复 | 小 |
| 设备管理 UI | 小 |
| 同步日志 + 诊断信息 | 小 |
| 全面测试 + 边界情况处理 | 大 |

---

## 20. npm 依赖

| 包名 | 用途 | 大小 |
|---|---|---|
| `@aws-sdk/client-s3` | S3 兼容存储 | ~200KB |
| `webdav` | WebDAV 客户端 | ~50KB |

百度网盘使用 Electron 内置 `net` / Node.js `https` 模块直接请求，无额外依赖。

加密使用 Node.js 内置 `crypto` 模块，无额外依赖。
