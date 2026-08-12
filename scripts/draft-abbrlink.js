const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 生成abbrlink的函数
function generateAbbrlink(title, date) {
    const str = title + date;
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return hash.substring(0, 8); // 只取前8位作为abbrlink
}

// 解析front matter的函数
function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontMatter = match[1];
    const body = match[2];

    // 解析front matter
    const metadata = {};
    const lines = frontMatter.split('\n');

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            // 处理带引号的值
            if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            } else if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            }

            metadata[key] = value;
        }
    }

    return { metadata, body };
}

// 生成新的front matter
function generateFrontMatter(metadata) {
    const lines = [];
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === 'string' && value.includes(':')) {
            lines.push(`${key}: '${value}'`);
        } else {
            lines.push(`${key}: ${value}`);
        }
    }
    return lines.join('\n');
}

// 处理单个草稿文件
function processDraftFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = parseFrontMatter(content);

        if (!parsed) return;

        const { metadata, body } = parsed;

        // 检查是否已经有abbrlink
        if (metadata.abbrlink) return;

        // 生成abbrlink
        const fileName = path.basename(filePath, '.md');
        const title = metadata.title || fileName;
        const date = metadata.date || new Date().toISOString().split('T')[0];
        const abbrlink = generateAbbrlink(title, date);

        // 添加abbrlink到metadata
        metadata.abbrlink = abbrlink;

        // 生成新的内容
        const newFrontMatter = generateFrontMatter(metadata);
        const newContent = `---\n${newFrontMatter}\n---\n${body}`;

        // 写入文件
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`[Auto Abbrlink] Added abbrlink to draft: ${path.basename(filePath)} -> ${abbrlink}`);
    } catch (error) {
        console.error(`[Auto Abbrlink] Error processing file ${filePath}:`, error.message);
    }
}

// 设置文件监控（带超时）
function setupFileWatcher() {
    const draftsDir = path.join(hexo.source_dir, '_drafts');

    if (!fs.existsSync(draftsDir)) {
        console.log('[Auto Abbrlink] Drafts directory does not exist, creating...');
        fs.mkdirSync(draftsDir, { recursive: true });
    }

    // 初始处理现有文件
    const files = fs.readdirSync(draftsDir);
    for (const file of files) {
        if (file.endsWith('.md')) {
            processDraftFile(path.join(draftsDir, file));
        }
    }

    // 监控文件变化
    const watcher = fs.watch(draftsDir, { recursive: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
            const filePath = path.join(draftsDir, filename);

            // 等待文件写入完成
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    processDraftFile(filePath);
                }
            }, 100);
        }
    });

    console.log('[Auto Abbrlink] File watcher started for drafts directory');

    // 保存watcher引用以便后续清理
    if (!hexo.autoAbbrlinkWatcher) {
        hexo.autoAbbrlinkWatcher = watcher;
    }

    // 添加超时机制，在命令完成后自动停止监听器
    setTimeout(() => {
        if (hexo.autoAbbrlinkWatcher) {
            hexo.autoAbbrlinkWatcher.close();
            console.log('[Auto Abbrlink] File watcher stopped (timeout)');
            hexo.autoAbbrlinkWatcher = null;
        }
    }, 10000); // 10秒后自动停止
}

// 设置持久化文件监控（不超时）
function setupFileWatcherPersistent() {
    const draftsDir = path.join(hexo.source_dir, '_drafts');

    if (!fs.existsSync(draftsDir)) {
        console.log('[Auto Abbrlink] Drafts directory does not exist, creating...');
        fs.mkdirSync(draftsDir, { recursive: true });
    }

    // 初始处理现有文件
    const files = fs.readdirSync(draftsDir);
    for (const file of files) {
        if (file.endsWith('.md')) {
            processDraftFile(path.join(draftsDir, file));
        }
    }

    // 监控文件变化
    const watcher = fs.watch(draftsDir, { recursive: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
            const filePath = path.join(draftsDir, filename);

            // 等待文件写入完成
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    processDraftFile(filePath);
                }
            }, 100);
        }
    });

    console.log('[Auto Abbrlink] Persistent file watcher started for drafts directory');

    // 保存watcher引用以便后续清理
    if (!hexo.autoAbbrlinkWatcher) {
        hexo.autoAbbrlinkWatcher = watcher;
    }

    // 不设置超时，让监听器持续运行
}

// 注册hexo命令
hexo.extend.console.register('draft-abbrlink', 'Add abbrlink to draft files', function () {
    const draftsDir = path.join(hexo.source_dir, '_drafts');

    if (!fs.existsSync(draftsDir)) {
        console.log('Drafts directory does not exist');
        return;
    }

    const files = fs.readdirSync(draftsDir);
    for (const file of files) {
        if (file.endsWith('.md')) {
            processDraftFile(path.join(draftsDir, file));
        }
    }
});

// 在hexo初始化时启动文件监控
hexo.extend.filter.register('after_init', function () {
    // 检查当前命令是否为需要长期运行的命令
    const argv = process.argv;
    const isServerCommand = argv.includes('server') || argv.includes('s');
    const isWatchCommand = argv.includes('--watch') || argv.includes('-w');
    const isCleanCommand = argv.includes('clean') || argv.includes('cl');
    
    // 对于 clean 命令，不启动文件监控
    if (isCleanCommand) {
        return;
    }
    
    if (isServerCommand || isWatchCommand) {
        // 对于 server 命令，延迟启动文件监控但不设置超时
        setTimeout(() => {
            setupFileWatcherPersistent();
        }, 2000);
    } else {
        // 对于其他命令，延迟启动文件监控并设置超时
        setTimeout(() => {
            setupFileWatcher();
        }, 2000);
    }
});

// 在hexo退出时清理监控器
process.on('SIGINT', function () {
    if (hexo.autoAbbrlinkWatcher) {
        hexo.autoAbbrlinkWatcher.close();
        console.log('[Auto Abbrlink] File watcher stopped');
    }
    process.exit();
});