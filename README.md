# dsh-evidence-ledger

面向 DeepSeek Harness 的本地证据账本插件。

它给 DSH agent 提供一个 `evidence_ledger` 工具，用于把事实、测试结果、决策、失败路径和待验证项记录到工作区内的 JSONL 文件。账本默认位于 `.dsh/evidence-ledger.jsonl`，只追加、不联网、不删除历史记录。

## 安装

```sh
dsh plugin --profile demo add github:Freakz2z/dsh-evidence-ledger
```

安装 bundle 后，插件会自动加入 profile。npm 包发布后也可以使用 `dsh-evidence-ledger` 作为安装 spec；随后用 `evidence_ledger` 工具记录或检索证据。

## 工具用法

记录一条已经观察到的测试结果：

```json
{
  "action": "record",
  "kind": "test",
  "status": "verified",
  "claim": "npm test passes",
  "evidence": "node test.mjs exited with code 0",
  "source": "test.mjs",
  "tags": ["release", "ci"]
}
```

查询最近记录：

```json
{
  "action": "list",
  "query": "release",
  "limit": 10
}
```

也可以按类型、状态或标签缩小结果：

```json
{
  "action": "list",
  "kind": "test",
  "status": "verified",
  "tag": "ci",
  "limit": 20
}
```

支持的 `kind`：`fact`、`test`、`decision`、`failure`、`note`。

支持的 `status`：`observed`、`verified`、`rejected`、`pending`。

`list` 的 `kind`、`status` 和 `tag` 是精确筛选；`query` 仍会在声明、证据、来源和标签中进行不区分大小写的全文搜索。

记录内容应区分“已经看到的证据”和“尚未验证的判断”。插件不会替 agent 判断一条声明是否真实，只负责保存原始记录并提供可检索的来源指针。

## 配置

默认配置已经足够使用。需要修改文件位置或列表上限时，可以在 profile 的 patch 中覆盖配置：

```yaml
- id: evidence-ledger
  config:
    path: .dsh/project-evidence.jsonl
    maxResults: 40
```

`path` 必须是工作区内的相对路径；插件拒绝绝对路径和逃出工作区的 `..` 路径。`maxResults` 范围为 1–100。

## 隐私与边界

- 不发起网络请求，也不依赖远程服务。
- 只写入配置的工作区内文件。
- 使用 JSONL 追加记录，历史记录不会被插件自动覆盖或删除。
- 不读取工作区中的其他文件来“推断”证据；写入内容来自工具调用参数。
- 记录前请避免把 token、密码、私钥和完整个人数据放入 claim、evidence 或 source。

## 开发

```sh
npm ci
npm test
npm run pack:check
```

需要检查真实 Loader 组合时，可在一个已构建的 DeepSeek Harness checkout 中安装本地包：

```sh
dsh plugin --profile demo add .
```

## License

MIT
