# glance-multisearch
> A search panel that uses an iframe to embed Glance and enhance its search functionality.

## 简介
一个搜索栏的网页，通过iframe引入glance中，作为挂件，可以扩展glance的搜索功能。

## 实现功能
1. 搜索历史记录（跨设备同步）
    - 下拉面板有“历史”页签，能看到你之前搜索过的词，历史不是存在浏览器里，而是存在你托管网页的服务器上（data/history.json）
    - 依靠“同步ID”，区分历史记录，页面下方的 ID 决定你读写哪一份历史


1. 清空/刷新历史
    - 下拉面板右侧有“刷新历史”“清空历史”

1. 联想
    - 联想下拉（输入时自动出现），你输入的时候会出现下拉面板
    - 下拉面板默认在“联想”页签
    - 联想来源是：外部引擎联想 + 你自己的历史匹配（历史也会混进去）

1. 搜索引擎切换
   - 顶部有“引擎”下拉框（Google / Bing / 百度 / DuckDuckGo / 搜狗 / 360…）选择哪个引擎，就跳转到哪个引擎的结果页
    - 这个引擎选择会记在浏览器本地（localStorage），下次打开还保持你上次选的

1. 快捷翻译按钮

## 用法





