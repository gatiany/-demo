# 在英中资企业优秀成果 · 线上评审网站

英国中国商会成立25周年优秀成果评比使用的评审网站。纯静态网页，部署在 GitHub Pages；评分数据保存在 Supabase（伦敦节点）。

- `index.html` 评委评分页：每位评委用专属链接打开，左侧案例清单、中间案例页、右侧打分，自动保存，评完后提交。
- `admin.html` 秘书处后台：添加评委并生成链接、查看进度与催办、解锁、自动计分排名、导出 CSV。

---

## 第一步：先上 GitHub 看效果（演示模式，约 10 分钟）

`config.js` 里的 Supabase 信息留空时，网站运行在**演示模式**，数据只保存在当前浏览器，可以直接打开试用。

1. 登录 GitHub → 右上角 **+** → **New repository**。名称例如 `cccuk-review`，选 **Public**，点 **Create repository**。
2. 在新仓库页面点 **uploading an existing file**，把本文件夹里的**全部内容**拖进去（包括 `assets`、`cases`、`supabase` 文件夹和 `.nojekyll` 文件），点 **Commit changes**。
   - Mac 上 `.nojekyll` 是隐藏文件，在访达里按 `Command + Shift + .` 可显示。
3. 仓库 → **Settings** → 左侧 **Pages** → Source 选 **Deploy from a branch**，Branch 选 `main` / `(root)` → **Save**。
4. 等 1–2 分钟，页面顶部会显示网址，形如 `https://你的用户名.github.io/cccuk-review/`。
   - 评委页演示：在网址后加 `index.html?t=demo1`
   - 后台演示：在网址后加 `admin.html`，管理密钥 `demo`

## 第二步：接入 Supabase（正式评审前完成，约 15 分钟）

1. 打开 https://supabase.com 注册并登录 → **New project**：
   - Name：`cccuk-review`；Database Password：自己设一个强密码并保存好（网站用不到它）；
   - **Region 选 West EU (London)**；免费方案即可 → **Create new project**，等待约 2 分钟。
2. 左侧 **SQL Editor** → **New query**，把 `supabase/setup.sql` 全文粘贴进去；
   **先把最后一行的 `请改成你自己的管理密钥` 改成你自己的密钥**（至少 12 位，例如随机字母数字组合），然后点 **Run**。看到 `Success` 即可。
3. 左侧 **Project Settings → API**（或 **Data API / API Keys**），复制：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public** key（或 **publishable** key）
4. 在 GitHub 仓库里打开 `config.js` → 右上角铅笔图标编辑，把上面两项填进 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` → **Commit changes**。1–2 分钟后网站自动更新为正式模式（页面上不再显示黄色“演示模式”提示）。
5. 打开 `admin.html`，输入第 2 步设置的管理密钥登录 → 页面会提示“案例清单未同步” → 点 **同步案例清单**。

> anon / publishable key 设计上就是公开给网页使用的，放在公开仓库里没有问题；数据库表已设为不对外开放，网页只能通过限定的函数读写。**数据库密码和 service_role / secret key 绝对不要放进仓库。**

## 第三步：添加评委、发链接

1. 后台 → **评委管理** → 填姓名、所在单位，勾选需回避的申报单位（单位名与申报单位一致时会自动勾选）→ **添加并生成链接**。
2. 点 **复制全部评委链接**，粘贴到邮件里分别发给各位评委。每个链接只对应一位评委，相当于密码，请勿群发同一封邮件中的全部链接。
3. 评审期间在 **评审进度** 查看谁已提交；点 **复制未提交评委名单与链接** 用于催办。
4. 评委提交后内容锁定；如需修改，在进度表点 **解锁**。

## 第四步：查看结果

后台 → **结果排名**：
- 得分＝去掉一个最高分和一个最低分后的平均（有效评分少于 5 份时直接平均）；同分依次比较“中英合作价值”“实际成果与在英贡献”。
- “建议奖项”按方案规则自动生成（卓越成果奖前 5 名、同一单位限 1 项；五个专项奖；60 分以上为优秀成果奖），**仅供评审会商参考**。
- 可导出 **排名 CSV** 和 **全部原始评分 CSV**（用 Excel 打开）。

---

## 常见修改

| 要改什么 | 改哪里 |
|---|---|
| 标题、截止日期、联系方式 | `config.js` 的 `CONFIG` |
| 奖项名称、名额、优秀奖分数线 | `config.js` 的 `AWARDS` |
| 新增/更换案例页 | 把图片放进 `cases/`（如 `16.jpg`），在 `assets/cases.js` 对应案例的 `pages` 里填 `"cases/16.jpg"`；新增案例则补一行。上传后在后台点 **同步案例清单**。 |
| 评分维度和满分 | `config.js` 的 `DIMS` **和** `supabase/setup.sql` 中 `judge_save` 函数里的 `maxes` 必须同时修改（评审开始后不建议再改） |

## 注意事项

- 免费 GitHub 账号的 Pages 需要公开仓库，**网页代码和案例页图片会公开可见**；评分只存在 Supabase，不会公开。若评审期间不希望案例页公开，可改用付费 GitHub 私有仓库，或 Cloudflare Pages（私有仓库免费）。
- 页面已设置 `noindex`，不会被搜索引擎收录，但知道网址的人可以打开评委页的说明页（没有链接参数时无法看到任何评分）。
- Supabase 免费项目连续 7 天无访问会自动暂停，在控制台点 **Restore** 即可恢复；评审期间每天都有访问，不会暂停。评审结束后请导出 CSV 存档。
