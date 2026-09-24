/*!
 * avatar-holiday.js —— 站点头像 · 中国法定节假日自动切换
 * -----------------------------------------------
 * 功能：默认显示普通版头像；当系统日期落在"中国法定节假日"时平滑切换为国旗版头像，
 *       假期结束自动恢复普通版头像。
 *
 * 判定口径（严格法定节假日，依据现行《全国年节及纪念日放假办法》2025 修订版）：
 *   - 元旦      1/1
 *   - 春节      除夕 ~ 初三（农历，共 4 天）
 *   - 清明节    清明节气当日（太阳黄经 = 15°，天文算法计算）
 *   - 劳动节    5/1 ~ 5/2
 *   - 端午节    农历五月初五
 *   - 中秋节    农历八月十五
 *   - 国庆节    10/1 ~ 10/3
 *
 * 说明：
 *   1. 该口径由"公历固定日 + 农历日期 + 节气"组成，可对任意年份自动计算，
 *      无需逐年维护放假/调休表，未来年份依旧有效；
 *   2. 农历日期依赖站点已在 <head> 全局加载的 chinese-lunar（1900~2100），
 *      若其加载失败则优雅降级为普通头像；
 *   3. 所有日期统一按中国标准时间（UTC+8）计算，海外访问者同样准确；
 *   4. 切换前对两图做预加载，主头像使用淡入淡出过渡，避免闪烁。
 */
(function () {
  'use strict';

  var AVATAR_NORMAL = 'https://cloudflare-img-bzb.pages.dev/file/系统/头像/1788956412205_头像.jpg';
  var AVATAR_FLAG = 'https://cloudflare-img-bzb.pages.dev/file/系统/头像/1788956411848_头像国旗版.jpg';

  /* ---------------- 日期工具（统一 UTC+8） ---------------- */

  // 某中国日期 00:00 对应的时间戳（毫秒）
  function cstDayStart(year, month, day) {
    return Date.UTC(year, month - 1, day) - 8 * 3600 * 1000;
  }
  // 时间戳 → 'YYYY-MM-DD'（中国日期）
  function toDateKey(ms) {
    return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  // 今天（中国日期）
  function todayKey() {
    return toDateKey(Date.now());
  }
  function addDays(ms, n) {
    return ms + n * 86400000;
  }

  /* ---------------- 天文部分：清明节气 ---------------- */

  var RAD = Math.PI / 180;

  // 太阳视黄经（低精度天文算法，精度约 0.01°，判定到"日"足够可靠）
  function solarLongitude(jd) {
    var T = (jd - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var Mr = M * RAD;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
      0.000289 * Math.sin(3 * Mr);
    var lon = L0 + C;
    lon -= 360 * Math.floor(lon / 360);
    return lon;
  }

  // 清明节气日（太阳黄经到达 15° 所在的中国日历日）
  function qingmingKey(year) {
    for (var day = 1; day <= 10; day++) {
      var ms = cstDayStart(year, 4, day);
      var jd = ms / 86400000 + 2440587.5;
      if (solarLongitude(jd) >= 15) return toDateKey(addDays(ms, -1));
    }
    return toDateKey(cstDayStart(year, 4, 5)); // 理论不可达，兜底
  }

  /* ---------------- 节假日集合 ---------------- */

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function keyOf(year, month, day) {
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function _lunar() {
    return (typeof window !== 'undefined' && window.chineseLunar) || null;
  }

  // 计算某阳历年份内全部"严格法定节假日"，返回 'YYYY-MM-DD' 数组
  function computeYearDates(year) {
    var set = {};
    var y = year;

    function add(key) { set[key] = 1; }
    function addLunarDates(lunarYear, month, day, count) {
      var lunar = _lunar();
      if (!lunar) return;
      // chinese-lunar 的 lunarToSolar(lunarYear, m, d)：返回该农历日对应的公历日期
      var base = lunar.lunarToSolar(lunarYear, month, day);
      if (!base) return;
      var ms = base.getTime();
      for (var i = 0; i < count; i++) {
        add(toDateKey(addDays(ms, i)));
      }
    }

    // 元旦
    add(keyOf(y, 1, 1));

    // 春节：除夕 ~ 初三（农历）。除夕 = 正月初一 - 1
    addLunarDates(y, 1, 1, 1); // 初一
    var c1 = _lunar() && _lunar().lunarToSolar(y, 1, 1);
    if (c1) add(toDateKey(addDays(c1.getTime(), -1))); // 除夕
    addLunarDates(y, 1, 1, 3); // 初一~初三（同上，去重）

    // 清明（节气当日）
    add(qingmingKey(y));

    // 劳动节
    add(keyOf(y, 5, 1));
    add(keyOf(y, 5, 2));

    // 端午（五月初五）
    addLunarDates(y, 5, 5, 1);

    // 中秋（八月十五）
    addLunarDates(y, 8, 15, 1);

    // 国庆节
    add(keyOf(y, 10, 1));
    add(keyOf(y, 10, 2));
    add(keyOf(y, 10, 3));

    return Object.keys(set).sort();
  }

  // 判断某中国日期 'YYYY-MM-DD' 是否为法定节假日
  function isHolidayDate(dateKey) {
    var y = parseInt(dateKey.slice(0, 4), 10);
    if (!_lunar() || isNaN(y)) return false;
    // 兼顾跨年边界，取前后三年集合
    for (var i = y - 1; i <= y + 1; i++) {
      var arr = computeYearDates(i);
      if (arr.indexOf(dateKey) >= 0) return true;
    }
    return false;
  }

  /* ---------------- 头像切换 ---------------- */

  var flagBrokenOn = ''; // 国旗图当天加载失败时记录，避免反复请求

  function preload(url) {
    var im = new Image();
    im.src = url;
  }

  // 非主头像：直接替换（图片已预加载，不会闪烁）
  function setDirect(img, target) {
    if ((img.getAttribute('src') || '') === target) return;
    img.src = target;
  }

  // 主头像（.avatar-img）：淡出 → 换源 → 淡入，保证平滑
  function setWithFade(img, target) {
    if ((img.getAttribute('src') || '') === target || img._avBusy) return;

    function cleanup() {
      img._avBusy = false;
      img.style.transition = '';
      img.style.opacity = '';
    }
    function fadeIn() {
      img.style.opacity = '1';
      setTimeout(cleanup, 260);
    }
    function onFail() {
      // 国旗图加载失败：回退普通头像，并当日不再重试
      img.removeEventListener('load', onLoad);
      img.src = AVATAR_NORMAL;
      flagBrokenOn = todayKey();
      fadeIn();
    }
    function onLoad() {
      img.removeEventListener('error', onFail);
      fadeIn();
    }

    img._avBusy = true;
    img.style.transition = 'opacity 0.22s ease';
    img.style.opacity = '0';
    setTimeout(function () {
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onFail, { once: true });
      img.src = target;
    }, 220);
  }

  function collectTargets() {
    var list = [];
    var imgs = document.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      if (img.classList.contains('avatar-img') || src === AVATAR_NORMAL || src === AVATAR_FLAG) {
        list.push(img);
      }
    }
    return list;
  }

  function refresh() {
    if (typeof document === 'undefined' || !document.getElementsByTagName) return;
    var dateKey = todayKey();
    // 支持 ?avatar_mode=flag|normal 手动预览（仅调试用；缺省时按法定节假日自动判定）
    var mode = null;
    try {
      var m = /[?&]avatar_mode=(flag|normal)/.exec(location.search);
      if (m) mode = m[1];
    } catch (e) { /* ignore */ }
    var inHoliday = mode ? mode === 'flag' : isHolidayDate(dateKey);
    if (inHoliday && flagBrokenOn === dateKey) inHoliday = false; // 国旗图当日不可用则保持普通

    var useFlag = inHoliday;
    var targets = collectTargets();
    for (var i = 0; i < targets.length; i++) {
      var target = useFlag ? AVATAR_FLAG : AVATAR_NORMAL;
      if (targets[i].classList.contains('avatar-img')) {
        setWithFade(targets[i], target);
      } else {
        setDirect(targets[i], target);
      }
    }
  }

  /* ---------------- 初始化 ---------------- */

  // 暴露纯函数，便于维护与单元测试
  if (typeof window !== 'undefined') {
    window.avatarHolidayCore = {
      isHolidayDate: isHolidayDate,
      computeYearDates: computeYearDates,
      todayKey: todayKey
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 预加载两张头像，避免切换时闪烁
  preload(AVATAR_NORMAL);
  preload(AVATAR_FLAG);

  if (!window.__avatarHolidayBound) {
    window.__avatarHolidayBound = true;
    document.addEventListener('DOMContentLoaded', refresh);
    window.addEventListener('load', refresh);
    window.addEventListener('pjax:complete', refresh);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });
    // 每分钟校准一次，覆盖页面跨零点/节假日开始结束瞬间
    setInterval(refresh, 60000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
