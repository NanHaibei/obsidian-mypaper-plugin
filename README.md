# My Paper Manager

管理论文元数据、阅读分类和 Excalidraw 论文关系图。

## 安装插件

从 [GitHub Releases](https://github.com/NanHaibei/obsidian-mypaper-plugin/releases/latest) 下载 `obsidian-mypaper-plugin-版本号.zip`，解压后把整个 `obsidian-mypaper-plugin` 文件夹放到：

```text
你的笔记库/.obsidian/plugins/obsidian-mypaper-plugin/
```

最终目录中应直接有 `main.js`、`manifest.json`、`styles.css`，不要再套一层同名目录。重启 Obsidian，在 **设置 → 第三方插件** 中启用 **My Paper Manager**。首次打开论文管理，选择你自己的论文目录，例如 `Paper/manager`。

**Skill 已包含在 main.js 中，无需单独安装、复制到 Codex 全局目录或下载源码。** 也可只下载 Release 中的三个标准文件放进同一目录；Obsidian 标准更新方式可完整更新阅读规则。GitHub 自动提供的 **Source code.zip** 是开发源码，普通使用请下载带插件名称和版本的安装包。

更新时关闭插件，用新版三个文件覆盖同名文件，再启用插件。保留已有的 `data.json`、任务记录和论文附件。每位使用者使用自己的 Codex 登录、网络配置与可用额度；安装包不包含作者的登录凭据、API Key、笔记或个人设置。

## 首次使用 AI 阅读

### 1. 安装并登录 Codex CLI

按 [OpenAI 官方 CLI 安装说明](https://developers.openai.com/codex/cli/) 安装最新版 Codex CLI。已安装 Node.js 的用户也可使用 npm：

```bash
npm install -g @openai/codex
codex login
codex --version
```

按照浏览器提示登录自己的 ChatGPT 账号。也可使用 Codex 支持的其他认证方式；消费与可用模型以自己的 CLI 认证和账号为准，参见 [官方认证说明](https://developers.openai.com/codex/auth/)。本插件在 Codex CLI 0.162.1 验证了原生 Skill、模型目录与 app-server 通信。

Windows 的 Obsidian 要安装并登录 **Windows 本机**的 Codex，不能只装在 WSL 中。插件会查找标准路径及 npm 安装中的原生程序；Windows、macOS 的完整工作流尚未进行真机验证，已验证 Linux 桌面端。

### 2. 准备裁图环境

需要 Python **3.9+** 和 Pillow。已在当前 Python 环境安装 Pillow 的用户可跳过；建议为插件创建独立环境，插件会自动识别以下固定位置。

macOS / Linux：

```bash
python3 -m venv ~/.local/share/mypaper-reading-venv
~/.local/share/mypaper-reading-venv/bin/python -m pip install Pillow
```

Windows PowerShell（先安装 Python，并确保 `py` 可用）：

```powershell
py -3 -m venv "$env:LOCALAPPDATA\MyPaperManager\python"
& "$env:LOCALAPPDATA\MyPaperManager\python\Scripts\python.exe" -m pip install Pillow
```

若创建环境时提示没有 venv，先安装所在系统的 Python venv 组件。插件不会自行安装依赖或修改系统配置。采用自定义安装位置时，可在启动 Obsidian 前设置 `MYPAPER_PYTHON` 为该环境中 Python 的完整路径；`MYPAPER_CODEX_PATH` 可指定 Codex 完整路径，均只填写路径，不附带参数。

### 3. 添加首篇论文

重启 Obsidian，让它读取新的环境。打开 **Add Paper → 论文详情**，确认研究领域与阅读状态，选择 **阅读模型 / 推理强度**，点击 **添加并生成阅读笔记**。

论文会先加入你的管理目录，再在后台读取公开全文、整理正文和原图原表。列表显示真实模型进度、已接收字符数和本轮耗时。收到完整结果后，插件核对章节、AI 标记、公式、图注与图片，再写入并回读确认。生成笔记不会自动把未阅读论文改为已读。

AI 阅读需要桌面端。移动端仍可添加和管理论文，桌面端再通过论文菜单运行阅读任务。使用 AI 功能前请阅读下面的 **联网与隐私**：论文材料和少量近期笔记候选会发送给你使用的模型服务。

## 常见问题

- **找不到 Codex / 无法读取模型：**先在同一系统终端运行 `codex --version` 和 `codex login status`，确认登录及网络正常，再完全退出并重开 Obsidian。桌面应用可能没有继承终端的 PATH 或代理；可使用上述路径环境变量或从已配置环境的终端启动。插件不内置代理地址。
- **缺少 Python/Pillow：**按上面命令创建环境后重试；检查阶段不会调用模型。
- **模型当前容量已满：**模型服务暂时繁忙，可稍后重试或自行更换模型；账号额度不足会显示另一条明确提示。不要连续取消重试，每次重试会开启一轮新的生成。
- **一段时间没有新进展：**表示暂时没收到新的可见事件，不等于任务已失败。保留当前任务，等待最终返回；需要停止时使用论文的更多操作菜单取消。
- **无法获取全文：**补充公开 PDF / arXiv / DOI 链接；付费墙和扫描 PDF 可能无法自动读取，材料不足不会伪装成已完成。
- **已经有论文：**使用论文更多操作中的 **生成或重试阅读笔记**。现有正文保留，新内容追加；已有相同结果不会重复追加。

## 点击选择背景色

在 **设置 → My Paper Manager → 领域样式** 中选择领域，点击 **背景色** 下的颜色即可更换背景。每个颜色只占一行，显示名称和纯色色条，无需输入颜色代码。色卡只修改背景色，文字、边框、纹理和其他样式保持原样；原有单色微调控件仍可单独使用。

内置 86 个不重复背景色（67 个浅色、19 个深色），取自 [Open Color](https://yeun.github.io/open-color/)、[Nord](https://www.nordtheme.com/docs/colors-and-palettes) 和 [Catppuccin](https://catppuccin.com/palette/) 的官方颜色，名称为本插件自定义。支持搜索及明暗筛选。颜色随插件保存，离线可用。

新建领域时可展开 **选择背景色（可选）**；灵感的自定义标签也支持点击色块选色。已有 Excalidraw 图形不会自动改写。

## 整理研究领域与论文分类

在论文管理页点击 **🏷️ 整理分类**，或使用命令 **整理论文领域与分类**。设置中的 **主领域与子领域 → 整理分类** 也可打开。

1. 点击 **生成整理建议**，根据标题、摘要和已有标签生成本地草稿。
2. 展开领域结构，可新增、改名、合并主领域，编辑及迁移子领域。主领域采用简短英文，如 `Locomotion`、`Perception`、`Manipulation`。
3. 逐篇查看当前分类、建议及依据。细分标签支持多选，如 `Heightmap`、`PPO`、`DAgger`、`Distillation`、`State Estimation`；第一项表示主领域，后续标签补充方法、输入与训练方式。
4. 可按标题、原标签或待确认状态筛选，并批量修改。检查具体改动后点击 **备份并应用**。生成草稿不会修改文章；低把握建议不会自动勾选。

分类建议使用本地规则，不联网、不上传论文，也不推断没有证据的方法。它适合辅助整理，不能替代阅读全文确认。论文列表只显示一个主领域大标签，其余子领域和方法沿用原来的折叠小色块与悬停展开效果，宽度计算保持原样。悬停主标签会在当前论文整行（含标题区域）的毛玻璃浮层中横向展开全部领域；标签过多时可在行内左右滚动，移出该行即收起。

每次应用或恢复前，都将当前领域样式、默认领域、相关灵感分类和全部受管理论文的原始内容备份到 **工作区/分类备份/**，并回读验证；备份失败则停止修改。初次整理前已有单独快照。**恢复备份** 只恢复分类字段、生成的研究领域行及领域设置，保留之后新增的正文；已移动或删除的论文会跳过。编辑期间变化的文章也会跳过并显示原因。单篇的 **修改领域** 同样先备份。

只处理工作区下的 **未阅读论文列表** 和 **已阅读论文列表**。备份保存在本地，不含 API Key；其中包含论文原始内容。此功能要求 Obsidian 1.1.0 或更新版本。

## 领域统计

圆环按每篇论文的主领域计数，每篇只计一次；方法标签不重复计入其他领域。中心显示去重后的论文总数，点击图例查看相同范围的论文。旧子领域名会归入其所属主领域，未定义标签也会保留在统计中。

## 导入 IEEE 论文

1. 打开论文管理界面，选择 **添加论文 → 搜索**。
2. 将 **论文来源** 设为 **IEEE**（也可选择 **arXiv + IEEE**），输入论文标题或关键词后点击 **搜索**。
3. 也可以直接粘贴 IEEE DOI（如 `10.1109/CVPR.2016.90` 或对应的 `https://doi.org/` 链接），来源会自动切换到 IEEE。
4. 选择检索结果，确认元数据、阅读状态和研究领域后添加。

无需 API Key 即可通过 [Crossref 公开 API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) 检索 `10.1109` 前缀的 IEEE 文献。可导入标题、作者、期刊/会议、发表日期、DOI 和原文链接；摘要和作者单位是否齐全取决于公开记录。

也支持 IEEE Xplore 的 `/document/编号`、`/abstract/document/编号`、`/stamp/stamp.jsp?arnumber=编号` 链接以及 `ieee:编号`。未配置 Key 时尝试读取公开页面，页面受限则提示改用 DOI、标题或配置 API Key，不会将相似论文当作指定文献导入。

如需使用 IEEE 官方检索，在 [IEEE 开发者网站](https://developer.ieee.org/) 申请 Key，然后填入 **设置 → My Paper Manager → 数据源 → IEEE Xplore API key**。配置后使用官方接口检索标题、DOI 和文献编号；Key 无效、请求限流或服务不可用会直接显示原因。

元数据导入保留原文链接；后续阅读任务会尝试下载可公开访问的全文 PDF。

## 添加论文并生成阅读笔记

在 **添加论文 → 论文详情** 中确认论文、阅读分类和研究领域，选择 **阅读模型与推理强度**，点击 **添加并生成阅读笔记**。模型列表自动读取并缓存，选择随本篇任务固定；以后切换模型不会改变排队论文。

插件显式调用打包在 main.js 中的 `$write-obsidian-paper-notes` Skill。内容规则从 FlowUs Recording Rules 的论文阅读流程迁移，只适配 Obsidian 的属性、Markdown、本地附件与 MathJax；不使用旧导师模板、机器人学偏好或六阶段提示词。后续修改写作规则只维护 `skills/write-obsidian-paper-notes/`，Skill 不会自行改写。

正文从“1. 问题背景”开始，随后为“2. 现有工作的问题与论文动机”“3. 论文方法”“4. 实验结果”“5. 方法缺陷与未来工作”。AI 新写或改写的文字块以 `✦` 结尾；不再添加“AI 论文精读导师”包裹标题。保留现有人工笔记、元数据和已确认的阅读状态。

后台会获取公开全文 PDF，读取所有页面文字并准备页面图像。Skill 查看原文与图表，把方法图、实验图和原表从原始页面裁切，剔除原 caption，核对后完整翻译中文图注；实验原表使用截图，不转录为 Markdown 表格。图片存到 **工作区/AI论文图片/任务编号/** 并在相关解释附近嵌入。无法取得全文、缺少必要图表或未通过标记、章节、公式和图注校验时，保留任务并显示未完成，不写入半成品。

核对按论文页查证原始图注，支持罗马数字、附录编号、Algorithm，以及总图注与分图标签提取顺序不同的情况；只统一断字、下标和等价符号等排版差异，改动数值或原意仍不会通过。所有问题一次汇总，必要时用同一模型和 Skill **自动核对修复最多 1 轮**，复用已有正文、原文与图片，不从零重写。这一轮可能额外消耗模型额度；仍无法证实的内容保留草稿并明确报错，不放宽证据要求来伪装完成。

图注、公式、缺图或写入失败时都保留已生成结果。更新后也会识别旧版遗留的失败草稿；重试会先重新校验缓存，可直接写入的结果不会再次调用模型。

论文列表显示准备、排队、生成、核对和完成状态；在论文 **更多操作 → 生成或重试阅读笔记** 中处理已有论文、查看未完成原因或取消运行。队列串行执行；重启后未开始的任务继续，已中断的任务需手动重试，已收到但写入失败的结果优先缓存写回。移动、重命名或删除笔记时保留对应保护。

运行需要桌面端、已安装并登录的 Codex CLI，以及 Python 3.9+ 和 Pillow（用于裁图）。Codex 路径自动查找；升级保留已有有效连接与模型选择。旧提示词、开关与专属配置退出使用；旧任务历史和现有论文正文不会自动重写或批量删除。新增任务记录位于 `paper-reading-jobs.json`，临时材料位于 `paper-reading-runtime/`。

任务通过 Codex app-server 显式传入 Skill 文件，以独立任务目录为工作区；模型只在该目录准备正文和裁图，实际笔记由插件校验、写入并回读。每个任务复制一份 Skill 快照，运行中的任务不会修改维护版本。内部保留超时和取消保护。

## 联网与隐私

- 未配置 IEEE Key 时，搜索界面默认选择 arXiv；可主动选择 IEEE 或同时搜索两种来源。粘贴 IEEE DOI 或文献链接会自动切换到 IEEE。
- 仅在点击 **搜索** 或按 Enter 后请求所选来源。arXiv 检索访问 `arxiv.org` / `export.arxiv.org`；免 Key 的 IEEE 检索访问 `api.crossref.org`，按文献编号读取公开页面时访问 `ieeexplore.ieee.org`。只发送输入的关键词或文献标识符，不上传笔记或扫描库内容。
- 填写 IEEE Key 后，IEEE 请求发送到 `ieeexploreapi.ieee.org`，包含检索内容和 Key。[IEEE 官方 API 要求每次请求携带 Key](https://developer.ieee.org/docs/read/Searching_the_IEEE_Xplore_Metadata_API)。Key 随插件设置保存在本地 `data.json`，不应分享该文件。
- 摘要翻译默认关闭；开启并配置硅基流动 Key 后，创建论文笔记会将摘要发送到所配置的翻译服务。
- 点击 **添加并生成阅读笔记** 或论文菜单中的生成入口后，向 Codex/OpenAI 发送论文信息、原文材料、Skill 规则及最多 5 篇同类笔记的候选片段以参考文风。旧无标记内容不会自动认定为人工内容。任务可能联网核验来源并消耗账号额度。
- 不收集遥测。手动输入论文信息无需检索联网；原文链接由用户点击打开。

## 开发与验证

```bash
npm install
npm test
npm run build
```

测试使用本地请求模拟，不需要 API Key。构建后的 `main.js` 位于插件根目录，重新加载插件后生效。


## 发布插件

源代码中维护 `skills/write-obsidian-paper-notes/`，构建时自动嵌入 `main.js`。发布包只包含公开文件，不扫描或打包本机笔记库。

```bash
npm ci
npm test
npm run package
```

安装包和三个标准附件输出到 `dist/`，包含 SHA256 校验值。更新 `manifest.json`、`package.json`、`package-lock.json` 和 `versions.json` 的版本后，推送与 manifest 完全一致的版本标签，例如 `1.1.0`，GitHub Actions 会测试、构建并创建 Release。构建文件不提交到源代码分支。
