document.addEventListener("DOMContentLoaded", () => {
    initializeCard();
});

document.addEventListener("pjax:complete", () => {
    initializeCard();
});

function initializeCard() {
    cardTimes();
    cardRefreshTimes();
}

let year, month, week, date, dates, weekStr, monthStr, asideTime, asideDay, asideDayNum, animalYear, ganzhiYear, lunarMon, lunarDay;
const now = new Date();

function cardRefreshTimes() {
    const e = document.getElementById("card-widget-schedule");
    if (e) {
        asideDay = (now - asideTime) / 1e3 / 60 / 60 / 24;
        e.querySelector("#pBar_year").value = asideDay;
        e.querySelector("#p_span_year").innerHTML = (asideDay / 365 * 100).toFixed(1) + "%";
        e.querySelector(".schedule-r0 .schedule-d1 .aside-span2").innerHTML = `还剩<a> ${(365 - asideDay).toFixed(0)} </a>天`;
        e.querySelector("#pBar_month").value = date;
        e.querySelector("#pBar_month").max = dates;
        e.querySelector("#p_span_month").innerHTML = (date / dates * 100).toFixed(1) + "%";
        e.querySelector(".schedule-r1 .schedule-d1 .aside-span2").innerHTML = `还剩<a> ${(dates - date)} </a>天`;
        e.querySelector("#pBar_week").value = week === 0 ? 7 : week;
        e.querySelector("#p_span_week").innerHTML = ((week === 0 ? 7 : week) / 7 * 100).toFixed(1) + "%";
        e.querySelector(".schedule-r2 .schedule-d1 .aside-span2").innerHTML = `还剩<a> ${(7 - (week === 0 ? 7 : week))} </a>天`;
    }
}

function cardTimes() {
    year = now.getFullYear();
    month = now.getMonth();
    week = now.getDay();
    date = now.getDate();

    const scheduleWidget = document.getElementById("card-widget-schedule");
    const calendarWidget = document.getElementById("card-widget-calendar");
    
    // 计算基础时间数据，无论哪个控件存在都需要计算
    const isLeapYear = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    weekStr = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][week];
    const monthData = [
        { month: "1月", days: 31 },
        { month: "2月", days: isLeapYear ? 29 : 28 },
        { month: "3月", days: 31 },
        { month: "4月", days: 30 },
        { month: "5月", days: 31 },
        { month: "6月", days: 30 },
        { month: "7月", days: 31 },
        { month: "8月", days: 31 },
        { month: "9月", days: 30 },
        { month: "10月", days: 31 },
        { month: "11月", days: 30 },
        { month: "12月", days: 31 }
    ];
    monthStr = monthData[month].month;
    dates = monthData[month].days;

    // 计算距离目标日期的天数
    const targetDate = new Date("2027/02/05 00:00:00");
    const daysUntilTarget = Math.floor((targetDate - now) / 1e3 / 60 / 60 / 24);
    
    // 计算本年已过天数
    asideTime = new Date(`${year}/01/01 00:00:00`);
    asideDay = (now - asideTime) / 1e3 / 60 / 60 / 24;
    asideDayNum = Math.floor(asideDay);
    const weekNum = week - asideDayNum % 7 >= 0 ? Math.ceil(asideDayNum / 7) : Math.ceil(asideDayNum / 7) + 1;
    
    // 更新日历控件（如果存在）
    if (calendarWidget) {
        // 生成日历表格
        const t = (week + 8 - date % 7) % 7;
        let n = "", d = false, s = 7 - t;
        const o = (dates - s) % 7 === 0 ? Math.floor((dates - s) / 7) + 1 : Math.floor((dates - s) / 7) + 2;
        const c = calendarWidget.querySelector("#calendar-main");
        const l = calendarWidget.querySelector("#calendar-date");

        l.style.fontSize = ["64px", "48px", "36px"][Math.min(o - 3, 2)];

        for (let i = 0; i < o; i++) {
            if (!c.querySelector(`.calendar-r${i}`)) {
                c.innerHTML += `<div class='calendar-r${i}'></div>`;
            }
            for (let j = 0; j < 7; j++) {
                if (i === 0 && j === t) {
                    n = 1;
                    d = true;
                }
                const r = n === date ? " class='now'" : "";
                if (!c.querySelector(`.calendar-r${i} .calendar-d${j} a`)) {
                    c.querySelector(`.calendar-r${i}`).innerHTML += `<div class='calendar-d${j}'><a${r}>${n}</a></div>`;
                }
                if (n >= dates) {
                    n = "";
                    d = false;
                }
                if (d) {
                    n += 1;
                }
            }
        }

        // 计算农历日期，使用try-catch防止chineseLunar未定义导致整个函数失败
        let animalYear = "", ganzhiYear = "", lunarMon = "", lunarDay = "";
        try {
            if (typeof chineseLunar !== 'undefined') {
                const lunarDate = chineseLunar.solarToLunar(new Date(year, month, date));
                animalYear = chineseLunar.format(lunarDate, "A");
                ganzhiYear = chineseLunar.format(lunarDate, "T").slice(0, -1);
                lunarMon = chineseLunar.format(lunarDate, "M");
                lunarDay = chineseLunar.format(lunarDate, "d");
            }
        } catch (error) {
            console.warn("chineseLunar is not available, skipping lunar date calculation:", error);
        }

        calendarWidget.querySelector("#calendar-week").innerHTML = `第${weekNum}周&nbsp;${weekStr}`;
        calendarWidget.querySelector("#calendar-date").innerHTML = date.toString().padStart(2, "0");
        calendarWidget.querySelector("#calendar-solar").innerHTML = `${year}年${monthStr}&nbsp;第${asideDay.toFixed(0)}天`;
        calendarWidget.querySelector("#calendar-lunar").innerHTML = `${ganzhiYear}${animalYear}年&nbsp;${lunarMon}${lunarDay}`;
    }
    
    // 更新进度条控件（如果存在）
    if (scheduleWidget) {
        const scheduleDaysElement = document.getElementById("schedule-days");
        const scheduleTitleElement = document.getElementById("schedule-title");
        
        if (daysUntilTarget <= 0) {
            scheduleDaysElement.innerHTML = "已到达";
            scheduleTitleElement.innerHTML = "目标日期";
        } else {
            scheduleDaysElement.innerHTML = daysUntilTarget;
            scheduleTitleElement.innerHTML = "距离目标日期";
        }
    }
}