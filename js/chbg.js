function saveData(name, data) {
  localStorage.setItem(name, JSON.stringify({ time: Date.now(), data: data }));
}

function loadData(name, time) {
  let data = JSON.parse(localStorage.getItem(name));
  if (data != null && 0 < Date.now() - data.time < time * 60 * 1000) return data.data;
  else return 0;
}

try {
  let data = loadData('blogbg', 1440);
  if (data) changeBg(data, 1);
  else localStorage.removeItem('blogbg');
} catch (error) {
  localStorage.removeItem('blogbg');
}

function changeBg(s, flag) {
  let bg = document.getElementById('web_bg');
  if (!bg) return;
  if (s.charAt(0) == '#') {
    bg.style.backgroundColor = s;
    bg.style.backgroundImage = 'none';
  } else {
    bg.style.backgroundImage = s;
    bg.style.backgroundColor = 'transparent';
  }
  if (!flag) {
    saveData('blogbg', s);
  }
}

function resetBg() {
  let bg = document.getElementById('web_bg');
  if (!bg) return;
  bg.style.backgroundColor = '';
  bg.style.backgroundImage = '';
  localStorage.removeItem('blogbg');
}

let winbox = null;
let winboxLoaded = false;

function loadWinBox(callback) {
  if (typeof WinBox !== 'undefined') {
    winboxLoaded = true;
    callback();
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/nextapps-de/winbox/dist/winbox.bundle.min.js';
  script.onload = function() {
    winboxLoaded = true;
    callback();
  };
  script.onerror = function() {
    console.error('Failed to load WinBox');
  };
  document.head.appendChild(script);
}

function createWinbox() {
  if (typeof WinBox === 'undefined') {
    console.error('WinBox plugin not loaded');
    return;
  }
  
  winbox = new WinBox({
    id: 'changeBgBox',
    index: 99999,
    title: '切换背景',
    x: 'center',
    y: 'center',
    minwidth: '300px',
    height: '60%',
    background: 'var(--anzhiyu-theme)',
    onclose: function() {
      winbox = null;
    }
  });

  winResize();
  window.addEventListener('resize', winResize);

  winbox.body.innerHTML = `
    <div id="article-container" style="padding:10px;">
      <p><button onclick="resetBg()" style="background:var(--anzhiyu-theme);display:block;width:100%;padding:15px 0;border-radius:6px;color:white;border:none;cursor:pointer;font-size:14px;"><i class="anzhiyufont anzhiyu-icon-arrow-rotate-right"></i> 恢复默认背景</button></p>
      
      <h2 id="图片(手机)">图片(手机)</h2>
      <div class="bgbox">
        <a href="javascript:;" rel="noopener external nofollow" style="background-image:url(https://picsum.photos/300/450)" class="pimgbox" onclick="changeBg('url(https://picsum.photos/300/450)')"></a>
      </div>
      
      <h2 id="图片(电脑)">图片(电脑)</h2>
      <div class="bgbox">
        <a href="javascript:;" rel="noopener external nofollow" style="background-image:url(https://picsum.photos/1920/1080)" class="imgbox" onclick="changeBg('url(https://picsum.photos/1920/1080)')"></a>
      </div>
      
      <h2 id="渐变色">渐变色</h2>
      <div class="bgbox">
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: linear-gradient(to right, #eecda3, #ef629f)" onclick="changeBg('linear-gradient(to right, #eecda3, #ef629f)')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: linear-gradient(to right, #667eea, #764ba2)" onclick="changeBg('linear-gradient(to right, #667eea, #764ba2)')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: linear-gradient(to right, #4facfe, #00f2fe)" onclick="changeBg('linear-gradient(to right, #4facfe, #00f2fe)')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: linear-gradient(to right, #43e97b, #38f9d7)" onclick="changeBg('linear-gradient(to right, #43e97b, #38f9d7)')"></a>
      </div>
      
      <h2 id="纯色">纯色</h2>
      <div class="bgbox">
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: #7D9D9C" onclick="changeBg('#7D9D9C')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: #2C3E50" onclick="changeBg('#2C3E50')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: #1ABC9C" onclick="changeBg('#1ABC9C')"></a>
        <a href="javascript:;" rel="noopener external nofollow" class="box" style="background: #3498DB" onclick="changeBg('#3498DB')"></a>
      </div>
    </div>
  `;
}

function winResize() {
  if (!winbox) return;
  var offsetWid = document.documentElement.clientWidth;
  if (offsetWid <= 768) {
    winbox.resize(offsetWid * 0.95 + 'px', '70%').move('center', 'center');
  } else {
    winbox.resize(offsetWid * 0.6 + 'px', '70%').move('center', 'center');
  }
}

function toggleWinbox() {
  loadWinBox(function() {
    if (winbox) {
      if (winbox.minimized || winbox.hidden) {
        winbox.show();
      } else {
        winbox.hide();
      }
    } else {
      createWinbox();
    }
  });
}