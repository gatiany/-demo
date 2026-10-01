// ============================================================
//  评审网站配置 —— 部署时只需要改这个文件
// ============================================================

// 1) Supabase 连接信息（Supabase 项目 → Project Settings → API）
//    两项都留空时，网站运行在“演示模式”：数据只保存在当前浏览器，用于试用和演示。
window.CONFIG = {
  SUPABASE_URL: "",        // 例如 "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",   // anon public key（eyJ 开头）或 publishable key（sb_publishable_ 开头）；可以公开，不是数据库密码

  TITLE: "英国中国商会成立25周年 · 在英中资企业优秀成果评审",
  DEADLINE: "2026年11月11日",
  CONTACT: "秘书处邮箱：info@chinachamber.org.uk",
};

// 2) 评分维度（与评分表一致）
window.DIMS = [
  { key: "d1", name: "实际成果与在英贡献", desc: "在英国经济、产业、就业、环境或社区方面取得实际成果", max: 30 },
  { key: "d2", name: "中英合作价值",       desc: "促进中英双方实质合作，形成明确的合作价值",           max: 25 },
  { key: "d3", name: "创新与示范性",       desc: "做法有创新，能为其他企业提供借鉴",                   max: 15 },
  { key: "d4", name: "持续性与推广潜力",   desc: "成果能够持续，具备复制或推广条件",                   max: 10 },
  { key: "d5", name: "证据完整与可核验性", desc: "材料完整、数据清楚，能够支撑主要成果",               max: 15 },
  { key: "d6", name: "案例表达与展示价值", desc: "主题明确、表达清晰，适合宣传展示",                   max: 5  },
];

// 3) 专项奖与申报类型的对应关系
window.AWARDS = {
  top:   { name: "卓越成果奖", count: 5 },
  special: [
    { name: "贸易投资合作奖",       types: ["贸易合作", "投资发展"] },
    { name: "金融与专业服务创新奖", types: ["专业服务"] },
    { name: "科技创新奖",           types: ["科技创新"] },
    { name: "绿色发展奖",           types: ["可持续发展"] },
    { name: "人文交流与社会责任奖", types: ["区域合作与地方发展", "社会责任与人文交流"] },
  ],
  merit: { name: "优秀成果奖", minScore: 60 },
};
