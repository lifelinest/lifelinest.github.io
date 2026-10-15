/* 拾光局 · 00 后回忆盲盒 · 零依赖
   设计：首访赠送 50 时光币（足够一次集齐，无「每日签到」墙）；单抽1 / 十连10 / 任务赚币；
   星运值保底（每抽 +12，满 100 必出隐藏款 SP）；
   盲盒四段开盒（摇晃蓄力 → 撕开封口 → 爆开迸发 → 卡片升起）；
   卡面真实图（CARD_IMG 按 id 配置，图未到前统一用牛皮纸纹占位）。
   配色跟随博客主题变量，稀有度颜色固定。音效 Web Audio 合成。 */
(function () {
  'use strict';

  /* ---------------- 卡片数据（00 后读书 / 童年回忆） ---------------- */
  var CARDS = [
    // N 普通
    { id: 'zhixin', name: '知音漫客', rarity: 'N', era: '2006', icon: '📚', desc: '每周守着的漫画杂志，连载《偷星九月天》《斗破苍穹》。' },
    { id: 'ashuai', name: '阿衰', rarity: 'N', era: '2003', icon: '😆', desc: '课桌底下的笑声，最便宜的快乐。' },
    { id: 'baoxiao', name: '爆笑校园', rarity: 'N', era: '2005', icon: '🤪', desc: '呆头的鬼马日常，上课偷看专用。' },
    { id: 'laofuzi', name: '老夫子', rarity: 'N', era: '1960s', icon: '🧓', desc: '最早接触的港式漫画，居然到现在还在出。' },
    { id: 'gushihui', name: '故事会', rarity: 'N', era: '1980', icon: '📖', desc: '偷看爸妈的，封面红彤彤。' },
    { id: 'duzhe', name: '读者', rarity: 'N', era: '1981', icon: '🍃', desc: '摘抄好词好句的本命，作文素材库。' },
    { id: 'qingnian', name: '青年文摘', rarity: 'N', era: '1981', icon: '✏️', desc: '和《读者》并称“摘抄双子星”。' },
    { id: 'wusan', name: '五三', rarity: 'N', era: '2004', icon: '📕', desc: '五年高考三年模拟，青春的痛。' },
    { id: 'bookcover', name: '包书皮', rarity: 'N', era: 'all', icon: '📔', desc: '开学第一件事，挂历纸最香。' },
    { id: 'doodle', name: '语文书涂鸦', rarity: 'N', era: 'all', icon: '✍️', desc: '课本角落的小人国，老师看了直摇头。' },
    { id: 'xinhua', name: '新华字典', rarity: 'N', era: '1953', icon: '🔤', desc: '查阅率最低，却永远最厚。' },
    { id: 'corner', name: '班级图书角', rarity: 'N', era: 'all', icon: '📚', desc: '轮流当管理员的小骄傲。' },
    { id: 'rent', name: '流动租书店', rarity: 'N', era: 'all', icon: '🏪', desc: '校门口 2 元一本的宝藏，按时还。' },
    { id: 'diandu', name: '点读机', rarity: 'N', era: '2002', icon: '🗣️', desc: '“哪里不会点哪里”，其实只想听声音。' },
    { id: 'penbox', name: '文具盲盒笔', rarity: 'N', era: '2010s', icon: '🖊️', desc: '抽中隐藏款笔的快乐，谁能懂。' },
    { id: 'sticker', name: '贴纸水晶贴', rarity: 'N', era: '2000s', icon: '🌟', desc: '贴满课本封面，亮晶晶。' },
    // R 稀有
    { id: 'xiaohu', name: '冒险小虎队', rarity: 'R', era: '2002', icon: '🕵️', desc: '带解密卡，对着灯光一照，答案就显形了。' },
    { id: 'maxiaotiao', name: '淘气包马小跳', rarity: 'R', era: '2003', icon: '🐎', desc: '杨红樱，女生的童年嘴替。' },
    { id: 'xiaomao', name: '笑猫日记', rarity: 'R', era: '2006', icon: '😺', desc: '会笑的猫，写满了心事。' },
    { id: 'pipilu', name: '皮皮鲁和鲁西西', rarity: 'R', era: '1985', icon: '🚀', desc: '郑渊洁的童话大王，不服管的孩子的圣经。' },
    { id: 'zuixiaoshuo', name: '最小说', rarity: 'R', era: '2006', icon: '📝', desc: '郭敬明，青春文学地标。' },
    { id: 'manyou', name: '漫友', rarity: 'R', era: '2002', icon: '🎨', desc: '动漫资讯大本营，攒一期不容易。' },
    { id: 'xiaoxiaomei', name: '意林·小小姐', rarity: 'R', era: '2009', icon: '🌸', desc: '女生的专属花园，偷偷传阅。' },
    { id: 'shuika', name: '干脆面水浒卡', rarity: 'R', era: '1999', icon: '🍜', desc: '小浣熊集卡，为一张卡吃掉整包面。' },
    { id: 'saier', name: '赛尔号攻略本', rarity: 'R', era: '2009', icon: '🛸', desc: '打游戏还要买书，认真的。' },
    { id: 'shiwange', name: '十万个为什么', rarity: 'R', era: '1961', icon: '❓', desc: '科普启蒙第一书，翻烂了。' },
    { id: 'xiaodou', name: '窗边的小豆豆', rarity: 'R', era: '1981', icon: '🪟', desc: '治愈系童年，巴学园真好。' },
    { id: 'chali', name: '查理九世', rarity: 'R', era: '2011', icon: '🗝️', desc: '墨多多谜境冒险，吓得又爱又怕。' },
    // SR 史诗
    { id: 'xiaobawang', name: '小霸王学习机', rarity: 'SR', era: '1989', icon: '🕹️', desc: '打着学习的旗号，插卡打魂斗罗。' },
    { id: 'wenquxing', name: '文曲星', rarity: 'SR', era: '1995', icon: '📟', desc: '电子词典里，最爱的还是俄罗斯方块。' },
    { id: 'qqpet', name: 'QQ宠物', rarity: 'SR', era: '2005', icon: '🐧', desc: '偷菜养企鹅的执念，还喂过元宝。' },
    { id: 'qqzone', name: '非主流QQ空间', rarity: 'SR', era: '2005', icon: '💿', desc: '火星文 + 闪字 + 伤感签名，青春的样子。' },
    { id: 'shuijing', name: '水晶宝宝', rarity: 'SR', era: '2000s', icon: '🔮', desc: '泡水变大的魔法珠子，泡了一整瓶。' },
    { id: 'zushou', name: '校门口租书摊', rarity: 'SR', era: 'all', icon: '🧑', desc: '那个记得你名字、赊账也借的老板。' },
    { id: 'shumeng', name: '数码宝贝图鉴', rarity: 'SR', era: '1999', icon: '🦖', desc: '“数码宝贝，进化！”喊到破音。' },
    { id: 'molly', name: '摩尔庄园攻略', rarity: 'SR', era: '2008', icon: '🍄', desc: '种蘑菇养拉姆，放学第一件事。' },
    // SSR 传说
    { id: 'kuaile', name: '快乐星球', rarity: 'SSR', era: '2004', icon: '🌍', desc: '“快乐星球”，在心里喊过 108 次。' },
    { id: 'wulin', name: '武林外传', rarity: 'SSR', era: '2006', icon: '⚔️', desc: '同福客栈的台词，到现在倒背。' },
    { id: 'jieshu', name: '借书证', rarity: 'SSR', era: 'all', icon: '🪪', desc: '人生第一张“身份证”，比身份证还早。' },
    { id: 'xinhua_store', name: '新华书店', rarity: 'SSR', era: 'all', icon: '🏬', desc: '避暑 + 蹭书圣地，一待一下午。' },
    // SP 隐藏
    { id: 'confiscated', name: '上课被没收', rarity: 'SP', era: 'all', icon: '🚫', desc: '书被老师收走的集体创伤，隐藏款。' },
    { id: 'shamate', name: '杀马特时代', rarity: 'SP', era: '2008', icon: '💇', desc: '五颜六色的非主流青春，隐藏款。' },
    { id: 'clearfilm', name: '透明书皮', rarity: 'SP', era: 'all', icon: '🫧', desc: '买教辅送的，包上像没包，隐藏款。' }
  ];

  // 盒面真实图：用户图未到前统一用牛皮纸纹占位；到图后按 id 填真实图床 URL
  var CARD_PLACEHOLDER = 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/1791716792981_sg-paper-texture.webp';
  // 盲盒机真实图：AI 生成的现代盲盒机（透明底，已上图床）。可随时替换为用户自出图。
  var MACHINE_IMG = 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/1791885289149_machine-bear.webp';
  var CARD_IMG = {
    'ashuai': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806855770_ashuai.webp',
    'baoxiao': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806864930_baoxiao.webp',
    'bookcover': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806868024_bookcover.webp',
    'chali': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806877430_chali.webp',
    'clearfilm': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806889969_clearfilm.webp',
    'confiscated': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806894559_confiscated.webp',
    'corner': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806898868_corner.webp',
    'diandu': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806904864_diandu.webp',
    'doodle': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806908331_doodle.webp',
    'duzhe': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806906295_duzhe.webp',
    'gushihui': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806906394_gushihui.webp',
    'jieshu': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806918052_jieshu.webp',
    'kuaile': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806920340_kuaile.webp',
    'laofuzi': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806925613_laofuzi.webp',
    'manyou': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806930577_manyou.webp',
    'maxiaotiao': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806935198_maxiaotiao.webp',
    'molly': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806931462_molly.webp',
    'penbox': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806943660_penbox.webp',
    'pipilu': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806937809_pipilu.webp',
    'qingnian': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806946004_qingnian.webp',
    'qqpet': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806953141_qqpet.webp',
    'qqzone': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806956209_qqzone.webp',
    'rent': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806960322_rent.webp',
    'saier': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806961959_saier.webp',
    'shamate': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806963544_shamate.webp',
    'shiwange': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806972672_shiwange.webp',
    'shuijing': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806976924_shuijing.webp',
    'shuika': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806978669_shuika.webp',
    'shumeng': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806983181_shumeng.webp',
    'sticker': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806986965_sticker.webp',
    'wenquxing': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806985208_wenquxing.webp',
    'wulin': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806990893_wulin.webp',
    'wusan': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806991530_wusan.webp',
    'xiaobawang': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791806999683_xiaobawang.webp',
    'xiaodou': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807003053_xiaodou.webp',
    'xiaohu': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807005994_xiaohu.webp',
    'xiaomao': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807007483_xiaomao.webp',
    'xiaoxiaomei': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807012386_xiaoxiaomei.webp',
    'xinhua': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807012962_xinhua.webp',
    'xinhua_store': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807014282_xinhua_store.webp',
    'zhixin': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807019149_zhixin.webp',
    'zuixiaoshuo': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807020996_zuixiaoshuo.webp',
    'zushou': 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox-cards/1791807025740_zushou.webp'
  };
  function cardImg(id) { return CARD_IMG[id] || CARD_PLACEHOLDER; }

  // 盒子外壳：密封 / 撕开 两张（用户从 Pacdora 生成的空白牛皮纸盲盒透明 PNG 到位后填）
  var BOX_IMG = {
    sealed: 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/1791885256673_box-closed.webp',
    open: 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/1791885263084_box-open.webp'
  };
  // 卡牌背面：开盒撕封后先露卡背，再翻正面
  var CARD_BACK_IMG = 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/1791885272824_card-back.webp';
  var B = 'https://cloudflare-img-bzb.pages.dev/file/%E4%B8%BB%E9%A2%98/%E8%A3%85%E9%A5%B0/2026/10/blindbox/';
  // 交互素材（UI×10）
  var UI_IMG = {
    buttonDraw: B + '1791885265521_button-draw.webp',
    loadingBall: B + '1791885289787_loading-ball.webp',
    resultCard: B + '1791885300598_result-card.webp',
    popupDetail: B + '1791885295193_popup-detail.webp',
    popupDuplicate: B + '1791885294258_popup-duplicate.webp',
    effectRare: B + '1791885274572_effect-rare.webp',
    shareTemplate: B + '1791885304241_share-template.webp',
    badgeAchievement: B + '1791885253300_badge-achievement.webp',
    emptyState: B + '1791885285570_empty-state.webp'
  };
  // 真实音效（可选）：把对应 kind 的 mp3/ogg 图床/本地 URL 填进来即启用；留空则该 kind 回退 Web Audio 合成音。
  // kind 取值：crank/n/r/sr/ssr/sp/tear
  var SFX_FILES = {
    'crank': '', 'tear': '',
    'n': '', 'r': '', 'sr': '', 'ssr': '', 'sp': ''
  };

  var RAR = {
    N: { label: 'N 普通', bar: '#8a93a6', confetti: 0, sound: 'n' },
    R: { label: 'R 稀有', bar: '#378ADD', confetti: 26, sound: 'r' },
    SR: { label: 'SR 史诗', bar: '#7F77DD', confetti: 44, sound: 'sr' },
    SSR: { label: 'SSR 传说', bar: '#EF9F27', confetti: 84, sound: 'ssr' },
    SP: { label: 'SP 隐藏', bar: '#D4537E', confetti: 92, sound: 'sp' }
  };

  var RARITY_WEIGHT = { N: 55, R: 30, SR: 12, SSR: 2.8, SP: 0.2 };
  var CONFETTI_COLORS = ['#378ADD', '#7F77DD', '#EF9F27', '#D4537E', '#1D9E75', '#E24B4A', '#534AB7'];
  var KEY = 'sg_gacha_v1';
  var TIMERS = [];
  var lastShared = null;
  var STAR_PER_DRAW = 12;   // 每次抽卡星运值 +12
  var STAR_MAX = 100;       // 满必出隐藏款
  var COIN_SINGLE = 1, COIN_TEN = 10;
  var START_COINS = 50;     // 首次访问即赠送，足够一次集齐全图鉴（已去除「每日签到」墙）
  var MILESTONE = [['10', 3], ['25', 5], ['43', 10]];
  // 时光币任务清单（任务弹层展示）：done 判定 + 可跳转动作
  // 注意：不再有「每日登录」签到任务；时光信由分享 / 暗号等任务即时开启，无需集齐 43 张
  var TASKS = [
    { key: 'share', ico: '📤', name: '复制分享链接', desc: '把拾光局分享给老同学 / 群里，也能立刻开启时光信', reward: 2, done: function () { return state.sharedBonus; }, go: function () { closeTask(); onShare(); }, goText: '去分享' },
    { key: 'code', ico: '🔑', name: '输入暗号', desc: '暗号是 00 后回忆关键词，输对立刻解锁隐藏款 +2 币并开启时光信', reward: 2, done: function () { return state.codeUnlocked; }, go: function () { closeTask(); focusCode(); }, goText: '去输入' },
    { key: 'm10', ico: '🏅', name: '集齐 10 张回忆', desc: '收集 10 张不同的回忆卡', reward: 3, target: 10, done: function () { return !!state.milestone['10']; } },
    { key: 'm25', ico: '🏆', name: '集齐 25 张回忆', desc: '收集 25 张不同的回忆卡', reward: 5, target: 25, done: function () { return !!state.milestone['25']; } },
    { key: 'm43', ico: '👑', name: '集齐 43 张回忆', desc: '集齐整本图鉴的成就奖励（时光信由分享 / 暗号任务开启，不必集齐）', reward: 10, target: 43, done: function () { return !!state.milestone['43']; } }
  ];

  /* ---------------- 状态 ---------------- */
  function todayStr() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function loadState() {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (!s) s = {};
    s.date = s.date || todayStr();
    if (typeof s.coins !== 'number') s.coins = START_COINS; // 首次访问赠送，足够一次集齐（去签到墙）
    if (typeof s.starLuck !== 'number') s.starLuck = 0;
    if (typeof s.pity !== 'number') s.pity = 0;
    if (!s.owned) s.owned = {};
    if (typeof s.draws !== 'number') s.draws = 0;
    if (!s.rarity) s.rarity = { N: 0, R: 0, SR: 0, SSR: 0, SP: 0 };
    if (typeof s.letterShown !== 'boolean') s.letterShown = false;
    if (typeof s.codeUnlocked !== 'boolean') s.codeUnlocked = false;
    if (typeof s.lastExtraTs !== 'number') s.lastExtraTs = 0;
    if (typeof s.dailyBonus !== 'boolean') s.dailyBonus = false;
    if (typeof s.sharedBonus !== 'boolean') s.sharedBonus = false;
    if (!s.milestone) s.milestone = {};
    if (!s.firstAt) s.firstAt = {}; // 每张卡「首次获得」时间戳；重复获得不覆盖
    // 跨天：刷新日期（每日签到已移除，dailyBonus 字段仅作兼容保留，不再产生任何奖励）
    if (s.date !== todayStr()) { s.date = todayStr(); s.dailyBonus = false; }
    return s;
  }
  var state = loadState();
  var busy = false; // 开盒动画期间锁住按钮，防连点双倍扣币
  function setBusy(b) { busy = b; if (el.single) el.single.disabled = b; if (el.ten) el.ten.disabled = b; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------------- 抽卡 ---------------- */
  function pickRarity() {
    if (state.starLuck >= STAR_MAX) { state.starLuck = 0; return 'SP'; } // 星运值满必出隐藏款
    if (state.pity >= 9) { // 软保底：连续 9 次 N，第 10 次必出 R 以上
      var pool = ['R', 'SR', 'SSR'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    var total = 0, k;
    for (k in RARITY_WEIGHT) total += RARITY_WEIGHT[k];
    var r = Math.random() * total;
    for (k in RARITY_WEIGHT) { r -= RARITY_WEIGHT[k]; if (r <= 0) return k; }
    return 'N';
  }
  function pickCard(rarity) {
    var pool = CARDS.filter(function (c) { return c.rarity === rarity; });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function drawOne() {
    var rarity = pickRarity();
    if (rarity === 'N') state.pity++; else state.pity = 0;
    state.starLuck = Math.min(STAR_MAX, state.starLuck + STAR_PER_DRAW);
    if (state.starLuck >= STAR_MAX) { rarity = 'SP'; state.starLuck = 0; state.pity = 0; } // 满星运必 SP
    return pickCard(rarity);
  }
  function drawTen() {
    var arr = [], hasR = false, i;
    for (i = 0; i < 10; i++) { var c = drawOne(); arr.push(c); if (c.rarity !== 'N') hasR = true; }
    if (!hasR) {
      var rp = CARDS.filter(function (c) { return c.rarity === 'R'; });
      arr[9] = rp[Math.floor(Math.random() * rp.length)];
      state.pity = 0;
    }
    return arr;
  }

  /* ---------------- 音效（Web Audio 合成） ---------------- */
  var AC = null;
  function actx() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
    return AC;
  }
  function blip(freq, dur, type, vol, delay) {
    var c = actx(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.value = vol || 0.05;
    o.connect(g); g.connect(c.destination);
    o.start(t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.stop(t0 + dur + 0.02);
  }
  function sfx(kind) {
    var f = SFX_FILES[kind];
    if (f) { try { var a = new Audio(f); a.volume = 0.5; a.play().catch(function () {}); return; } catch (e) {} }
    if (kind === 'crank') { blip(170, 0.05, 'square', 0.04); blip(200, 0.05, 'square', 0.04, 0.12); }
    else if (kind === 'n') { blip(420, 0.12, 'sine', 0.05); }
    else if (kind === 'r') { blip(440, 0.1, 'triangle', 0.05); blip(660, 0.14, 'triangle', 0.05, 0.1); }
    else if (kind === 'sr') { blip(440, 0.1, 'triangle', 0.05); blip(587, 0.1, 'triangle', 0.05, 0.09); blip(784, 0.16, 'triangle', 0.05, 0.18); }
    else if (kind === 'ssr') { [523, 659, 784, 1046].forEach(function (f, i) { blip(f, 0.18, 'sawtooth', 0.05, i * 0.1); }); }
    else if (kind === 'sp') { [784, 988, 1175, 1568].forEach(function (f, i) { blip(f, 0.16, 'sine', 0.05, i * 0.08); }); }
    else if (kind === 'tear') { blip(300, 0.08, 'sawtooth', 0.035); blip(520, 0.12, 'triangle', 0.04, 0.08); }
  }

  /* ---------------- DOM 引用 ---------------- */
  var el = {};
  var SG_IDS = {
    wrap: 'sg-wrap', machine: 'sg-machine', machineImg: 'sg-machine-img', machineCoins: 'sg-machine-coins', box: 'sg-box',
    single: 'sg-single', ten: 'sg-ten', coins: 'sg-coins',
    codeInput: 'sg-code-input', codeBtn: 'sg-code-btn', dex: 'sg-dex',
    dexBtn: 'sg-dex-btn',
    dexpop: 'sg-dexpop', dexpopClose: 'sg-dexpop-close',
    taskBtn: 'sg-task', taskpop: 'sg-taskpop', taskBody: 'sg-task-body', taskClose: 'sg-taskpop-close',
    codeClue: 'sg-code-clue', codeClueBtn: 'sg-code-clue-btn',
    statBars: 'sg-stat-bars', owned: 'sg-owned', total: 'sg-total', draws: 'sg-draws',
    overlay: 'sg-overlay', reveal: 'sg-reveal', rarglow: 'sg-rar-glow',
    hiddenBanner: 'sg-hidden-banner',     dropzone: 'sg-dropzone',
    fxRays: 'sg-fx-rays', fxFlash: 'sg-fx-flash', fxConfetti: 'sg-fx-confetti', tenSummary: 'sg-ten-summary',
    cardHost: 'sg-card-host', revealBtns: 'sg-reveal-btns',
    letter: 'sg-letter', letterClose: 'sg-letter-close',
    toast: 'sg-toast', reset: 'sg-reset', revealClose: 'sg-reveal-close',
    loading: 'sg-loading', badge: 'sg-badge', badgeText: 'sg-badge-text',
    detail: 'sg-detail', detailInner: 'sg-detail-inner', detailClose: 'sg-detail-close', detailBody: 'sg-detail-body',
    dup: 'sg-dup', dupInner: 'sg-dup-inner', dupClose: 'sg-dup-close', dupBody: 'sg-dup-body',
    sharepop: 'sg-sharepop', sharepopInner: 'sg-sharepop-inner', sharepopClose: 'sg-sharepop-close', sharepopBody: 'sg-sharepop-body',
    confirm: 'sg-confirm', confirmClose: 'sg-confirm-close', confirmOk: 'sg-confirm-ok', confirmCancel: 'sg-confirm-cancel', confirmDesc: 'sg-confirm-desc',
    coinpop: 'sg-coinpop', coinpopClose: 'sg-coinpop-close', coinpopGo: 'sg-coinpop-go'
  };
  function cacheEls() {
    el = {};
    Object.keys(SG_IDS).forEach(function (k) {
      el[k] = document.getElementById(SG_IDS[k]);
    });
  }

  /* ---------------- 渲染 ---------------- */
  // 旧版扭蛋机圆顶胶囊已移除；盲盒机改用 <img id="sg-machine-img">（见 MACHINE_IMG 常量）
  // 卡面统一用「背景图层 + emoji 兜底 + 扫光」结构：主题懒加载只劫持 <img>，背景图免疫，
  // 且即使图床图未到，稀有度渐变 + emoji 也像一张高级收藏卡（不再出现半透明/模糊消失）
  function cardInner(c) {
    var R = RAR[c.rarity];
    return '<div class="sg-card-top" style="background:' + R.bar + '"></div>' +
      '<div class="sg-card-body">' +
      '<div class="sg-card-art" style="--rar:' + R.bar + '">' +
        '<span class="sg-card-ico">' + (c.icon || '🎴') + '</span>' +
        '<div class="sg-card-pic" style="background-image:url(\'' + cardImg(c.id) + '\')"></div>' +
        '<div class="sg-card-shine"></div>' +
      '</div>' +
      '<div class="sg-card-name">' + c.name + '</div>' +
      '<div class="sg-card-rar" style="background:' + R.bar + '">' + R.label + '</div>' +
      '<div class="sg-card-era">' + c.era + '</div>' +
      '<div class="sg-card-desc">' + c.desc + '</div>' +
      '</div>';
  }
  // 卡图转背景图层（免疫主题懒加载）：返回 <div class="sg-pic" style="background-image:...">
  function picDiv(url, cls) {
    return '<div class="' + (cls || 'sg-pic') + '" style="background-image:url(\'' + url + '\')"></div>';
  }
  // 图鉴排序：已收集优先（组内保持 CARDS 原始顺序），未收集垫底
  function dexOrder() {
    return CARDS.slice().sort(function (a, b) {
      return (state.owned[a.id] ? 0 : 1) - (state.owned[b.id] ? 0 : 1);
    });
  }
  function refreshDex() { renderDex(); }
  function renderDex() {
    if (!el.dex) return;
    el.dex.innerHTML = '';
    var ordered = dexOrder();
    var ownedCount = Object.keys(state.owned).length;
    var h1 = document.createElement('div');
    h1.className = 'sg-dex-head';
    h1.textContent = '已收集 ' + ownedCount + ' 张';
    el.dex.appendChild(h1);
    var lockHeadDone = false;
    ordered.forEach(function (c) {
      var R = RAR[c.rarity];
      var slot = document.createElement('div');
      slot.className = 'sg-slot-card';
      slot.dataset.id = c.id;
      if (state.owned[c.id]) {
        slot.innerHTML = '<div class="sg-rar-bar" style="background:' + R.bar + '"></div>' +
          '<div class="sg-slot-face">' + picDiv(cardImg(c.id), 'sg-slot-pic') + '</div>' +
          '<div class="sg-slot-name">' + c.name + '</div>' +
          '<div class="sg-slot-rar" style="background:' + R.bar + '">' + c.rarity + '</div>';
        slot.title = c.name + ' · ' + c.desc;
      } else {
        if (!lockHeadDone) {
          lockHeadDone = true;
          var h2 = document.createElement('div');
          h2.className = 'sg-dex-head sg-dex-head-lock';
          h2.textContent = '未收集 ' + (CARDS.length - ownedCount) + ' 张 · 开盲盒收集';
          el.dex.appendChild(h2);
        }
        slot.className += ' locked';
        slot.innerHTML = '<div class="sg-rar-bar" style="background:' + R.bar + '"></div>' +
          '<div class="sg-slot-face"><div class="sg-slot-ph"><span>?</span></div></div>' +
          '<div class="sg-slot-name">？？？</div>' +
          '<div class="sg-slot-rar" style="background:' + R.bar + '">' + c.rarity + '</div>' +
          '<div class="sg-slot-lock">🔒</div>';
        slot.title = '未解锁 · ' + R.label + ' · 点击看获取方式';
      }
      el.dex.appendChild(slot);
    });
  }
  function renderStats() {
    if (!el.statBars) return;
    // 统计「已集齐去重数」：遍历 owned，按稀有度计数（不含重复抽取）
    var uniq = { N: 0, R: 0, SR: 0, SSR: 0, SP: 0 };
    Object.keys(state.owned).forEach(function (id) {
      var c = CARDS.filter(function (x) { return x.id === id; })[0];
      if (c && uniq[c.rarity] !== undefined) uniq[c.rarity]++;
    });
    // 各稀有度图鉴总数（从 CARDS 动态统计，增删卡片不用改这里）
    var total = { N: 0, R: 0, SR: 0, SSR: 0, SP: 0 };
    CARDS.forEach(function (c) { if (total[c.rarity] !== undefined) total[c.rarity]++; });
    var order = ['SSR', 'SR', 'R', 'N', 'SP'];
    el.statBars.innerHTML = '';
    order.forEach(function (k) {
      var R = RAR[k], v = uniq[k], t = total[k];
      var pct = t ? Math.min(100, Math.round(v / t * 100)) : 0;
      var row = document.createElement('div');
      row.className = 'sg-stat-row' + (t > 0 && v >= t ? ' done' : '');
      row.innerHTML = '<span class="sg-stat-name">' + R.label + '</span>' +
        '<span class="sg-stat-bar"><i style="width:' + pct + '%;background:' + R.bar + '"></i></span>' +
        '<span class="sg-stat-val"><b>' + v + '</b>/' + t + '</span>';
      el.statBars.appendChild(row);
    });
  }
  function updateChips() {
    if (el.coins) el.coins.textContent = state.coins;
    if (el.machineCoins) el.machineCoins.textContent = state.coins;
    if (el.owned) el.owned.textContent = Object.keys(state.owned).length;
    if (el.total) el.total.textContent = CARDS.length;
    if (el.draws) el.draws.textContent = state.draws;
  }
  function updateCoinsHint() {
    if (!el.cooldown) return;
    if (state.coins >= COIN_TEN) {
      el.cooldown.textContent = '时光币充足，单抽 / 十连随意。';
    } else if (state.coins >= COIN_SINGLE) {
      el.cooldown.textContent = '还差 ' + (COIN_TEN - state.coins) + ' 枚可十连，点「时光币任务」做任务赚币吧。';
    } else {
      el.cooldown.textContent = '时光币不足：点「时光币任务」做任务赚币（分享 +2 / 暗号 +2 / 集齐里程碑 +币）。';
    }
  }

  /* ---------------- 彩蛋 / 特效 ---------------- */
  // 首次获得时间（去重规则：重复获得不覆盖此记录）
  function fmtFirst(id) {
    var ts = state.firstAt && state.firstAt[id];
    if (!ts) return '';
    var d = new Date(ts);
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    TIMERS.push(setTimeout(function () { el.toast.classList.remove('show'); }, 1900));
  }
  function showBadge(text) {
    if (!el.badge) return;
    if (el.badgeText) el.badgeText.textContent = text;
    el.badge.classList.add('show');
    TIMERS.push(setTimeout(function () { if (el.badge) el.badge.classList.remove('show'); }, 2600));
  }
  function openDetail(id) {
    var c = CARDS.filter(function (x) { return x.id === id; })[0];
    if (!c || !el.detailBody) return;
    var R = RAR[c.rarity];
    if (!state.owned[c.id]) {
      el.detailBody.innerHTML =
        '<div class="sg-detail-face sg-detail-locked"><div class="sg-detail-ph"><span>?</span></div></div>' +
        '<div class="sg-detail-name">？？？</div>' +
        '<span class="sg-detail-rar" style="background:' + R.bar + '">' + R.label + '</span>' +
        '<div class="sg-detail-desc">这张回忆还没收集到。<br>💡 获取方式：<b>开盲盒</b>随机获得，<b>十连</b>更容易出 R 以上稀有度；集齐 10 / 25 / 43 张还有时光币奖励。</div>';
    } else {
      var first = fmtFirst(c.id);
      el.detailBody.innerHTML =
        '<div class="sg-detail-face">' + picDiv(cardImg(c.id), 'sg-detail-pic') + '</div>' +
        '<div class="sg-detail-name">' + c.name + '</div>' +
        '<span class="sg-detail-rar" style="background:' + R.bar + '">' + R.label + '</span>' +
        (first ? '<div class="sg-detail-first">🕰 首次获得：' + first + (state.owned[c.id] > 1 ? ' · 已收集 ' + state.owned[c.id] + ' 张（重复卡保留最先获得的那张）' : '') + '</div>' : '') +
        '<div class="sg-detail-desc">' + c.desc + '</div>';
    }
    if (el.detail) el.detail.classList.add('open');
  }
  function closeDetail() { if (el.detail) el.detail.classList.remove('open'); }
  function showDup(card) {
    if (!el.dupBody) return;
    var first = fmtFirst(card.id);
    el.dupBody.innerHTML =
      '<h3>重复卡 +1</h3>' +
      '<div class="sg-dup-row">' + picDiv(cardImg(card.id), 'sg-dup-pic') + '<div class="sg-dup-txt"><b>' + card.name + '</b><br><span style="color:var(--anzhiyu-secondbgtext,#999);font-size:12px;">已拥有 · 图鉴计数 +1' + (first ? ' · 保留 ' + first + ' 最先获得的那张' : '') + '</span></div></div>';
    if (el.dup) el.dup.classList.add('open');
    TIMERS.push(setTimeout(function () { if (el.dup) el.dup.classList.remove('open'); }, 2200));
  }
  function closeDup() { if (el.dup) el.dup.classList.remove('open'); }
  function openSharePop() {
    var id = lastShared;
    var c = id ? CARDS.filter(function (x) { return x.id === id; })[0] : null;
    if (!el.sharepopBody) return;
    var img = c ? cardImg(c.id) : UI_IMG.emptyState;
    el.sharepopBody.innerHTML =
      '<h3>分享你的拾光</h3>' +
      picDiv(img, 'sg-share-card') +
      '<button class="sg-btn sg-sharepop-copy" id="sg-sharepop-copy">复制分享链接</button>';
    if (el.sharepop) el.sharepop.classList.add('open');
    var copyBtn = document.getElementById('sg-sharepop-copy');
    if (copyBtn) copyBtn.onclick = copyShareUrl;
  }
  function closeSharePop() { if (el.sharepop) el.sharepop.classList.remove('open'); }
  function openDex() { if (el.dexpop) el.dexpop.classList.add('open'); }
  function closeDex() { if (el.dexpop) el.dexpop.classList.remove('open'); }
  function openTask() { renderTasks(); if (el.taskpop) el.taskpop.classList.add('open'); }
  function closeTask() { if (el.taskpop) el.taskpop.classList.remove('open'); }
  function renderTasks() {
    if (!el.taskBody) return;
    var ownedCount = Object.keys(state.owned).length;
    el.taskBody.innerHTML = '';
    TASKS.forEach(function (t) {
      var done = t.done();
      var right;
      if (done) right = '<div class="sg-task-done">✓ 已完成</div>';
      else if (t.go) right = '<button class="sg-task-go" data-task="' + t.key + '">' + t.goText + '</button>';
      else right = '<div class="sg-task-prog">' + Math.min(ownedCount, t.target) + '/' + t.target + '</div>';
      var row = document.createElement('div');
      row.className = 'sg-task' + (done ? ' done' : '');
      row.innerHTML = '<div class="sg-task-ico">' + t.ico + '</div>' +
        '<div class="sg-task-main"><div class="sg-task-name">' + t.name + '</div><div class="sg-task-desc">' + t.desc + '</div></div>' +
        '<div class="sg-task-right"><div class="sg-task-reward">+' + t.reward + ' 币</div>' + right + '</div>';
      el.taskBody.appendChild(row);
    });
    Array.prototype.forEach.call(el.taskBody.querySelectorAll('.sg-task-go'), function (b) {
      b.onclick = function () {
        var t = TASKS.filter(function (x) { return x.key === b.dataset.task; })[0];
        if (t && t.go) t.go();
      };
    });
  }
  function focusCode() {
    closeTask();
    if (!el.codeInput) return;
    try { el.codeInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    el.codeInput.focus();
    toast('暗号是 00 后回忆关键词 · 不会就点「💡 提示」');
  }
  function copyShareUrl() {
    var url = location.origin + location.pathname + (lastShared ? ('?card=' + lastShared) : '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () {}, function () { fallbackCopy(url); });
    else fallbackCopy(url);
    toast('已复制分享链接' + (lastShared ? '' : '（先抽一张再分享哦）'));
  }
  // 稀有度特效：卡牌光晕 + 全屏彩屑 + 屏闪(SSR/SP) + 光线 + 隐藏横幅 + 音效 + toast
  function applyRarityFx(card) {
    var R = RAR[card.rarity];
    sfx(R.sound);
    setHalo(card.rarity);
    if (R.confetti) spawnConfettiFx(R.confetti, card.rarity);
    if (card.rarity === 'SR' || card.rarity === 'SSR' || card.rarity === 'SP') spawnRays(card.rarity);
    if (card.rarity === 'SSR' || card.rarity === 'SP') screenFlash(card.rarity);
    if (card.rarity === 'SP') { showHiddenBanner(); toast('★ 隐藏款 GET ★ ' + card.name); }
    else if (card.rarity === 'SSR') { toast('★ SSR 传说 ★ ' + card.name); }
    else if (card.rarity === 'SR') { toast('✦ SR 史诗 ✦ ' + card.name); }
  }
  function setHalo(rarity) {
    if (!el.rarglow) return;
    var map = { N: 'rgba(138,147,166,0)', R: 'rgba(55,138,221,.55)', SR: 'rgba(127,119,221,.62)', SSR: 'rgba(239,159,39,.68)', SP: 'rgba(212,83,126,.66)' };
    el.rarglow.style.boxShadow = 'inset 0 0 80px ' + (map[rarity] || 'rgba(0,0,0,0)');
    el.rarglow.style.opacity = (rarity === 'N') ? '0' : '1';
  }
  function spawnConfettiFx(n, rarity) {
    var layer = el.fxConfetti; if (!layer) return;
    layer.innerHTML = '';
    var colors = CONFETTI_COLORS;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'sg-confetti';
      s.style.left = (Math.random() * 100) + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      layer.appendChild(s);
    }
    TIMERS.push(setTimeout(function () { if (layer) layer.innerHTML = ''; }, 2800));
  }
  function spawnRays(rarity) {
    var layer = el.fxRays; if (!layer) return;
    layer.className = 'sg-fx-rays sg-ray-' + rarity.toLowerCase();
    void layer.offsetWidth;
    layer.classList.add('go');
    TIMERS.push(setTimeout(function () { if (layer) layer.className = 'sg-fx-rays'; }, 1500));
  }
  function screenFlash(rarity) {
    if (!el.fxFlash) return;
    var col = rarity === 'SP' ? 'rgba(212,83,126,.45)' : 'rgba(239,159,39,.5)';
    el.fxFlash.style.background = 'radial-gradient(circle at 50% 45%,' + col + ',transparent 62%)';
    el.fxFlash.classList.remove('go'); void el.fxFlash.offsetWidth; el.fxFlash.classList.add('go');
  }
  function showHiddenBanner() {
    if (!el.hiddenBanner) return;
    el.hiddenBanner.classList.add('show');
    TIMERS.push(setTimeout(function () { if (el.hiddenBanner) el.hiddenBanner.classList.remove('show'); }, 2600));
  }
  function commitCard(card) {
    var before = Object.keys(state.owned).length;
    var isNew = !state.owned[card.id];
    // 去重规则：重复获得时保留「先获得的那一个」——首次记录不覆盖，仅计数 +1
    if (isNew && !state.firstAt[card.id]) state.firstAt[card.id] = Date.now();
    state.owned[card.id] = (state.owned[card.id] || 0) + 1;
    state.draws++;
    state.rarity[card.rarity]++;
    save();
    updateChips(); refreshDex(); renderStats();
    var after = Object.keys(state.owned).length;
    if (after > before) {
      MILESTONE.forEach(function (m) {
        if (after >= (+m[0]) && !state.milestone[m[0]]) {
          state.milestone[m[0]] = true;
          state.coins += m[1]; save(); updateChips();
          toast('集齐 ' + m[0] + ' 张 +' + m[1] + ' 时光币');
          showBadge('集齐 ' + m[0] + ' 张！');
        }
      });
    }
    if (after >= CARDS.length) { maybeOpenLetter(); }
  }

  /* ---------------- 揭示 ---------------- */
  var pendingLetter = false; // 抽卡集齐触发的时光信：等揭晓关闭后再开，避免盖在卡面上
  function openReveal() {
    if (el.fxConfetti) el.fxConfetti.innerHTML = '';
    if (el.hiddenBanner) el.hiddenBanner.classList.remove('show');
    if (el.rarglow) { el.rarglow.style.opacity = '0'; el.rarglow.style.boxShadow = 'none'; }
    if (el.cardHost) el.cardHost.innerHTML = '';
    if (el.revealBtns) el.revealBtns.innerHTML = '';
    if (el.tenSummary) el.tenSummary.classList.remove('show');
    if (el.dropzone) { el.dropzone.style.display = 'flex'; el.dropzone.innerHTML = ''; el.dropzone.style.minHeight = ''; }
    if (el.loading) el.loading.classList.remove('show');
    if (el.overlay) el.overlay.classList.add('open');
  }
  function closeReveal() {
    if (el.overlay) el.overlay.classList.remove('open');
    // 抽卡集齐触发时光信时，等揭晓关闭后再开信，避免信盖在卡面上
    if (pendingLetter) { pendingLetter = false; TIMERS.push(setTimeout(openLetter, 280)); }
  }

  // 盲盒单抽：蓄力摇晃 → 爆开迸发(光环) → 卡背 3D 翻面 → 稀有度分层特效
  function revealSingle(card, consume) {
    openReveal();
    var stage = el.dropzone;
    // 1) 盲盒蓄力摇晃
    var box = document.createElement('div');
    box.className = 'sg-box sg-box-shake';
    box.style.backgroundImage = 'url("' + BOX_IMG.sealed + '")';
    stage.appendChild(box);
    sfx('crank');
    // 2) 蓄力后爆开：盲盒炸开 + 光环，露出卡背
    TIMERS.push(setTimeout(function () {
      sfx('tear');
      box.classList.remove('sg-box-shake');
      box.classList.add('sg-box-burst');
      // 炸开后盲盒脱离 flex 文档流并原地居中，避免它仍以 flex 子项占位把卡片推偏（翻转后才发现卡片不居中）
      box.style.position = 'absolute';
      box.style.inset = '0';
      box.style.margin = 'auto';
      spawnBurst();
      var cardEl = document.createElement('div');
      cardEl.className = 'sg-card-single';
      cardEl.innerHTML = '<div class="sg-card-flip"><div class="sg-card-back" style="background-image:url(\'' + CARD_BACK_IMG + '\')"></div><div class="sg-card-front">' + cardInner(card) + '</div></div>';
      stage.appendChild(cardEl);
      stage.style.minHeight = '330px'; // 卡比摇晃阶段的盲盒高：撑高舞台把按钮自然下推，避免卡面盖住「收进图鉴」
      // 3) 翻面
      TIMERS.push(setTimeout(function () {
        cardEl.classList.add('flip');
        // 4) 翻面完成：特效 + 结算
        TIMERS.push(setTimeout(function () {
          applyRarityFx(card);
          if (consume) {
            var wasOwned = !!state.owned[card.id];
            commitCard(card);
            lastShared = card.id;
            if (wasOwned) showDup(card);
            setBusy(false);
          }
          if (el.revealBtns) {
            el.revealBtns.innerHTML = '';
            var b = document.createElement('button');
            b.className = 'sg-btn'; b.textContent = '收进图鉴';
            b.onclick = closeReveal;
            el.revealBtns.appendChild(b);
          }
        }, 640));
      }, 240));
    }, 950));
  }

  // 十连：稀有度升序渐次翻牌（最佳最后登场）→ 收尾按最佳稀有度放特效 + 新卡/重复汇总
  function revealTen(cards) {
    openReveal();
    if (el.dropzone) el.dropzone.style.display = 'none';
    var order = { N: 0, R: 1, SR: 2, SSR: 3, SP: 4 };
    var sorted = cards.slice().sort(function (a, b) { return order[a.rarity] - order[b.rarity]; });
    var grid = document.createElement('div');
    grid.className = 'sg-ten-grid';
    if (el.cardHost) { el.cardHost.innerHTML = ''; el.cardHost.appendChild(grid); }
    var tally = { new: 0, dup: 0, best: 'N' };
    var bestCard = null;
    sorted.forEach(function (c, i) {
      var cell = document.createElement('div');
      cell.className = 'sg-card-ten';
      cell.innerHTML = '<div class="sg-card-flip"><div class="sg-card-back" style="background-image:url(\'' + CARD_BACK_IMG + '\')"></div><div class="sg-card-front">' + cardInner(c) + '</div></div>';
      grid.appendChild(cell);
      TIMERS.push(setTimeout(function () {
        cell.classList.add('flip');
        sfx(RAR[c.rarity].sound);
        var wasOwned = !!state.owned[c.id];
        commitCard(c);
        lastShared = c.id;
        if (!wasOwned) tally.new++; else tally.dup++;
        if (order[c.rarity] >= order[tally.best]) { tally.best = c.rarity; bestCard = c; }
      }, 520 + i * 230));
    });
    var done = 520 + sorted.length * 230 + 680;
    TIMERS.push(setTimeout(function () {
      applyRarityFx(bestCard || sorted[sorted.length - 1]);
      showTenSummary(tally);
      if (el.revealBtns) {
        el.revealBtns.innerHTML = '';
        var b = document.createElement('button');
        b.className = 'sg-btn'; b.textContent = '全部收进图鉴';
        b.onclick = closeReveal;
        el.revealBtns.appendChild(b);
      }
      setBusy(false);
    }, done));
  }

  function spawnBurst() {
    var stage = el.dropzone; if (!stage) return;
    var ring = document.createElement('div');
    ring.className = 'sg-burst-ring';
    stage.appendChild(ring);
    TIMERS.push(setTimeout(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 820));
  }
  function showTenSummary(tally) {
    if (!el.tenSummary) return;
    var R = RAR[tally.best];
    el.tenSummary.innerHTML = '<span class="sg-ten-best" style="color:' + R.bar + '">最佳 ' + R.label + '</span> · 新卡 <b>' + tally.new + '</b> · 重复 <b>' + tally.dup + '</b>';
    el.tenSummary.classList.add('show');
  }

  /* ---------------- 动作 ---------------- */
  var rapidClicks = [];
  function onSingle() {
    if (busy) { registerRapid(); return; }
    if (el.overlay && el.overlay.classList.contains('open')) { toast('先收下当前的卡~'); return; }
    if (state.coins < COIN_SINGLE) { openCoinPop(); registerRapid(); return; }
    busy = true; setBusy(true);
    state.coins -= COIN_SINGLE; save();
    el.machine.classList.add('cranking');
    TIMERS.push(setTimeout(function () { el.machine.classList.remove('cranking'); }, 850));
    updateChips(); updateCoinsHint();
    var card = drawOne();
    revealSingle(card, true);
  }
  function registerRapid() {
    var now = Date.now();
    rapidClicks.push(now);
    rapidClicks = rapidClicks.filter(function (t) { return now - t < 3000; });
    if (rapidClicks.length >= 5) { toast('手速太快啦，歇会儿~'); rapidClicks = []; }
  }
  function onTen() {
    if (busy) { registerRapid(); return; }
    if (el.overlay && el.overlay.classList.contains('open')) { toast('先收下当前的卡~'); return; }
    if (state.coins < COIN_TEN) { openCoinPop(); return; }
    busy = true; setBusy(true);
    state.coins -= COIN_TEN; save();
    updateChips(); updateCoinsHint();
    revealTen(drawTen());
  }
  function onShare() {
    var id = lastShared;
    var url = location.origin + location.pathname + (id ? ('?card=' + id) : '');
    var done = function () {
      toast('已复制分享链接' + (id ? '' : '（先抽一张再分享哦）'));
      if (!state.sharedBonus) {
        state.sharedBonus = true; state.coins += 2; save(); updateChips(); updateCoinsHint();
        toast('分享奖励 +2 时光币');
        maybeOpenLetter();
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
    } else { fallbackCopy(url); done(); }
    openSharePop();
  }
  function fallbackCopy(t) {
    try {
      var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e) {}
  }
  function onCode() {
    var v = (el.codeInput && el.codeInput.value || '').trim();
    var keys = ['火星文', '非主流', '杀马特', '回忆', '童年'];
    if (keys.indexOf(v) === -1) { toast('暗号不对，再想想~'); return; }
    if (state.codeUnlocked) { toast('隐藏款你已经解锁过啦'); return; }
    state.codeUnlocked = true;
    state.coins += 2; save(); updateChips(); updateCoinsHint();
    var sp = CARDS.filter(function (c) { return c.rarity === 'SP'; });
    var card = sp[Math.floor(Math.random() * sp.length)];
    toast('暗号正确！解锁隐藏款 +2 时光币');
    busy = true; setBusy(true);
    // 先放开奖动画再触信：revealSingle 会同步打开揭晓层，maybeOpenLetter 检测到 overlay 已开会把信推迟到揭晓关闭后，避免信盖在卡面上
    revealSingle(card, true);
    maybeOpenLetter();
  }
  function openCoinPop() { if (el.coinpop) el.coinpop.classList.add('open'); }
  function closeCoinPop() { if (el.coinpop) el.coinpop.classList.remove('open'); }
  // 时光信：完成分享 / 暗号等任务即时开启（或集齐兜底），不再要求"集齐 43 张"、不再延迟到下次
  function maybeOpenLetter() {
    var ownedAll = Object.keys(state.owned).length >= CARDS.length;
    if (!state.letterShown && (state.sharedBonus || state.codeUnlocked || ownedAll)) {
      state.letterShown = true; save();
      refreshCodeBtn(); // 解锁后按钮立即变「查看」
      // 若正在揭晓（抽卡集齐触发），先把信推迟到揭晓关闭后再开，避免盖在卡面上；否则立即开
      if (el.overlay && el.overlay.classList.contains('open')) { pendingLetter = true; return; }
      closeSharePop(); closeTask(); closeDetail(); closeDup(); closeConfirm(); closeCoinPop();
      TIMERS.push(setTimeout(openLetter, 600));
    }
  }
  function openLetter() { if (el.letter) el.letter.classList.add('open'); }
  // 查看时光信：仅用于已解锁后的「重新阅读」，关掉可能遮挡的其他弹层再弹信（时光信 z-index 9990 须为最高层）
  function viewLetter() {
    closeSharePop(); closeTask(); closeReveal(); closeDetail(); closeDup(); closeConfirm(); closeCoinPop();
    openLetter();
  }
  // 解锁按钮 ↔ 查看按钮：时光信一旦被打开过（letterShown），按钮变「查看」并改为重新弹信；否则保持「解锁」走暗号流程
  function refreshCodeBtn() {
    if (!el.codeBtn) return;
    if (state.letterShown) {
      el.codeBtn.textContent = '查看';
      el.codeBtn.onclick = viewLetter;
    } else {
      el.codeBtn.textContent = '解锁';
      el.codeBtn.onclick = onCode;
    }
  }
  function openConfirm() {
    var n = Object.keys(state.owned).length;
    if (el.confirmDesc) el.confirmDesc.innerHTML = '你辛苦收集的 <b>' + n + '</b> 张回忆卡会全部离开拾光局，时光币、星运值也会一起回到起点…';
    if (el.confirm) el.confirm.classList.add('open');
  }
  function closeConfirm() { if (el.confirm) el.confirm.classList.remove('open'); }
  function doReset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    state = loadState();
    save();
    refreshDex(); renderStats(); updateChips(); updateCoinsHint();
    refreshCodeBtn(); // 清零后按钮恢复「解锁」
    closeConfirm();
    toast('回忆已清零，拾光局重新亮灯啦 ✨ 去开新一盒吧～');
  }
  function onReset() { openConfirm(); }
  function handleShareCard() {
    var m = location.search.match(/[?&]card=([^&]+)/);
    if (!m) return;
    var card = CARDS.filter(function (c) { return c.id === m[1]; })[0];
    if (!card) return;
    revealSingle(card, false);
    toast('来自分享 · ' + card.name);
  }
  function dateEgg() {
    var d = new Date();
    if (d.getMonth() === 5 && d.getDate() === 1) { toast('儿童节快乐！今天抽卡欧气加倍 🎈'); }
  }

  /* ---------------- 绑定 ---------------- */
  var onKeyEsc = null;
  function bindEvents() {
    if (!el.wrap.dataset.sgListeners) {
      if (el.codeInput) el.codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onCode(); });
      if (el.overlay) el.overlay.addEventListener('click', function (e) { if (e.target === el.overlay) closeReveal(); });
      if (el.dex) { el.dex.addEventListener('click', function (e) { var s = e.target.closest ? e.target.closest('.sg-slot-card') : null; if (s && s.dataset.id) openDetail(s.dataset.id); }); }
      if (el.dexpop) el.dexpop.addEventListener('click', function (e) { if (e.target === el.dexpop) closeDex(); });
      if (el.taskpop) el.taskpop.addEventListener('click', function (e) { if (e.target === el.taskpop) closeTask(); });
      if (el.coinpop) el.coinpop.addEventListener('click', function (e) { if (e.target === el.coinpop) closeCoinPop(); });
      if (el.confirm) el.confirm.addEventListener('click', function (e) { if (e.target === el.confirm) closeConfirm(); });
      if (el.letter) el.letter.addEventListener('click', function (e) { if (e.target === el.letter) el.letter.classList.remove('open'); });
      onKeyEsc = function (e) { if (e.key === 'Escape') { closeReveal(); closeDex(); closeTask(); closeConfirm(); if (el.letter) el.letter.classList.remove('open'); closeCoinPop(); closeDetail(); closeDup(); closeSharePop(); } };
      document.addEventListener('keydown', onKeyEsc);
      el.wrap.dataset.sgListeners = '1';
    }
    if (el.single) el.single.onclick = onSingle;
    if (el.ten) el.ten.onclick = onTen;
    refreshCodeBtn();
    if (el.reset) el.reset.onclick = onReset;
    if (el.revealClose) el.revealClose.onclick = closeReveal;
    if (el.letterClose) el.letterClose.onclick = function () { if (el.letter) el.letter.classList.remove('open'); };
    if (el.detailClose) el.detailClose.onclick = closeDetail;
    if (el.dupClose) el.dupClose.onclick = closeDup;
    if (el.sharepopClose) el.sharepopClose.onclick = closeSharePop;
    if (el.dexBtn) el.dexBtn.onclick = openDex;
    if (el.taskBtn) el.taskBtn.onclick = openTask;
    if (el.dexpopClose) el.dexpopClose.onclick = closeDex;
    if (el.taskClose) el.taskClose.onclick = closeTask;
    if (el.taskpopClose) el.taskpopClose.onclick = closeTask;
    if (el.confirmClose) el.confirmClose.onclick = closeConfirm;
    if (el.confirmCancel) el.confirmCancel.onclick = closeConfirm;
    if (el.confirmOk) el.confirmOk.onclick = doReset;
    if (el.coinpopClose) el.coinpopClose.onclick = closeCoinPop;
    if (el.coinpopGo) el.coinpopGo.onclick = function () { closeCoinPop(); openTask(); };
    if (el.codeClueBtn && el.codeClue) el.codeClueBtn.onclick = function () {
      el.codeClue.classList.toggle('show');
      this.textContent = el.codeClue.classList.contains('show') ? '收起线索' : '💡 提示';
    };
  }
  function cleanup() {
    TIMERS.forEach(function (t) { clearTimeout(t); });
    TIMERS = [];
    if (onKeyEsc) { document.removeEventListener('keydown', onKeyEsc); onKeyEsc = null; }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    var wrap = document.getElementById('sg-wrap');
    if (!wrap) return;
    cacheEls();
    if (el.machineImg) { el.machineImg.removeAttribute('data-lazy-src'); el.machineImg.removeAttribute('data-lazy-srcset'); el.machineImg.src = MACHINE_IMG; }
    // 已移除「每日签到 +1」：首次访问即由 loadState 赠送 START_COINS，访客一次访问即可集齐，无需等待次日
    save(); // 首访立即持久化（把赠送的 START_COINS 等默认状态落盘，避免刷新前 localStorage 为空）
    refreshDex(); renderStats(); updateChips(); updateCoinsHint();
    bindEvents();
    handleShareCard();
    dateEgg();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  if (!window.__sgPjaxBound) {
    window.__sgPjaxBound = true;
    document.addEventListener('pjax:complete', boot);
    document.addEventListener('pjax:beforeReplace', cleanup);
  }
})();
