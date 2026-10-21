首次提供可直接下载安装的 My Paper Manager 完整发布包。

- Add Paper 直接选择模型与推理强度，用本机 Codex 运行随插件内置的论文阅读 Skill。
- 采用迁移后的 FlowUs 论文阅读规则：五章正文，原图、原表截图，完整中文图注，MathJax 公式与 AI 文字末尾 `✦`。
- 自动核对全部问题，兼容分图、算法、罗马数字和 PDF 排版差异；最多自动修复一轮，失败草稿可缓存恢复，无需重新生成整篇。
- 显示实际模型进度、接收字符数、本轮耗时和失败原因；保留取消、重试与写回保护。
- 阅读规则与裁图脚本包含在 main.js 中，标准插件更新无需额外安装 Skill。
- 包含现有多领域管理、分类整理、IEEE/Crossref 导入、配色与领域悬停功能。

安装：下载 `obsidian-mypaper-plugin-1.1.0.zip`，将其中的 `obsidian-mypaper-plugin` 文件夹放入笔记库 `.obsidian/plugins/`，重启后启用。也可安装三个独立附件。

AI 阅读需自己的 Codex 登录及 Python 3.9+/Pillow，消耗自己的模型额度；安装及隐私说明见仓库 README。Linux 桌面端已实际验证；Windows/macOS 的完整工作流尚未真机验证。升级保留自己的 data.json、任务记录和论文附件。
