(function () {
    const WELCOME_CONTAINER_ID = 'welcome-card';
    let ipLocation = null;

    // 从主题配置中获取博主位置信息
    const BLOGGER_LOCATION = window.BLOGGER_LOCATION || {
        lon: 112.93886, // 博主经度
        lat: 31.089290  // 博主纬度
    };
    
    // 确保所有城市标语数据文件都已加载 - 优化版
    function waitForCitySlogansLoaded(callback, maxWaitTime = 2000) {
        // 如果已经有标记表示数据库已加载，直接调用回调
        if (window.CITY_SLOGANS_LOADED === true) {
            console.log('城市标语数据已加载完成（快速检测）');
            callback();
            return;
        }
        
        const startTime = Date.now();
        const checkInterval = 50; // 减少检查间隔到50毫秒，提高响应速度
        
        function check() {
            // 首先检查是否有全局标记表示数据库已加载
            if (window.CITY_SLOGANS_LOADED === true) {
                console.log('城市标语数据已加载完成（通过标记检测）');
                callback();
                return;
            }
            
            // 检查主数据库是否已加载
            const mainLoaded = typeof window.CHINA_CITY_SLOGANS !== 'undefined' && 
                              typeof window.getCitySlogan === 'function' && 
                              typeof window.getSloganByLocation === 'function';
            
            if (mainLoaded) {
                console.log('城市标语主数据库已加载完成');
                callback();
                return;
            }
            
            // 检查是否超时
            if (Date.now() - startTime > maxWaitTime) {
                console.warn('等待城市标语数据加载超时，将使用默认数据');
                // 超时后尝试主动加载数据库
                ensureCitySloganData(true);
                callback();
                return;
            }
            
            // 继续等待
            setTimeout(check, checkInterval);
        }
        
        // 开始检查
        check();
    }

    function selectAsideTarget() {
        const asideContent = document.querySelector('#aside-content');
        if (asideContent) {
            const authorCard = asideContent.querySelector('.card-widget.card-info');
            const sticky = asideContent.querySelector('.sticky_layout');
            return { asideContent, authorCard, sticky };
        }
        const sidebarMenus = document.querySelector('#sidebar-menus');
        if (sidebarMenus) return { asideContent: sidebarMenus };
        const sidebar = document.querySelector('#sidebar');
        if (sidebar) return { asideContent: sidebar };
        return null;
    }

    function ensureContainer() {
        let container = document.getElementById(WELCOME_CONTAINER_ID);
        if (container) return container;

        container = document.createElement('div');
        container.id = WELCOME_CONTAINER_ID;
        container.className = 'card-widget card-announcement';
        container.innerHTML = [
            '<div class="item-headline">',
            '  <i class="anzhiyufont anzhiyu-icon-bullhorn anzhiyu-shake"></i>',
            '  <span>有朋自远方来 不亦乐乎</span>',
            '</div>',
            '<div class="announcement_content" id="welcome-info">正在获取你的定位...</div>'
        ].join('');

        const mount = selectAsideTarget();
        const parent = (mount && mount.asideContent) || document.body;
        if (mount && mount.authorCard && mount.authorCard.parentElement === parent) {
            const after = mount.authorCard.nextSibling;
            if (after) parent.insertBefore(container, after); else parent.appendChild(container);
        } else if (mount && mount.sticky && mount.sticky.parentElement === parent) {
            parent.insertBefore(container, mount.sticky);
        } else if (parent.firstChild) {
            parent.insertBefore(container, parent.firstChild);
        } else {
            parent.appendChild(container);
        }
        return container;
    }

    function tryRelocate(maxTries) {
        let tries = 0;
        const tick = () => {
            const mount = selectAsideTarget();
            const container = document.getElementById(WELCOME_CONTAINER_ID);
            if (!container) return;
            if (mount) {
                const parent = mount.asideContent || document.body;
                if (container.parentElement !== parent) {
                    if (mount.authorCard && mount.authorCard.parentElement === parent) {
                        const after = mount.authorCard.nextSibling;
                        if (after) parent.insertBefore(container, after); else parent.appendChild(container);
                        return;
                    }
                    if (mount.sticky && mount.sticky.parentElement === parent) {
                        parent.insertBefore(container, mount.sticky);
                        return;
                    }
                    if (parent.firstChild) parent.insertBefore(container, parent.firstChild); else parent.appendChild(container);
                    return;
                }
            }
            if (tries++ < maxTries) setTimeout(tick, 300);
        };
        tick();
    }

    function getDistance(e1, n1, e2, n2) {
        const R = 6371;
        const { sin, cos, asin, PI, hypot } = Math;
        const getPoint = (e, n) => {
            e *= PI / 180; n *= PI / 180;
            return { x: cos(n) * cos(e), y: cos(n) * sin(e), z: sin(n) };
        };
        const a = getPoint(e1, n1);
        const b = getPoint(e2, n2);
        const c = hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        const r = asin(c / 2) * 2 * R;
        return r; // 保留小数，便于 toFixed(2)
    }

    function timeGreeting() {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) return '<span>🌤️ 早上好，一日之计在于晨</span>';
        if (h >= 11 && h < 13) return '<span>☀️ 中午好，记得午休喔~</span>';
        if (h >= 13 && h < 17) return '<span>🕞 下午好，饮茶先啦！</span>';
        if (h >= 17 && h < 19) return '<span>🚶‍♂️ 即将下班，记得按时吃饭~</span>';
        if (h >= 19 && h < 24) return '<span>🌙 晚上好，夜生活嗨起来！</span>';
        return '夜深了，早点休息，少熬夜';
    }

    // 本地存储键名
    const USER_LOCATION_KEY = 'user_corrected_location';
    const IP_LOCATION_CACHE_KEY = 'ip_location_cache';
    const LOCATION_CACHE_TIMESTAMP_KEY = 'location_cache_timestamp';
    const CACHE_VALID_TIME = 10 * 60 * 1000; // 缓存有效期：10分钟
    
    // 获取用户修正的位置
    function getUserCorrectedLocation() {
        try {
            const saved = localStorage.getItem(USER_LOCATION_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('读取用户位置数据失败:', e);
        }
        return null;
    }
    
    // 保存用户修正的位置
    function saveUserCorrectedLocation(locationData) {
        try {
            localStorage.setItem(USER_LOCATION_KEY, JSON.stringify(locationData));
            console.log('已保存用户修正的位置:', locationData);
        } catch (e) {
            console.error('保存用户位置数据失败:', e);
        }
    }
    
    // 获取缓存的IP位置信息
    function getCachedIpLocation() {
        try {
            const timestamp = localStorage.getItem(LOCATION_CACHE_TIMESTAMP_KEY);
            const cached = localStorage.getItem(IP_LOCATION_CACHE_KEY);
            
            if (timestamp && cached) {
                const now = Date.now();
                const cacheTime = parseInt(timestamp);
                
                // 检查缓存是否过期
                if (now - cacheTime < CACHE_VALID_TIME) {
                    console.log('使用缓存的位置信息，缓存时间:', new Date(cacheTime).toLocaleString());
                    return JSON.parse(cached);
                } else {
                    console.log('位置信息缓存已过期，需要重新获取');
                }
            }
        } catch (e) {
            console.error('读取缓存位置数据失败:', e);
        }
        return null;
    }
    
    // 保存IP位置信息到缓存
    function cacheIpLocation(locationData) {
        try {
            localStorage.setItem(IP_LOCATION_CACHE_KEY, JSON.stringify(locationData));
            localStorage.setItem(LOCATION_CACHE_TIMESTAMP_KEY, Date.now().toString());
            console.log('已缓存位置信息:', locationData);
        } catch (e) {
            console.error('缓存位置数据失败:', e);
        }
    }
    
    // 不再需要位置修正功能，因为API返回的数据已经足够准确
    function addLocationCorrection(el, data) {
        // 此函数保留但不添加任何按钮
        // 因为根据key获取的数据应该是准确的
        console.log('位置数据已准确获取，无需修正按钮');
    }
    
    function showWelcome() {
        const el = document.getElementById('welcome-info');
        if (!el) {
            console.log("无法获取welcome-info元素");
            return;
        }
        
        // 清空内容，移除之前的表单
        el.innerHTML = '';
        
        // 检查是否有用户修正的位置
        const userLocation = getUserCorrectedLocation();
        if (userLocation) {
            console.log('使用用户修正的位置:', userLocation);
            ipLocation = userLocation;
        }
        
        if (!ipLocation || !ipLocation.data) { 
            console.error('ipLocation 数据不可用:', ipLocation);
            el.innerHTML = '定位获取失败或接口不可用'; 
            return; 
        }

        console.log('显示欢迎信息，使用数据:', ipLocation);
        const data = ipLocation.data;
        let pos = data.country;
        let posdesc;

        // 强制使用我的城市标语数据库获取标语
        if (data.country === '中国') {
            pos = `${data.prov || ''} ${data.city || ''} ${data.district || ''}`.trim();
            
            // 确保使用我的城市标语数据库
            console.log('使用我的城市标语数据库...');
            console.log('当前位置信息:', { 
                province: data.prov, 
                city: data.city, 
                district: data.district 
            });
            
            // 处理城市名称，去除"市"后缀
            let cityName = data.city;
            if (cityName && cityName.endsWith('市')) {
                cityName = cityName.substring(0, cityName.length - 1);
            }
            
            // 处理直辖市
            if (data.prov === '北京市' || data.prov === '天津市' || 
                data.prov === '上海市' || data.prov === '重庆市') {
                cityName = data.prov.substring(0, 2);
            }
            
            // 使用我的城市标语数据
            let citySlogan = null;
            
            // 检查我的数据库是否已加载
            if (window.CHINA_CITY_SLOGANS && typeof window.getCitySlogan === 'function') {
                // 强制等待数据库加载完成
                if (!window.CITY_SLOGANS_LOADED) {
                    console.log('等待城市标语数据库加载完成...');
                    // 尝试手动加载数据库
                    ensureCitySloganData();
                }
                
                // 直接从数据库中查找
                if (data.prov && window.CHINA_CITY_SLOGANS[data.prov]) {
                    console.log(`在 ${data.prov} 中查找城市 ${cityName}`);
                    const cityData = window.CHINA_CITY_SLOGANS[data.prov].find(item => item.城市 === cityName);
                    if (cityData) {
                        citySlogan = cityData.标语;
                        console.log(`直接从数据库中找到标语: ${citySlogan}`);
                    } else {
                        console.log(`在 ${data.prov} 中未找到城市 ${cityName}`);
                    }
                }
                
                // 如果直接查找失败，尝试使用getCitySlogan函数
                if (!citySlogan && data.prov && cityName) {
                    citySlogan = window.getCitySlogan(data.prov, cityName);
                    console.log('getCitySlogan函数结果:', citySlogan);
                }
                
                // 如果getCitySlogan失败，尝试使用getSloganByLocation函数
                if (!citySlogan && typeof window.getSloganByLocation === 'function') {
                    citySlogan = window.getSloganByLocation(ipLocation);
                    console.log('getSloganByLocation函数结果:', citySlogan);
                }
                
                // 尝试在数据库中查找该省份的任何城市
                if (!citySlogan && window.CHINA_CITY_SLOGANS[data.prov] && window.CHINA_CITY_SLOGANS[data.prov].length > 0) {
                    console.log(`尝试使用${data.prov}的省会城市标语`);
                    // 如果找不到特定城市的标语，使用该省份的省会城市标语
                    const provinceCapital = window.CHINA_CITY_SLOGANS[data.prov].find(item => item.类型 === '省会');
                    if (provinceCapital) {
                        citySlogan = provinceCapital.标语;
                        console.log('使用省会城市标语:', citySlogan);
                    } else {
                        // 如果找不到省会，使用该省份的第一个城市标语
                        citySlogan = window.CHINA_CITY_SLOGANS[data.prov][0].标语;
                        console.log('使用省份第一个城市标语:', citySlogan);
                    }
                }
                
                if (citySlogan) {
                    posdesc = citySlogan;
                    console.log('成功设置城市标语:', posdesc);
                } else {
                    console.log('未找到匹配的城市标语，使用默认描述');
                }
            } else {
                console.warn('城市标语数据库未加载，尝试手动加载...');
                // 尝试手动加载数据库
                ensureCitySloganData();
                // 延迟重试
                setTimeout(() => {
                    if (window.CHINA_CITY_SLOGANS && typeof window.getCitySlogan === 'function') {
                        console.log('数据库已加载，重新尝试获取标语');
                        if (data.prov && cityName) {
                            const retrySlogan = window.getCitySlogan(data.prov, cityName);
                            if (retrySlogan) {
                                posdesc = retrySlogan;
                                console.log('重试成功，设置城市标语:', posdesc);
                                // 更新显示
                                const el = document.getElementById('welcome-info');
                                if (el) {
        const greeting = timeGreeting();
        el.innerHTML = `欢迎来自 <b><span style="color: var(--anzhiyu-main)">${pos}</span></b> 的小友💖<br>当前位置距博主约 <b><span style="color: var(--anzhiyu-main)">${dist.toFixed(2)}</span></b> 公里！<br>${greeting}<br>Tip：<b><span style="font-size: 15px;">${posdesc}</span></b>`;
        
        // 不再添加位置修正按钮
                                }
                            }
                        }
                    }
                }, 500);
            }
            
            // 如果没有找到城市标语或数据库未加载，使用默认描述
            if (!posdesc) {
                // 如果没有找到对应的城市标语，使用原有的描述
                switch (data.prov) {
                    case '北京市': posdesc = '北——京——欢迎你~~~'; break;
                    case '天津市': posdesc = '讲段相声吧'; break;
                    case '河北省': posdesc = '山势巍巍成壁垒，天下雄关铁马金戈由此向，无限江山'; break;
                    case '山西省': posdesc = '展开坐具长三尺，已占山河五百余'; break;
                    case '内蒙古自治区': posdesc = '天苍苍，野茫茫，风吹草低见牛羊'; break;
                    case '辽宁省': posdesc = '我想吃烤鸡架！'; break;
                    case '吉林省': posdesc = '状元阁就是东北烧烤之王'; break;
                    case '黑龙江省': posdesc = '很喜欢哈尔滨大剧院'; break;
                    case '上海市': posdesc = '众所周知，中国只有两个城市'; break;
                    case '江苏省':
                        switch (data.city) {
                            case '南京市': posdesc = '这是我挺想去的城市啦'; break;
                            case '苏州市': posdesc = '上有天堂，下有苏杭'; break;
                            default: posdesc = '散装是必须要散装的'; break;
                        } break;
                    case '浙江省':
                        switch (data.city) {
                            case '杭州市': posdesc = '东风渐绿西湖柳，雁已还人未南归'; break;
                            default: posdesc = '望海楼明照曙霞,护江堤白蹋晴沙'; break;
                        } break;
                    case '河南省':
                        switch (data.city) {
                            case '郑州市': posdesc = '豫州之域，天地之中'; break;
                            case '信阳市': posdesc = '品信阳毛尖，悟人间芳华'; break;
                            case '南阳市': posdesc = '臣本布衣，躬耕于南阳此南阳非彼南阳！'; break;
                            case '驻马店市': posdesc = '峰峰有奇石，石石挟仙气嵖岈山的花很美哦！'; break;
                            case '开封市': posdesc = '刚正不阿包青天'; break;
                            case '洛阳市': posdesc = '洛阳牡丹甲天下'; break;
                            default: posdesc = '可否带我品尝河南烩面啦？'; break;
                        } break;
                    case '安徽省': posdesc = '蚌埠住了，芜湖起飞'; break;
                    case '福建省': 
                        // 福建省城市标语特殊处理
                        switch (data.city) {
                            case '福州市': posdesc = '榕城古韵·数字福州'; break;
                            case '厦门市': posdesc = '鼓浪听涛·海上花园'; break;
                            case '泉州市': posdesc = '海丝起点·闽南古城'; break;
                            case '莆田市': posdesc = '妈祖故里·木雕之乡'; break;
                            case '三明市': posdesc = '绿色宝库·客家摇篮'; break;
                            case '漳州市': posdesc = '水仙花城·台商热土'; break;
                            case '南平市': posdesc = '武夷山水·茶香竹海'; break;
                            case '龙岩市': posdesc = '客家摇篮·红色热土'; break;
                            case '宁德市': posdesc = '海上天湖·闽东明珠'; break;
                            default: posdesc = '八闽大地，人杰地灵'; break;
                        }
                        break;
                    case '江西省': posdesc = '落霞与孤鹜齐飞，秋水共长天一色'; break;
                    case '山东省': posdesc = '遥望齐州九点烟，一泓海水杯中泻'; break;
                    case '湖北省':
                        switch (data.city) {
                            case '黄冈市': posdesc = '红安将军县！辈出将才！'; break;
                            default: posdesc = '来碗热干面~'; break;
                        } break;
                    case '湖南省': posdesc = '74751，长沙斯塔克'; break;
                    case '广东省':
                        switch (data.city) {
                            case '广州市': posdesc = '看小蛮腰，喝早茶了嘛~'; break;
                            case '深圳市': posdesc = '今天你逛商场了嘛~'; break;
                            case '阳江市': posdesc = '阳春合水！博主家乡~ 欢迎来玩~'; break;
                            default: posdesc = '来两斤福建人~'; break;
                        } break;
                    case '广西壮族自治区': posdesc = '桂林山水甲天下'; break;
                    case '海南省': posdesc = '朝观日出逐白浪，夕看云起收霞光'; break;
                    case '四川省': posdesc = '康康川妹子'; break;
                    case '贵州省': posdesc = '茅台，学生，再塞200'; break;
                    case '云南省': posdesc = '玉龙飞舞云缠绕，万仞冰川直耸天'; break;
                    case '西藏自治区': posdesc = '躺在茫茫草原上，仰望蓝天'; break;
                    case '陕西省': posdesc = '来份臊子面加馍'; break;
                    case '甘肃省': posdesc = '羌笛何须怨杨柳，春风不度玉门关'; break;
                    case '青海省': posdesc = '牛肉干和老酸奶都好好吃'; break;
                    case '宁夏回族自治区': posdesc = '大漠孤烟直，长河落日圆'; break;
                    case '新疆维吾尔自治区': posdesc = '驼铃古道丝绸路，胡马犹闻唐汉风'; break;
                    case '台湾省': posdesc = '我在这头，大陆在那头'; break;
                    case '香港特别行政区': posdesc = '永定贼有残留地鬼嚎，迎击光非岁玉'; break;
                    case '澳门特别行政区': posdesc = '性感荷官，在线发牌'; break;
                    default: posdesc = '带我去你的城市逛逛吧！'; break;
                }
            }
        } else {
            switch (data.country) {
                // 亚洲国家
                case '日本': posdesc = 'よろしく，一起去看樱花吗'; break;
                case '韩国': posdesc = '안녕하세요，一起去首尔塔吧'; break;
                case '朝鲜': posdesc = '平壤的夜景如此美丽'; break;
                case '蒙古': posdesc = '广阔的草原，自由的骑马'; break;
                case '越南': posdesc = 'Xin chào，来碗越南河粉'; break;
                case '老挝': posdesc = 'ສະບາຍດີ，湄公河的宁静'; break;
                case '柬埔寨': posdesc = '吴哥窟的微笑佛像'; break;
                case '泰国': posdesc = 'Sawadika，人妖表演了解一下'; break;
                case '缅甸': posdesc = '蒲甘的千塔之城'; break;
                case '马来西亚': posdesc = '双子塔的灯光璀璨'; break;
                case '新加坡': posdesc = '花园城市，狮城魅力'; break;
                case '印度尼西亚': posdesc = '巴厘岛的日落多美啊'; break;
                case '菲律宾': posdesc = 'Kumusta，长滩岛的白沙滩'; break;
                case '印度': posdesc = 'नमस्ते，泰姬陵的爱情故事'; break;
                case '巴基斯坦': posdesc = 'السلام عليكم，喀喇昆仑公路的壮观'; break;
                case '孟加拉国': posdesc = '孟加拉虎的威严'; break;
                case '尼泊尔': posdesc = '珠穆朗玛峰的巅峰体验'; break;
                case '斯里兰卡': posdesc = '锡兰红茶，世界的味道'; break;
                case '阿富汗': posdesc = '历史悠久的丝绸之路'; break;
                case '伊朗': posdesc = 'سلام，波斯文明的辉煌'; break;
                case '伊拉克': posdesc = '两河流域，文明的摇篮'; break;
                case '叙利亚': posdesc = '大马士革的古老市集'; break;
                case '约旦': posdesc = '佩特拉古城的玫瑰色岩石'; break;
                case '黎巴嫩': posdesc = '地中海沿岸的明珠'; break;
                case '以色列': posdesc = 'שלום，耶路撒冷的圣城'; break;
                case '沙特阿拉伯': posdesc = 'مرحبا，麦加朝圣的圣地'; break;
                case '阿联酋': posdesc = '迪拜的奢华与创新'; break;
                case '卡塔尔': posdesc = '多哈的现代化建筑'; break;
                case '科威特': posdesc = '石油富国的繁荣'; break;
                case '阿曼': posdesc = '阿拉伯海的明珠'; break;
                case '土耳其': posdesc = 'Merhaba，东西方文化的交汇'; break;
                
                // 欧洲国家
                case '英国': posdesc = '想同你一起夜乘伦敦眼'; break;
                case '法国': posdesc = "C'est La Vie，埃菲尔铁塔的浪漫"; break;
                case '德国': posdesc = 'Die Zeit verging im Fluge，啤酒节的狂欢'; break;
                case '意大利': posdesc = 'Ciao，比萨斜塔下的许愿'; break;
                case '西班牙': posdesc = 'Hola，奔牛节的刺激'; break;
                case '葡萄牙': posdesc = 'Olá，里斯本的电车之旅'; break;
                case '希腊': posdesc = 'Γεια σας，爱琴海的蓝白世界'; break;
                case '荷兰': posdesc = '风车与郁金香的国度'; break;
                case '比利时': posdesc = '巧克力与啤酒的天堂'; break;
                case '卢森堡': posdesc = '欧洲的小国大公国'; break;
                case '瑞士': posdesc = '阿尔卑斯山的雪景'; break;
                case '奥地利': posdesc = '音乐之都维也纳'; break;
                case '丹麦': posdesc = '安徒生童话的故乡'; break;
                case '瑞典': posdesc = '北欧设计的典范'; break;
                case '挪威': posdesc = '峡湾与极光的国度'; break;
                case '芬兰': posdesc = '圣诞老人的家乡'; break;
                case '冰岛': posdesc = '冰与火之歌的取景地'; break;
                case '爱尔兰': posdesc = '绿岛上的酒吧文化'; break;
                case '波兰': posdesc = '肖邦的故乡'; break;
                case '捷克': posdesc = '布拉格广场的天文钟'; break;
                case '斯洛伐克': posdesc = '多瑙河畔的明珠'; break;
                case '匈牙利': posdesc = '布达佩斯的温泉浴场'; break;
                case '罗马尼亚': posdesc = '德古拉城堡的神秘'; break;
                case '保加利亚': posdesc = '玫瑰谷的芬芳'; break;
                case '塞尔维亚': posdesc = '巴尔干半岛的心脏'; break;
                case '克罗地亚': posdesc = '亚得里亚海的明珠'; break;
                case '斯洛文尼亚': posdesc = '布莱德湖的宁静'; break;
                case '乌克兰': posdesc = '基辅的金色穹顶'; break;
                case '白俄罗斯': posdesc = '欧洲最后的独裁国家'; break;
                case '俄罗斯': posdesc = '干了这瓶伏特加！红场的壮观'; break;
                case '立陶宛': posdesc = '波罗的海的琥珀'; break;
                case '拉脱维亚': posdesc = '里加老城的中世纪风情'; break;
                case '爱沙尼亚': posdesc = '数字化国家的典范'; break;
                case '摩尔多瓦': posdesc = '欧洲最穷国家的坚韧'; break;
                case '马耳他': posdesc = '地中海的十字路口'; break;
                case '塞浦路斯': posdesc = '阿芙罗狄蒂的诞生地'; break;
                
                // 美洲国家
                case '美国': posdesc = 'Let us live in peace! 自由女神像的象征'; break;
                case '加拿大': posdesc = '拾起一片枫叶赠予你'; break;
                case '墨西哥': posdesc = '¡Hola! 玛雅文明的神秘'; break;
                case '巴西': posdesc = 'Olá! 里约热内卢的狂欢节'; break;
                case '阿根廷': posdesc = '探戈舞的激情'; break;
                case '智利': posdesc = '安第斯山脉的壮丽'; break;
                case '秘鲁': posdesc = '马丘比丘的神秘'; break;
                case '哥伦比亚': posdesc = '加勒比海的阳光'; break;
                case '委内瑞拉': posdesc = '天使瀑布的壮观'; break;
                case '厄瓜多尔': posdesc = '加拉帕戈斯群岛的生态'; break;
                case '玻利维亚': posdesc = '乌尤尼盐沼的天空之镜'; break;
                case '巴拉圭': posdesc = '伊瓜苏瀑布的震撼'; break;
                case '乌拉圭': posdesc = '蒙得维的亚的老城区'; break;
                case '古巴': posdesc = '哈瓦那的老爷车'; break;
                case '牙买加': posdesc = '雷鬼音乐的节奏'; break;
                case '海地': posdesc = '加勒比海的明珠'; break;
                case '多米尼加': posdesc = '蓬塔卡纳的白沙滩'; break;
                case '巴哈马': posdesc = '粉色沙滩的浪漫'; break;
                
                // 非洲国家
                case '埃及': posdesc = '金字塔与狮身人面像'; break;
                case '摩洛哥': posdesc = 'مرحبا，撒哈拉沙漠的日出'; break;
                case '南非': posdesc = '好望角的壮丽景色'; break;
                case '肯尼亚': posdesc = '马赛马拉的野生动物'; break;
                case '坦桑尼亚': posdesc = '乞力马扎罗山的雪顶'; break;
                case '埃塞俄比亚': posdesc = '咖啡的发源地'; break;
                case '尼日利亚': posdesc = '非洲最大的经济体'; break;
                case '加纳': posdesc = '黄金海岸的历史'; break;
                case '阿尔及利亚': posdesc = '北非最大的国家'; break;
                case '突尼斯': posdesc = '地中海的蓝白小镇'; break;
                case '利比亚': posdesc = '撒哈拉沙漠的绿洲'; break;
                case '苏丹': posdesc = '尼罗河的源头'; break;
                case '马达加斯加': posdesc = '独特的生态系统'; break;
                case '毛里求斯': posdesc = '印度洋上的明珠'; break;
                case '塞舌尔': posdesc = '天堂般的海滩'; break;
                
                // 大洋洲国家
                case '澳大利亚': posdesc = '一起去大堡礁吧！'; break;
                case '新西兰': posdesc = '霍比特人的家园'; break;
                case '巴布亚新几内亚': posdesc = '原始部落的文化'; break;
                case '斐济': posdesc = 'Bula! 南太平洋的天堂'; break;
                case '萨摩亚': posdesc = '南太平洋的明珠'; break;
                
                // 默认情况
                default: posdesc = '带我去你的国家逛逛吧'; break;
            }
        }

        // 计算距离
        let dist = 0;
        if (typeof data.lng === 'number' && typeof data.lat === 'number') {
            dist = getDistance(BLOGGER_LOCATION.lon, BLOGGER_LOCATION.lat, data.lng, data.lat);
        } else {
            console.log('无法计算距离，缺少经纬度信息');
        }

        const greeting = timeGreeting();
        el.innerHTML = `欢迎来自 <b><span style="color: var(--anzhiyu-main)">${pos}</span></b> 的小友💖<br>当前位置距博主约 <b><span style="color: var(--anzhiyu-main)">${dist.toFixed(2)}</span></b> 公里！<br>${greeting}<br>Tip：<b><span style="font-size: 15px;">${posdesc}</span></b>`;
    }

    function isHomePage() {
        const p = window.location.pathname;
        return p === '/' || p === '/index.html';
    }

    // 检查是否为文章页面
    function isPostPage() {
        const p = window.location.pathname;
        return p.includes('/posts/') || p.includes('/post/') || p.includes('/article/') || p.match(/\/\d{4}\/\d{2}\/\d{2}\//);
    }

    function handlePjaxComplete() {
        // 在首页和文章页面都显示欢迎信息
        if (isHomePage() || isPostPage()) {
            showWelcome();
        }
    }

    async function fetchNsmao() {
        // 检查是否有缓存的位置信息
        const cachedLocation = getCachedIpLocation();
        if (cachedLocation) {
            console.log('使用缓存的位置信息:', cachedLocation);
            window.ipLocation = ipLocation = cachedLocation;
            if (isHomePage() || isPostPage()) showWelcome();
            return;
        }
        
        // 如果没有缓存，则获取新的位置信息
        const el = document.getElementById('welcome-info');
        if (!el) {
            console.error('无法获取welcome-info元素');
            return;
        }
        
        // 显示正在获取定位的提示
        el.innerHTML = '正在获取你的定位...';
        
        // 直接使用配置的密钥
        const key = "XPYdG7ccICDW47apDHcLzCVHiH";

        try {
            // 使用Promise.race同时请求多个API，使用最快返回的有效结果
            const apis = [
                // 奶思猫API - 主要API
                {
                    name: 'nsmao-primary',
                    fetch: () => fetch(`https://api.nsmao.net/api/ip/query?key=${encodeURIComponent(key)}`, { 
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        },
                        // 设置超时
                        signal: AbortSignal.timeout(3000)
                    }).then(resp => {
                        if (!resp.ok) throw new Error(`API请求失败: ${resp.status}`);
                        return resp.json();
                    }).then(data => {
                        if (!data || !data.data) throw new Error('数据格式不正确');
                        return {
                            ip: data.ip || '',
                            data: {
                                country: data.data.country || '',
                                prov: data.data.prov || '',
                                city: data.data.city || '',
                                district: data.data.district || '',
                                lng: data.data.lng || 0,
                                lat: data.data.lat || 0,
                                source: 'nsmao-primary'
                            }
                        };
                    })
                },
                // 奶思猫备用API
                {
                    name: 'nsmao-backup',
                    fetch: () => fetch(`https://api.nsmao.net/api/ipip/geo/v1/query?key=${encodeURIComponent(key)}`, { 
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        },
                        signal: AbortSignal.timeout(3000)
                    }).then(resp => {
                        if (!resp.ok) throw new Error(`API请求失败: ${resp.status}`);
                        return resp.json();
                    }).then(data => {
                        if (!data || !data.data) throw new Error('数据格式不正确');
                        const formattedData = {
                            ip: data.ip || '',
                            data: {
                                country: '',
                                prov: '',
                                city: '',
                                district: '',
                                lng: 0,
                                lat: 0,
                                source: 'nsmao-backup'
                            }
                        };
                        
                        if (data.data && data.data.location) {
                            const location = data.data.location.split(' ');
                            formattedData.data.country = location[0] || '';
                            formattedData.data.prov = location[1] || '';
                            formattedData.data.city = location[2] || '';
                            formattedData.data.district = location[3] || '';
                        }
                        
                        if (data.data && typeof data.data.longitude === 'number' && typeof data.data.latitude === 'number') {
                            formattedData.data.lng = data.data.longitude;
                            formattedData.data.lat = data.data.latitude;
                        }
                        
                        return formattedData;
                    })
                },
                // 使用ipapi.co作为第三方备用
                {
                    name: 'ipapi',
                    fetch: () => fetch('https://ipapi.co/json/', { 
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json'
                        },
                        signal: AbortSignal.timeout(3000)
                    }).then(resp => {
                        if (!resp.ok) throw new Error(`API请求失败: ${resp.status}`);
                        return resp.json();
                    }).then(data => {
                        if (!data) throw new Error('数据格式不正确');
                        return {
                            ip: data.ip || '',
                            data: {
                                country: data.country_name || '',
                                prov: data.region || '',
                                city: data.city || '',
                                district: '',
                                lng: data.longitude || 0,
                                lat: data.latitude || 0,
                                source: 'ipapi'
                            }
                        };
                    })
                }
            ];
            
            // 同时发起所有请求，使用最快返回的有效结果
            const apiPromises = apis.map(api => 
                api.fetch()
                .then(processed => {
                    // 验证数据有效性
                    if (processed && processed.data && 
                        processed.data.country && 
                        processed.data.prov && 
                        processed.data.city) {
                        
                        // 修正城市名称，确保精确到市级
                        if (processed.data.city && !processed.data.city.endsWith('市') && 
                            processed.data.city !== '北京' && 
                            processed.data.city !== '上海' && 
                            processed.data.city !== '天津' && 
                            processed.data.city !== '重庆') {
                            processed.data.city = processed.data.city + '市';
                        }
                        
                        console.log(`成功获取位置数据，来源: ${processed.data.source}`);
                        return processed;
                    } else {
                        throw new Error('数据不完整或无效');
                    }
                })
                .catch(err => {
                    console.error(`API ${api.name} 请求失败:`, err);
                    return null; // 返回null表示此API失败
                })
            );
            
            // 使用Promise.any获取第一个成功的结果
            let locationData = null;
            try {
                // 尝试使用Promise.any (如果浏览器支持)
                if (typeof Promise.any === 'function') {
                    locationData = await Promise.any(apiPromises.filter(p => p !== null));
                } else {
                    // 回退到手动实现类似Promise.any的功能
                    locationData = await new Promise((resolve, reject) => {
                        let rejected = 0;
                        apiPromises.forEach(p => {
                            p.then(result => {
                                if (result) resolve(result);
                            }).catch(() => {
                                rejected++;
                                if (rejected === apiPromises.length) {
                                    reject(new Error('所有API请求都失败'));
                                }
                            });
                        });
                    });
                }
            } catch (err) {
                console.warn('所有API请求都失败:', err);
                locationData = null;
            }
            
            // 如果API请求都失败，尝试使用HTML5地理定位
            if (!locationData) {
                console.warn('所有API请求都失败，尝试使用HTML5地理定位');
                try {
                    if (navigator.geolocation) {
                        const position = await new Promise((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                                enableHighAccuracy: true,
                                timeout: 3000,
                                maximumAge: 0
                            });
                        });
                        
                        const { latitude, longitude } = position.coords;
                        console.log(`HTML5地理定位成功: 经度=${longitude}, 纬度=${latitude}`);
                        
                        // 使用经纬度反向查询位置
                        try {
                            const geoUrl = `https://api.nsmao.net/api/geo/v1/reverse?key=${encodeURIComponent(key)}&lat=${latitude}&lng=${longitude}`;
                            const geoResp = await fetch(geoUrl, { 
                                cache: 'no-store',
                                signal: AbortSignal.timeout(3000)
                            });
                            
                            if (geoResp.ok) {
                                const geoData = await geoResp.json();
                                console.log('反向地理编码结果:', geoData);
                                
                                if (geoData && geoData.data) {
                                    locationData = {
                                        ip: '本地',
                                        data: {
                                            country: geoData.data.country || '中国',
                                            prov: geoData.data.province || '',
                                            city: geoData.data.city || '',
                                            district: geoData.data.district || '',
                                            lng: longitude,
                                            lat: latitude,
                                            source: 'html5-geo'
                                        }
                                    };
                                }
                            }
                        } catch (reverseErr) {
                            console.error('反向地理编码失败:', reverseErr);
                            // 即使反向地理编码失败，也可以使用经纬度信息
                            locationData = {
                                ip: '本地',
                                data: {
                                    country: '中国', // 默认中国
                                    prov: '',
                                    city: '',
                                    district: '',
                                    lng: longitude,
                                    lat: latitude,
                                    source: 'html5-geo-raw'
                                }
                            };
                        }
                    }
                } catch (geoErr) {
                    console.error('HTML5地理定位失败:', geoErr);
                }
            }
            
            // 如果仍然没有位置数据，使用模拟数据
            if (!locationData) {
                console.warn('无法获取位置数据，使用模拟数据');
                locationData = {
                    ip: '127.0.0.1',
                    data: {
                        country: '中国',
                        prov: '广东省',
                        city: '深圳市',
                        district: '',
                        lng: 114.05,
                        lat: 22.55,
                        source: 'mock'
                    }
                };
            }
            
            // 保存位置数据到缓存
            cacheIpLocation(locationData);
            
            // 保存位置数据并显示欢迎信息
            window.ipLocation = ipLocation = locationData;
            console.log('最终使用的位置数据:', locationData);
            
            if (isHomePage() || isPostPage()) showWelcome();
            
        } catch (finalErr) {
            console.error('所有定位方法都失败:', finalErr);
            
            // 最后的备用方案
            const mockData = {
                ip: '127.0.0.1',
                data: {
                    country: '中国',
                    prov: '广东省',
                    city: '深圳市',
                    district: '',
                    lng: 114.05,
                    lat: 22.55,
                    source: 'fallback'
                }
            };
            
            window.ipLocation = ipLocation = mockData;
            if (isHomePage() || isPostPage()) showWelcome();
        }
    }

    // 检查城市标语数据库是否完整加载 - 优化版
    function checkCitySloganDataLoaded() {
        // 首先检查全局标记
        if (window.CITY_SLOGANS_LOADED === true) {
            return true;
        }
        
        // 检查主数据库是否已加载
        if (typeof window.CHINA_CITY_SLOGANS !== 'undefined' && 
            typeof window.getCitySlogan === 'function' && 
            typeof window.getSloganByLocation === 'function') {
            return true;
        }
        
        return false;
    }
    
    // 确保城市标语数据库加载 - 优化版
    function ensureCitySloganData(priorityLoad = false) {
        // 如果数据库已加载，直接返回
        if (checkCitySloganDataLoaded()) {
            console.log('城市标语数据库已完整加载');
            return true;
        }
        
        console.warn('城市标语数据库未完整加载，尝试动态加载...');
        
        // 区域文件映射
        const regionFiles = {
            'main': '/js/city-slogans.js',
            'north': '/js/city-slogans-north.js',
            'northeast': '/js/city-slogans-northeast.js',
            'east': '/js/city-slogans-east.js',
            'central': '/js/city-slogans-central.js',
            'south': '/js/city-slogans-south.js',
            'southwest': '/js/city-slogans-southwest.js',
            'northwest': '/js/city-slogans-northwest.js'
        };
        
        // 优先加载主文件
        const loadScript = (src, isAsync = false) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = isAsync;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };
        
        // 如果是优先加载模式，使用Promise加载主文件和北方数据（最常用的区域）
        if (priorityLoad) {
            // 优先加载主文件和北方数据
            Promise.all([
                loadScript(regionFiles.main, false),
                loadScript(regionFiles.north, true)
            ]).then(() => {
                console.log('主要城市标语数据加载完成');
                
                // 延迟加载其他区域数据
                setTimeout(() => {
                    Promise.all([
                        loadScript(regionFiles.east, true),
                        loadScript(regionFiles.south, true)
                    ]).then(() => {
                        console.log('东部和南部城市标语数据加载完成');
                        
                        // 进一步延迟加载剩余区域数据
                        setTimeout(() => {
                            Promise.all([
                                loadScript(regionFiles.northeast, true),
                                loadScript(regionFiles.central, true),
                                loadScript(regionFiles.southwest, true),
                                loadScript(regionFiles.northwest, true)
                            ]).then(() => {
                                console.log('所有城市标语数据加载完成');
                            }).catch(err => {
                                console.error('加载剩余城市标语数据失败:', err);
                            });
                        }, 200);
                    }).catch(err => {
                        console.error('加载东部和南部城市标语数据失败:', err);
                    });
                }, 100);
            }).catch(err => {
                console.error('加载主要城市标语数据失败:', err);
            });
        } else {
            // 常规加载模式
            // 先加载主文件
            loadScript(regionFiles.main, false)
                .then(() => {
                    console.log('城市标语主数据库加载完成');
                    
                    // 然后并行加载所有区域文件
                    const regionLoads = [
                        loadScript(regionFiles.north, true),
                        loadScript(regionFiles.northeast, true),
                        loadScript(regionFiles.east, true),
                        loadScript(regionFiles.central, true),
                        loadScript(regionFiles.south, true),
                        loadScript(regionFiles.southwest, true),
                        loadScript(regionFiles.northwest, true)
                    ];
                    
                    Promise.all(regionLoads)
                        .then(() => console.log('所有区域城市标语数据加载完成'))
                        .catch(err => console.error('加载区域城市标语数据失败:', err));
                })
                .catch(err => console.error('加载城市标语主数据库失败:', err));
        }
        
        return false;
    }

    function init() {
        // 预加载城市标语数据库
        const preloadCitySlogans = () => {
            // 使用requestIdleCallback在浏览器空闲时预加载数据
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    ensureCitySloganData(true);
                }, { timeout: 1000 });
            } else {
                // 如果不支持requestIdleCallback，则延迟加载
                setTimeout(() => ensureCitySloganData(true), 200);
            }
        };
        
        // 创建欢迎卡片容器
        ensureContainer();
        
        // 显示加载提示
        const el = document.getElementById('welcome-info');
        if (el) {
            el.innerHTML = '正在加载欢迎信息...';
        }
        
        // 优先检查缓存的位置信息
        const cachedLocation = getCachedIpLocation();
        if (cachedLocation) {
            console.log('使用缓存的位置信息:', cachedLocation);
            window.ipLocation = ipLocation = cachedLocation;
            
            // 立即显示欢迎信息，同时在后台加载城市标语数据
            if (isHomePage() || isPostPage()) {
                showWelcome();
            }
            
            // 后台预加载城市标语数据
            preloadCitySlogans();
        } else {
            // 如果没有缓存的位置信息，则等待城市标语数据加载
            waitForCitySlogansLoaded(function() {
                // 数据加载完成后，继续初始化
                tryRelocate(20);
                
                // 检查是否有用户修正的位置
                const userLocation = getUserCorrectedLocation();
                if (userLocation) {
                    console.log('使用用户修正的位置:', userLocation);
                    window.ipLocation = ipLocation = userLocation;
                    
                    // 立即显示欢迎信息
                    if (isHomePage() || isPostPage()) {
                        showWelcome();
                    }
                } else {
                    // 如果没有用户修正的位置，则获取IP定位
                    fetchNsmao().catch(() => { 
                        const el = document.getElementById('welcome-info'); 
                        if (el) el.innerHTML = '定位获取失败或接口不可用'; 
                    });
                }
                
                // 添加调试信息，帮助排查问题
                console.log('欢迎卡片初始化完成');
                console.log('城市标语数据库状态检查:');
                console.log('- CHINA_CITY_SLOGANS:', typeof window.CHINA_CITY_SLOGANS);
                console.log('- getCitySlogan函数:', typeof window.getCitySlogan);
                console.log('- getSloganByLocation函数:', typeof window.getSloganByLocation);
            });
            
            // 2秒后检查是否仍在加载
            setTimeout(() => {
                const el = document.getElementById('welcome-info');
                if (el && (el.innerHTML === '正在获取你的定位...' || el.innerHTML === '正在加载欢迎信息...')) {
                    console.warn('2秒后仍在获取定位，使用默认数据');
                    
                    // 使用默认数据
                    const defaultData = {
                        ip: '127.0.0.1',
                        data: {
                            country: '中国',
                            prov: '广东省',
                            city: '深圳市',
                            district: '',
                            lng: 114.05,
                            lat: 22.55,
                            source: 'default-timeout'
                        }
                    };
                    
                    // 保存到缓存，但设置较短的过期时间
                    try {
                        localStorage.setItem(IP_LOCATION_CACHE_KEY, JSON.stringify(defaultData));
                        // 设置1分钟的缓存时间，这样下次有机会重新获取
                        localStorage.setItem(LOCATION_CACHE_TIMESTAMP_KEY, (Date.now() - CACHE_VALID_TIME + 60000).toString());
                        console.log('已缓存默认位置信息（短期）');
                    } catch (e) {
                        console.error('缓存默认位置数据失败:', e);
                    }
                    
                    // 更新全局变量
                    window.ipLocation = ipLocation = defaultData;
                    
                    // 显示欢迎信息
                    showWelcome();
                    
                    // 在后台继续尝试获取真实位置
                    setTimeout(() => {
                        fetchNsmao().catch(console.error);
                    }, 100);
                }
            }, 2000);
        }
    }

    // 添加CSS样式
    function addWelcomeStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #welcome-info {
                white-space: pre-wrap;
                border-radius: 14px;
                --kouseki-welcome-color: #49B1F5;
                --kouseki-ip-color: #49B1F5;
                --kouseki-gl-size: 16px!important;
            }
        `;
        document.head.appendChild(style);
    }

    addWelcomeStyles();
    document.addEventListener('DOMContentLoaded', init);
    document.addEventListener('pjax:complete', handlePjaxComplete);
    if (document.readyState === 'interactive' || document.readyState === 'complete') init();

    // 设置全局变量，方便其他脚本访问
    window.BLOGGER_LOCATION = BLOGGER_LOCATION;
    
    // 添加一个调试函数，用于测试当前位置信息
    window.testLocationInfo = function() {
        console.log('===== 位置信息调试 =====');
        console.log('当前IP位置信息:', ipLocation);
        
        if (ipLocation && ipLocation.data) {
            const data = ipLocation.data;
            console.log('国家:', data.country);
            console.log('省份:', data.prov);
            console.log('城市:', data.city);
            console.log('区县:', data.district);
            console.log('经度:', data.lng);
            console.log('纬度:', data.lat);
            console.log('数据来源:', data.source);
            
            // 测试城市标语
            if (data.prov && data.city) {
                // 处理城市名称，去除"市"后缀
                let cityName = data.city;
                if (cityName && cityName.endsWith('市')) {
                    cityName = cityName.substring(0, cityName.length - 1);
                }
                
                // 处理直辖市
                if (data.prov === '北京市' || data.prov === '天津市' || 
                    data.prov === '上海市' || data.prov === '重庆市') {
                    cityName = data.prov.substring(0, 2);
                }
                
                console.log('处理后的城市名称:', cityName);
                
                // 测试标语获取
                if (window.CHINA_CITY_SLOGANS && typeof window.getCitySlogan === 'function') {
                    const slogan = window.getCitySlogan(data.prov, cityName);
                    console.log('getCitySlogan结果:', slogan);
                    
                    if (typeof window.getSloganByLocation === 'function') {
                        const locationSlogan = window.getSloganByLocation(ipLocation);
                        console.log('getSloganByLocation结果:', locationSlogan);
                    }
                    
                    // 检查福建省的数据
                    if (data.prov === '福建省') {
                        console.log('福建省城市标语数据:');
                        if (window.CHINA_CITY_SLOGANS && window.CHINA_CITY_SLOGANS['福建省']) {
                            console.log(window.CHINA_CITY_SLOGANS['福建省']);
                        } else {
                            console.log('福建省数据不存在');
                        }
                    }
                } else {
                    console.log('城市标语数据库未加载');
                }
            }
            
            // 计算距离
            if (typeof data.lng === 'number' && typeof data.lat === 'number') {
                const dist = getDistance(BLOGGER_LOCATION.lon, BLOGGER_LOCATION.lat, data.lng, data.lat);
                console.log('距离博主:', dist.toFixed(2), '公里');
            }
        }
        
        // 检查用户修正的位置
        const userLocation = getUserCorrectedLocation();
        if (userLocation) {
            console.log('用户修正的位置:', userLocation);
        } else {
            console.log('没有用户修正的位置');
        }
        
        // 检查缓存的位置
        const cachedLocation = getCachedIpLocation();
        if (cachedLocation) {
            console.log('缓存的位置信息:', cachedLocation);
            const timestamp = localStorage.getItem(LOCATION_CACHE_TIMESTAMP_KEY);
            if (timestamp) {
                const cacheTime = new Date(parseInt(timestamp));
                console.log('缓存时间:', cacheTime.toLocaleString());
                const now = new Date();
                const diffMinutes = Math.floor((now - cacheTime) / (60 * 1000));
                console.log('缓存时间差:', diffMinutes, '分钟');
            }
        } else {
            console.log('没有缓存的位置信息');
        }
        
        return '位置信息调试完成，请查看控制台';
    };
})();