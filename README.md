# Trip English

一款面向英语基础较弱学习者的旅行英语口语小游戏。课程围绕意大利和瑞士旅行中的真实任务展开，目标不是追求复杂语法，而是帮助学习者敢开口、能独立完成关键交流。

## 功能

- 覆盖机场、酒店、火车、餐厅、问路、购物和紧急求助场景
- A1 起步校准与逐步减少提示的口语训练
- 在线语音识别，以及录音、回听和自我评价
- 无声阅读模式，适合公共场所练习
- 50 张离线急救句卡和 1,000 词离线词典
- 支持选中英文后朗读、查词和加入复习
- 学习进度保存在本机，支持备份与恢复
- 可安装到手机桌面，核心课程支持离线使用

## 隐私

Trip English 没有账号系统、应用服务器、广告或分析埋点。学习进度、收藏和录音保存在当前设备的浏览器中；录音只有在用户主动操作时才会创建。在线语音识别是否可用取决于浏览器和网络环境。

请注意：浏览器数据可能因清理网站数据或更换设备而丢失，建议定期在“进度”页下载备份。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm ci
npm run dev
```

常用检查命令：

```bash
npm run check
npm run test:e2e
```

构建生产版本：

```bash
npm run build
```

## 内容资产

- 离线词典基于固定版本的 [ECDICT](https://github.com/skywind3000/ECDICT) 生成。
- 英文示范使用浏览器/设备运行时语音合成，不在仓库中分发第三方语音录音。
- 第三方来源和许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

重新生成内容：

```bash
npm run content:dictionary
```

设备安装了可用英语语音时，运行时朗读通常也可离线使用；具体能力取决于浏览器和设备。

## 部署与手机安装

仓库已包含 GitHub Pages 工作流。发布前需要在仓库的 **Settings → Pages** 中选择 **GitHub Actions** 作为来源。

iPhone 安装和离线检查步骤见 [docs/iphone-install.md](docs/iphone-install.md)。

## 参与贡献

欢迎提交 Issue 或 Pull Request。新增课程内容时，请保持句子简短、任务导向，并避免加入真实姓名、联系方式、订单、证件号码或精确私人行程。

## License

[MIT](LICENSE) © 2026 lit99961-ctrl
