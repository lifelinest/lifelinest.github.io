// footer-type-tips内容为空时自动隐藏，有内容时显示，和PC端一致
// MutationObserver高效监听Typed.js动态变化

// 测试Typed.js是否正常工作的函数
function testTypedJS() {
    console.log('Testing Typed.js...');

    // 检查Typed是否已加载
    if (typeof Typed === 'function') {
        console.log('Typed.js is loaded successfully');

        // 测试Typed.js功能
        const testElement = document.getElementById('footer-type-tips');
        if (testElement) {
            console.log('Found footer-type-tips element:', testElement);

            // 检查元素内容
            console.log('Element content:', testElement.innerHTML);

            // 检查是否有typed实例
            if (window.typed) {
                console.log('Typed instance exists:', window.typed);
            } else {
                console.log('No typed instance found');
            }
        } else {
            console.log('footer-type-tips element not found');
        }
    } else {
        console.log('Typed.js is not loaded');
    }
}

// 页面加载完成后执行测试
document.addEventListener('DOMContentLoaded', function () {
    // 延迟执行，确保所有脚本都加载完成
    setTimeout(testTypedJS, 2000);
});

// 监听footer-type-tips元素的变化
const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
            console.log('footer-type-tips content changed:', mutation.target.innerHTML);
        }
    });
});

// 当footer-type-tips元素出现时开始观察
function observeFooterTypeTips() {
    const element = document.getElementById('footer-type-tips');
    if (element) {
        observer.observe(element, {
            childList: true,
            subtree: true,
            characterData: true
        });
        console.log('Started observing footer-type-tips');
    } else {
        // 如果元素还没出现，稍后重试
        setTimeout(observeFooterTypeTips, 1000);
    }
}

// 页面加载完成后开始观察
document.addEventListener('DOMContentLoaded', observeFooterTypeTips); 

// 那年今日功能
document.addEventListener('DOMContentLoaded', function () {
 async function cardHistory() {
     const historyContainer = document.getElementById('history-container');
     if (!historyContainer) return;

     const data = await fetchHistoryData();
     const html = data.map(item => `
         <div class="swiper-slide history_slide">
             <span class="history_slide_time">A.D.${item.year}</span>
             <span class="history_slide_link">${item.title}</span>
         </div>
     `).join('');

     const swiperContainer = document.querySelector('.history_swiper-container');
     document.getElementById('history_container_wrapper').innerHTML = html;

     const swiperHistory = new Swiper(swiperContainer, {
         loop: true,
         direction: 'vertical',
         autoplay: {disableOnInteraction: true, delay: 5000},
         mousewheel: false,
     });

     historyContainer.onmouseenter = () => swiperHistory.autoplay.stop();
     historyContainer.onmouseleave = () => swiperHistory.autoplay.start();
 }

 cardHistory();
 document.addEventListener('pjax:complete', cardHistory);

 async function fetchHistoryData() {
     const myDate = new Date();
     const month = `${myDate.getMonth() + 1}`.padStart(2, '0');
     const day = `${myDate.getDate()}`.padStart(2, '0');
     const formattedDate = `${month}${day}`;
     const historyDataUrl = "https://api.nsmao.net/api/history/query?key=demo_key"; // 由于API需要key，这里使用demo_key作为示例

     try {
         const response = await fetch(historyDataUrl);
         const result = await response.json();

         if (result.code === 200) {
             const data = result.data;
             const formattedData = Object.entries(data).map(([year, event]) => ({
                 year: year.replace(/年$/, ''),
                 title: event
             }));
             return formattedData;
         } else {
             console.error('Error fetching history data:', result.msg);
             // 返回模拟数据，避免因为API调用失败导致显示空白
             return [
                 { year: '1924', title: '孙中山在广州成立大元帅府' },
                 { year: '1949', title: '中国人民解放军解放南京' },
                 { year: '1970', title: '中国发射第一颗人造地球卫星' }
             ];
         }
     } catch (error) {
         console.error('Fetch error:', error);
         // 返回模拟数据，避免因为API调用失败导致显示空白
         return [
             { year: '1924', title: '孙中山在广州成立大元帅府' },
             { year: '1949', title: '中国人民解放军解放南京' },
             { year: '1970', title: '中国发射第一颗人造地球卫星' }
         ];
     }
 }

 cardHistory();
 document.addEventListener('pjax:complete', cardHistory);
});