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