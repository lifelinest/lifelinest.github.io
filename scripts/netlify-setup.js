/**
 * Netlify CMS 设置向导
 * 帮助用户创建Netlify账户并连接GitHub仓库
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class NetlifySetupWizard {
  constructor() {
    this.config = {};
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // 主设置流程
  async runSetup() {
    console.log('\n🚀 Netlify CMS 设置向导');
    console.log('========================\n');
    
    try {
      await this.checkPrerequisites();
      await this.gatherInformation();
      await this.createNetlifyConfig();
      await this.setupGitGateway();
      await this.generateSetupGuide();
      
      console.log('\n✅ 设置向导完成！');
      console.log('请查看生成的设置指南进行下一步操作。\n');
      
    } catch (error) {
      console.error('\n❌ 设置失败:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  // 检查先决条件
  async checkPrerequisites() {
    console.log('🔍 检查先决条件...');
    
    // 检查Git配置
    try {
      const gitUser = execSync('git config user.name', { encoding: 'utf8' }).trim();
      const gitEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
      console.log(`  ✅ Git用户: ${gitUser} (${gitEmail})`);
    } catch (error) {
      console.log('  ⚠️  Git用户信息未配置');
      console.log('  请运行: git config --global user.name "Your Name"');
      console.log('          git config --global user.email "your@email.com"');
    }

    // 检查GitHub远程仓库
    try {
      const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
      console.log(`  ✅ GitHub仓库: ${remote}`);
      
      // 解析GitHub仓库信息
      const repoMatch = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (repoMatch) {
        this.config.github = {
          username: repoMatch[1],
          repository: repoMatch[2],
          url: `https://github.com/${repoMatch[1]}/${repoMatch[2]}`
        };
      }
    } catch (error) {
      console.log('  ⚠️  未找到GitHub远程仓库');
      console.log('  请先创建GitHub仓库并添加为远程仓库');
    }

    // 检查Node.js和npm
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`  ✅ Node.js: ${nodeVersion}`);
      console.log(`  ✅ npm: ${npmVersion}`);
    } catch (error) {
      console.log('  ❌ Node.js或npm未安装');
      throw new Error('需要安装Node.js和npm');
    }

    // 检查Hexo
    try {
      const hexoVersion = execSync('hexo version', { encoding: 'utf8' }).trim();
      console.log(`  ✅ Hexo: ${hexoVersion.split('\n')[0]}`);
    } catch (error) {
      console.log('  ❌ Hexo未安装');
      throw new Error('需要安装Hexo');
    }
  }

  // 收集用户信息
  async gatherInformation() {
    console.log('\n📋 收集配置信息...');
    
    // Netlify设置
    console.log('\n📦 Netlify配置:');
    this.config.netlify = {
      site_name: await this.askQuestion('  站点名称 (建议使用仓库名): ', this.config.github?.repository || ''),
      site_url: await this.askQuestion('  站点URL (可选): ', ''),
      build_command: await this.askQuestion('  构建命令: ', 'hexo generate'),
      publish_directory: await this.askQuestion('  发布目录: ', 'public')
    };

    // Netlify Identity设置
    console.log('\n🔐 Netlify Identity配置:');
    this.config.identity = {
      registration_enabled: await this.askYesNo('  允许用户注册? (y/N): ', false),
      external_providers: await this.askQuestion('  外部登录提供商 (用逗号分隔, 如github,google): ', ''),
      git_gateway_enabled: true
    };

    // 管理员设置
    console.log('\n👤 管理员账户:');
    this.config.admin = {
      email: await this.askQuestion('  管理员邮箱: ', ''),
      name: await this.askQuestion('  管理员姓名: ', ''),
      role: 'admin'
    };

    // Git Gateway设置
    console.log('\n🌐 Git Gateway配置:');
    this.config.git_gateway = {
      branch: await this.askQuestion('  内容分支: ', 'main'),
      api_root: 'https://api.github.com',
      site_domain: this.config.netlify.site_url || `${this.config.netlify.site_name}.netlify.app`
    };
  }

  // 创建Netlify配置文件
  async createNetlifyConfig() {
    console.log('\n⚙️  创建Netlify配置文件...');
    
    // 更新现有的netlify.toml
    const netlifyTomlPath = 'netlify.toml';
    let netlifyConfig = '';
    
    if (fs.existsSync(netlifyTomlPath)) {
      netlifyConfig = fs.readFileSync(netlifyTomlPath, 'utf8');
    }

    // 添加Git Gateway配置
    const gitGatewayConfig = `
# Git Gateway 配置
[build.environment]
  NODE_VERSION = "18"
  NPM_VERSION = "9"

# Git Gateway 重定向
[[redirects]]
  from = "/.netlify/git/*"
  to = "/.netlify/git/:splat"
  status = 200

# Identity 服务重定向
[[redirects]]
  from = "/.netlify/identity/*"
  to = "/.netlify/identity/:splat"
  status = 200
`;

    // 如果配置中还没有Git Gateway配置，则添加
    if (!netlifyConfig.includes('Git Gateway')) {
      netlifyConfig += gitGatewayConfig;
    }

    fs.writeFileSync(netlifyTomlPath, netlifyConfig);
    console.log('  ✅ netlify.toml 已更新');

    // 创建Netlify CMS配置文件
    const cmsConfig = `
backend:
  name: git-gateway
  branch: ${this.config.git_gateway.branch}
  api_root: ${this.config.git_gateway.api_root}
  site_domain: ${this.config.git_gateway.site_domain}

publish_mode: editorial_workflow
media_folder: "source/images/uploads"
public_folder: "/images/uploads"

# 身份验证
site_url: ${this.config.netlify.site_url || `https://${this.config.netlify.site_name}.netlify.app`}
logo_url: /images/logo.png

# 编辑器配置
editor:
  preview: true

# 集合配置
collections:
  - name: "blog"
    label: "博客文章"
    folder: "source/_posts"
    create: true
    slug: "{{year}}-{{month}}-{{day}}-{{slug}}"
    fields:
      - {label: "标题", name: "title", widget: "string"}
      - {label: "发布日期", name: "date", widget: "datetime"}
      - {label: "标签", name: "tags", widget: "list", default: []}
      - {label: "分类", name: "categories", widget: "list", default: []}
      - {label: "摘要", name: "description", widget: "text", required: false}
      - {label: "封面图片", name: "cover", widget: "image", required: false}
      - {label: "内容", name: "body", widget: "markdown"}

  - name: "pages"
    label: "页面"
    folder: "source"
    create: true
    slug: "{{slug}}"
    fields:
      - {label: "标题", name: "title", widget: "string"}
      - {label: "发布日期", name: "date", widget: "datetime"}
      - {label: "内容", name: "body", widget: "markdown"}
`;

    fs.writeFileSync('admin/config.yml', cmsConfig);
    console.log('  ✅ admin/config.yml 已创建');
  }

  // 设置Git Gateway
  async setupGitGateway() {
    console.log('\n🌐 配置Git Gateway...');
    
    // 创建Git Gateway配置文件
    const gitGatewayConfig = {
      version: '1.0.0',
      git: {
        provider: 'github',
        repo: `${this.config.github.username}/${this.config.github.repository}`,
        branch: this.config.git_gateway.branch,
        api_root: this.config.git_gateway.api_root
      },
      identity: {
        enabled: true,
        registration_enabled: this.config.identity.registration_enabled,
        external_providers: this.config.identity.external_providers ? 
          this.config.identity.external_providers.split(',').map(p => p.trim()) : []
      },
      security: {
        roles: ['admin', 'editor', 'contributor'],
        permissions: {
          admin: ['read', 'write', 'delete'],
          editor: ['read', 'write'],
          contributor: ['read']
        }
      }
    };

    fs.writeFileSync('_config.git_gateway.yml', JSON.stringify(gitGatewayConfig, null, 2));
    console.log('  ✅ Git Gateway配置已创建');

    // 创建Netlify部署配置
    const deployConfig = {
      build: {
        command: this.config.netlify.build_command,
        publish: this.config.netlify.publish_directory,
        environment: {
          NODE_VERSION: '18',
          NPM_VERSION: '9'
        }
      },
      plugins: [
        {
          package: '@netlify/plugin-lighthouse',
          enabled: true
        }
      ],
      redirects: [
        {
          from: '/admin/*',
          to: '/admin/index.html',
          status: 200
        }
      ]
    };

    fs.writeFileSync('netlify-deploy-config.json', JSON.stringify(deployConfig, null, 2));
    console.log('  ✅ 部署配置已创建');
  }

  // 生成设置指南
  async generateSetupGuide() {
    console.log('\n📖 生成设置指南...');
    
    const setupGuide = `# Netlify CMS 设置指南

## 1. 创建Netlify账户

1. 访问 [Netlify官网](https://www.netlify.com/)
2. 点击 "Sign up" 注册新账户
3. 选择使用GitHub账户登录

## 2. 连接GitHub仓库

1. 登录Netlify后，点击 "New site from Git"
2. 选择 "GitHub" 作为Git提供商
3. 授权Netlify访问你的GitHub账户
4. 选择你的博客仓库: \`${this.config.github.username}/${this.config.github.repository}\`

## 3. 配置构建设置

在Netlify中配置以下构建设置：

- **Build command**: \`${this.config.netlify.build_command}\`
- **Publish directory**: \`${this.config.netlify.publish_directory}\`
- **Build environment variables**:
  - NODE_VERSION: 18
  - NPM_VERSION: 9

## 4. 启用Netlify Identity

1. 在Netlify控制台中，进入 "Site settings" > "Identity"
2. 点击 "Enable Identity"
3. 配置Identity设置：
   - Registration: ${this.config.identity.registration_enabled ? '开放注册' : '仅邀请注册'}
   - External providers: ${this.config.identity.external_providers || '无'}

## 5. 启用Git Gateway

1. 在Netlify控制台中，进入 "Site settings" > "Identity" > "Services"
2. 启用 "Git Gateway"
3. 配置Git Gateway：
   - Repository: \`${this.config.github.username}/${this.config.github.repository}\`
   - Branch: \`${this.config.git_gateway.branch}\`

## 6. 添加管理员账户

1. 在Netlify控制台中，进入 "Identity" 页面
2. 点击 "Invite users"
3. 输入管理员邮箱: \`${this.config.admin.email}\`
4. 设置角色为 "Admin"

## 7. 访问管理后台

1. 部署完成后，访问: \`https://${this.config.netlify.site_name}.netlify.app/admin/\`
2. 使用管理员账户登录
3. 开始管理你的博客内容！

## 8. 验证设置

完成设置后，请验证以下功能：

- [ ] 可以正常访问管理后台
- [ ] 可以创建和编辑文章
- [ ] 可以上传和管理媒体文件
- [ ] 内容变更可以正确提交到GitHub

## 故障排除

### 常见问题

1. **无法访问管理后台**
   - 检查Netlify Identity是否启用
   - 确认Git Gateway配置正确

2. **无法保存内容**
   - 检查GitHub仓库权限
   - 确认分支设置正确

3. **媒体文件上传失败**
   - 检查文件大小限制
   - 确认存储路径配置正确

### 支持联系

如果遇到问题，请联系支持团队或查看文档：
- [Netlify文档](https://docs.netlify.com/)
- [Netlify CMS文档](https://www.netlifycms.org/docs/)

---

生成时间: ${new Date().toLocaleString()}
`;

    fs.writeFileSync('NETLIFY_SETUP_GUIDE.md', setupGuide);
    console.log('  ✅ 设置指南已生成: NETLIFY_SETUP_GUIDE.md');

    // 创建快速设置脚本
    const quickSetupScript = `
#!/bin/bash
# Netlify CMS 快速设置脚本

echo "🚀 开始Netlify CMS设置..."

# 检查Node.js依赖
echo "📦 安装依赖..."
npm install

# 构建静态文件
echo "🏗️  构建静态文件..."
hexo generate

# 创建admin目录
echo "📁 创建管理目录..."
mkdir -p admin

# 下载Netlify CMS
echo "📥 下载Netlify CMS..."
curl -o admin/index.html https://unpkg.com/netlify-cms@^2.0.0/dist/netlify-cms.js

# 创建基本的index.html
cat > admin/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>内容管理 - Netlify CMS</title>
</head>
<body>
  <script src="https://unpkg.com/netlify-cms@^2.0.0/dist/netlify-cms.js"></script>
</body>
</html>
EOF

echo "✅ 快速设置完成！"
echo "下一步: 按照 NETLIFY_SETUP_GUIDE.md 中的步骤完成Netlify设置"
`;

    fs.writeFileSync('scripts/quick-setup.sh', quickSetupScript);
    console.log('  ✅ 快速设置脚本已创建: scripts/quick-setup.sh');
  }

  // 辅助方法
  askQuestion(prompt, defaultValue = '') {
    return new Promise((resolve) => {
      const question = defaultValue ? `${prompt} (${defaultValue}): ` : prompt;
      this.rl.question(question, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }

  askYesNo(prompt, defaultValue = false) {
    return new Promise((resolve) => {
      const defaultText = defaultValue ? 'Y/n' : 'y/N';
      this.rl.question(`${prompt} (${defaultText}): `, (answer) => {
        const response = answer.trim().toLowerCase();
        if (response === '') {
          resolve(defaultValue);
        } else {
          resolve(response === 'y' || response === 'yes');
        }
      });
    });
  }
}

// 运行设置向导
if (require.main === module) {
  const wizard = new NetlifySetupWizard();
  wizard.runSetup().catch(console.error);
}

module.exports = NetlifySetupWizard;