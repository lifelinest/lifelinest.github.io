document.addEventListener('DOMContentLoaded', function () {
    // 为时间线项目添加悬停效果
    document.querySelectorAll('.timeline-content').forEach(item => {
        item.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-8px)';
            this.style.boxShadow = '0 15px 35px rgba(31, 38, 135, 0.25)';
        });

        item.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';

            // 根据卡片位置恢复不同阴影效果
            const isEven = this.closest('.timeline-item').classList.contains('even');
            if (isEven) {
                this.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.15), 0 0 15px rgba(74, 159, 245, 0.2)';
            } else {
                this.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.15), 0 0 15px rgba(255, 126, 179, 0.2)';
            }
        });
    });

    // 标签悬停效果
    document.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('mouseenter', function () {
            this.style.transform = 'scale(1.05)';
        });

        tag.addEventListener('mouseleave', function () {
            this.style.transform = 'scale(1)';
        });
    });

    // 心电图动画效果增强
    const timeline = document.querySelector('.timeline');

    // 只在桌面端执行心电图动画
    if (window.innerWidth > 768 && timeline) {
        setInterval(() => {
            const pulse = document.createElement('div');
            pulse.style.position = 'absolute';
            pulse.style.left = '50%';
            pulse.style.top = '0';
            pulse.style.width = '3px';
            pulse.style.height = '20px';
            pulse.style.background = '#ff7eb3';
            pulse.style.transform = 'translateX(-50%)';
            pulse.style.zIndex = '1';
            pulse.style.boxShadow = '0 0 10px rgba(255, 126, 179, 0.5)';
            pulse.style.animation = 'heartbeat 1.8s forwards';
            timeline.appendChild(pulse);

            setTimeout(() => {
                pulse.remove();
            }, 1800);
        }, 2000);
    }
});