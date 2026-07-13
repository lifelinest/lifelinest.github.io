/**
 * 文章加密遮罩功能
 * 实现文章密码保护功能
 */

class ArticleEncryption {
  constructor() {
    this.maxAttempts = 3;
    this.attempts = 0;
    this.correctPassword = '';
    this.isEncrypted = false;
    this.init();
  }

  init() {
    // 检查是否为加密文章
    this.checkIfEncrypted();

    if (this.isEncrypted) {
      this.setupEventListeners();
      this.loadStoredPassword();

      // 滚动到页面顶部，显示文章标题等信息
      setTimeout(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }, 100);
    }
  }

  checkIfEncrypted() {
    // 检查文章是否包含加密标记
    const encryptionMask = document.getElementById('article-encryption-mask');
    if (encryptionMask) {
      this.isEncrypted = true;
      // 从页面数据中获取密码
      this.correctPassword = this.getPasswordFromPage();
    }
  }

  getPasswordFromPage() {
    // 从页面传递的密码数据中获取
    return window.articlePassword || 'markdown123';
  }

  getHintFromPage() {
    // 从页面传递的提示数据中获取
    const hint = window.articleHint || '请输入密码';
    console.log('Debug - getHintFromPage:', hint);
    return hint;
  }

  setupEventListeners() {
    const unlockButton = document.getElementById('unlock-button');
    const passwordInput = document.getElementById('password-input');
    const passwordToggle = document.getElementById('password-toggle');
    const relockButton = document.getElementById('relock-button');
    const mobileTocButton = document.getElementById('mobile-toc-button');

    if (unlockButton) {
      unlockButton.addEventListener('click', () => this.handleUnlock());
    }

    if (passwordInput) {
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleUnlock();
        }
      });

      // 输入时隐藏错误信息
      passwordInput.addEventListener('input', () => {
        this.hideError();
      });
    }

    if (passwordToggle) {
      passwordToggle.addEventListener('click', () => this.togglePasswordVisibility());
    }

    if (relockButton) {
      relockButton.addEventListener('click', () => this.handleRelock());
    }

    // 处理移动端目录按钮
    if (mobileTocButton) {
      mobileTocButton.addEventListener('click', () => this.handleMobileTocClick());
    }
  }

  handleUnlock() {
    const passwordInput = document.getElementById('password-input');
    const inputPassword = passwordInput.value.trim();

    // 情况1：输入框为空
    if (!inputPassword) {
      this.showEmptyInputMessage();
      return;
    }

    // 情况2：密码错误
    if (inputPassword !== this.correctPassword) {
      this.handleWrongPassword();
      return;
    }

    // 密码正确
    this.unlockArticle();
  }

  showEmptyInputMessage() {
    this.showError('🐾 小爪子在输入框挠了挠...<br>喵？密码碗里空空如也！<br>快填满小鱼干密码呀~');
  }

  handleWrongPassword() {
    const passwordInput = document.getElementById('password-input');

    // 增加尝试次数
    this.attempts++;
    const remainingAttempts = this.maxAttempts - this.attempts;



    // 清空输入框并重新聚焦
    passwordInput.value = '';
    passwordInput.focus();

    if (remainingAttempts > 0) {
      // 还有机会
      this.showWrongPasswordMessage(remainingAttempts);
    } else {
      // 没有机会了，锁定
      this.showLockedMessage();
      this.disableInput();
      this.showReturnHomeButton();
    }
  }

  showWrongPasswordMessage(remainingAttempts) {
    const articleHint = this.getHintFromPage();
    console.log('Debug - showWrongPasswordMessage - articleHint:', articleHint, 'remainingAttempts:', remainingAttempts);

    const messages = [
      "🦊 哎呀脑瓜疼！密码好像不对呢~(还有2次机会)",
      `🐶 汪！密码藏在这条线索里：<br><strong>${articleHint}</strong>！(最后1次机会)`
    ];

    const messageIndex = this.maxAttempts - remainingAttempts - 1;
    console.log('Debug - messageIndex:', messageIndex, 'message:', messages[messageIndex]);
    this.showError(messages[messageIndex]);
  }

  showLockedMessage() {
    this.showError('🦉 叮！文章进入睡眠模式💤<br>猜密码游戏结束啦~<br>点击下方按钮返回精灵城堡🏰');
  }

  unlockArticle() {
    const encryptionMask = document.getElementById('article-encryption-mask');
    const articleContent = document.getElementById('article-content');
    const relockButton = document.getElementById('relock-button');
    const tocEncryptionMask = document.getElementById('toc-encryption-mask');
    const tocContent = document.getElementById('toc-content');

    if (encryptionMask && articleContent) {
      // 显示成功消息
      this.showSuccessMessage();

      // 保存解锁状态到localStorage
      this.saveUnlockStatus();

      // 隐藏正文遮罩
      encryptionMask.style.opacity = '0';
      encryptionMask.style.transform = 'scale(0.95)';

      // 隐藏目录遮罩
      if (tocEncryptionMask) {
        tocEncryptionMask.style.opacity = '0';
        tocEncryptionMask.style.transform = 'scale(0.95)';
      }

      setTimeout(() => {
        encryptionMask.style.display = 'none';

        if (tocEncryptionMask) {
          tocEncryptionMask.style.display = 'none';
        }

        // 显示正文内容
        articleContent.style.display = 'block';
        setTimeout(() => {
          articleContent.classList.add('show');
        }, 50);

        // 显示目录内容
        if (tocContent) {
          tocContent.style.display = 'block';
        }

        // 显示重新加锁按钮
        if (relockButton) {
          relockButton.style.display = 'flex';
        }
      }, 300);
    }
  }

  showSuccessMessage() {
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    if (errorMessage && errorText) {
      errorText.innerHTML = '✨ 芝麻开门！奖励你一个脑瓜崩~';
      errorMessage.style.display = 'flex';
      errorMessage.style.background = 'rgba(34, 197, 94, 0.1)';
      errorMessage.style.borderColor = 'rgba(34, 197, 94, 0.2)';
      errorMessage.style.color = '#16a34a';

      // 添加成功动画
      errorMessage.style.animation = 'none';
      setTimeout(() => {
        errorMessage.style.animation = 'successBounce 0.6s ease-in-out';
      }, 10);
    }
  }

  handleRelock() {
    const encryptionMask = document.getElementById('article-encryption-mask');
    const articleContent = document.getElementById('article-content');
    const relockButton = document.getElementById('relock-button');
    const tocEncryptionMask = document.getElementById('toc-encryption-mask');
    const tocContent = document.getElementById('toc-content');
    const passwordInput = document.getElementById('password-input');

    if (encryptionMask && articleContent) {
      // 清除本地解锁状态
      this.clearUnlockStatus();

      // 隐藏正文内容和重新加锁按钮
      articleContent.style.display = 'none';
      articleContent.classList.remove('show');
      relockButton.style.display = 'none';

      // 隐藏目录内容
      if (tocContent) {
        tocContent.style.display = 'none';
      }

      // 显示遮罩
      encryptionMask.style.display = 'flex';
      encryptionMask.style.opacity = '1';
      encryptionMask.style.transform = 'scale(1)';

      if (tocEncryptionMask) {
        tocEncryptionMask.style.display = 'block';
        tocEncryptionMask.style.opacity = '1';
        tocEncryptionMask.style.transform = 'scale(1)';
      }

      // 清空密码输入框并获取焦点
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }

      // 重置尝试次数
      this.attempts = 0;

      // 重新启用输入框
      this.enableInput();

      // 移除返回主页按钮
      this.removeReturnHomeButton();
    }
  }

  showError(message) {
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    if (errorMessage && errorText) {
      errorText.innerHTML = message;
      errorMessage.style.display = 'flex';
      // 重置为错误样式
      errorMessage.style.background = 'rgba(239, 68, 68, 0.1)';
      errorMessage.style.borderColor = 'rgba(239, 68, 68, 0.2)';
      errorMessage.style.color = '#dc2626';

      // 添加抖动动画
      errorMessage.style.animation = 'none';
      setTimeout(() => {
        errorMessage.style.animation = 'errorShake 0.5s ease-in-out';
      }, 10);
    }
  }

  hideError() {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
      errorMessage.style.display = 'none';
    }
  }

  disableInput() {
    const passwordInput = document.getElementById('password-input');
    const unlockButton = document.getElementById('unlock-button');

    if (passwordInput) passwordInput.disabled = true;
    if (unlockButton) unlockButton.disabled = true;
  }

  enableInput() {
    const passwordInput = document.getElementById('password-input');
    const unlockButton = document.getElementById('unlock-button');

    if (passwordInput) passwordInput.disabled = false;
    if (unlockButton) unlockButton.disabled = false;
  }

  showReturnHomeButton() {
    // 检查是否已经存在返回主页按钮
    if (document.getElementById('return-home-button')) {
      return;
    }

    // 创建返回主页按钮
    const returnButton = document.createElement('button');
    returnButton.id = 'return-home-button';
    returnButton.className = 'return-home-button';
    returnButton.innerHTML = '<i class="anzhiyufont anzhiyu-icon-home button-icon"></i><span>返回精灵城堡🏰</span>';
    returnButton.onclick = () => window.location.href = '/';

    // 插入到解锁按钮位置
    const unlockButton = document.getElementById('unlock-button');
    if (unlockButton) {
      unlockButton.parentNode.insertBefore(returnButton, unlockButton.nextSibling);
    }
  }

  removeReturnHomeButton() {
    const returnButton = document.getElementById('return-home-button');
    if (returnButton) {
      returnButton.remove();
    }
  }

  togglePasswordVisibility() {
    const passwordInput = document.getElementById('password-input');
    const passwordToggle = document.getElementById('password-toggle');

    if (passwordInput && passwordToggle) {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        passwordToggle.textContent = '👁️';
      } else {
        passwordInput.type = 'password';
        passwordToggle.textContent = '🙈';
      }
    }
  }

  saveUnlockStatus() {
    try {
      const currentUrl = window.location.pathname;
      const unlockStatus = JSON.parse(localStorage.getItem('articleUnlockStatus') || '{}');
      unlockStatus[currentUrl] = {
        unlocked: true,
        timestamp: Date.now()
      };
      localStorage.setItem('articleUnlockStatus', JSON.stringify(unlockStatus));
    } catch (error) {
      console.warn('Failed to save unlock status:', error);
    }
  }

  clearUnlockStatus() {
    try {
      const currentUrl = window.location.pathname;
      const unlockStatus = JSON.parse(localStorage.getItem('articleUnlockStatus') || '{}');
      delete unlockStatus[currentUrl];
      localStorage.setItem('articleUnlockStatus', JSON.stringify(unlockStatus));
    } catch (error) {
      console.warn('Failed to clear unlock status:', error);
    }
  }

  handleMobileTocClick() {
    // 如果文章未解锁，阻止移动端目录按钮的默认行为
    const tocContent = document.getElementById('toc-content');
    const tocEncryptionMask = document.getElementById('toc-encryption-mask');

    if (tocContent && tocContent.style.display === 'none' && tocEncryptionMask) {
      // 文章未解锁，显示提示
      this.showMobileTocHint();
      return false;
    }

    // 文章已解锁，允许正常显示目录
    return true;
  }

  showMobileTocHint() {
    // 显示移动端目录提示
    const hint = document.createElement('div');
    hint.className = 'mobile-toc-hint';
    hint.innerHTML = `
      <div class="hint-content">
        <i class="anzhiyufont anzhiyu-icon-lock"></i>
        <span>请先解锁文章查看目录</span>
      </div>
    `;
    hint.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--anzhiyu-card-bg);
      border: var(--style-border);
      border-radius: 8px;
      padding: 16px 20px;
      z-index: 10000;
      box-shadow: var(--anzhiyu-shadow-border);
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--anzhiyu-fontcolor);
      font-size: 14px;
    `;

    document.body.appendChild(hint);

    // 3秒后自动移除
    setTimeout(() => {
      if (hint.parentNode) {
        hint.parentNode.removeChild(hint);
      }
    }, 3000);
  }

  loadStoredPassword() {
    try {
      const currentUrl = window.location.pathname;
      const unlockStatus = JSON.parse(localStorage.getItem('articleUnlockStatus') || '{}');
      const status = unlockStatus[currentUrl];

      if (status && status.unlocked) {
        // 检查是否在24小时内解锁过
        const now = Date.now();
        const unlockTime = status.timestamp;
        const hoursDiff = (now - unlockTime) / (1000 * 60 * 60);

        if (hoursDiff < 24) {
          // 自动解锁
          setTimeout(() => {
            this.unlockArticle();
          }, 100);
        } else {
          // 超过24小时，清除状态
          this.clearUnlockStatus();
        }
      }
    } catch (error) {
      console.warn('Failed to load unlock status:', error);
    }
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ArticleEncryption();
  });
} else {
  new ArticleEncryption();
} 